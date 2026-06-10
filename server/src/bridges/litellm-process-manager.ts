import { spawn, execFile, type ChildProcess } from 'child_process'
import { mkdir, writeFile, readFile, chown, access, chmod } from 'fs/promises'
import { createHash } from 'crypto'
import { constants } from 'fs'
import { promisify } from 'util'
import { env } from '../env.js'
import { getProjectConfigDirectory } from '../utils/provider-config.js'

const execFileAsync = promisify(execFile)

interface LiteLLMInstance {
  process: ChildProcess
  port: number
  url: string
  directory: string
  refCount: number
  lastActivity: Date
  status: 'starting' | 'ready' | 'stopping' | 'stopped'
  idleTimer?: ReturnType<typeof setTimeout>
  // Hash of the config the proxy was started with; a change forces a reload restart.
  configHash: string
}

// ── User ID resolution (cached) ─────────────────────────────────────

const userIdCache = new Map<string, { uid: number; gid: number }>()

async function resolveUserIds(username: string): Promise<{ uid: number; gid: number }> {
  const cached = userIdCache.get(username)
  if (cached) return cached

  const [uidRes, gidRes] = await Promise.all([
    execFileAsync('id', ['-u', username]),
    execFileAsync('id', ['-g', username]),
  ])
  const uid = parseInt(uidRes.stdout.trim(), 10)
  const gid = parseInt(gidRes.stdout.trim(), 10)
  if (!Number.isFinite(uid) || !Number.isFinite(gid)) {
    throw new Error(`Could not resolve uid/gid for user ${username}`)
  }
  const result = { uid, gid }
  userIdCache.set(username, result)
  return result
}

// ── Process Manager ───────────────────────────────────────────────────

export interface LiteLLMAcquireOptions {
  directory: string
  configPath: string
  userId?: string
}

export class LiteLLMProcessManager {
  private instances = new Map<string, LiteLLMInstance>()
  private startPromises = new Map<string, Promise<LiteLLMInstance>>()
  private usedPorts = new Set<number>()
  private portMin: number
  private portMax: number
  private idleTimeoutMs: number
  private readonly STARTUP_TIMEOUT_MS = 45_000

  constructor() {
    this.portMin = env.LITELLM_PORT_MIN
    this.portMax = env.LITELLM_PORT_MAX
    this.idleTimeoutMs = env.LITELLM_IDLE_TIMEOUT
  }

  async acquire(options: LiteLLMAcquireOptions): Promise<string> {
    const { directory, configPath, userId } = options

    // Hash the config so we can detect when the routing key-set / pricing changed
    // (e.g. a key exhausted and dropped out) and restart the warm proxy to load it.
    let configHash = ''
    try { configHash = createHash('sha256').update(await readFile(configPath, 'utf8')).digest('hex') } catch { /* ignore */ }

    const existing = this.instances.get(directory)
    if (existing && existing.status === 'ready') {
      if (existing.configHash === configHash) {
        this.cancelIdleTimer(existing)
        existing.refCount++
        existing.lastActivity = new Date()
        console.log(`[LiteLLM] Reusing instance for ${directory} on port ${existing.port} (refCount: ${existing.refCount})`)
        return existing.url
      }
      console.log(`[LiteLLM] Config changed for ${directory} — restarting proxy to load new routing`)
      await this.stopInstance(directory)
    }

    const pending = this.startPromises.get(directory)
    if (pending) {
      console.log(`[LiteLLM] Waiting for pending start for ${directory}`)
      const instance = await pending
      instance.refCount++
      instance.lastActivity = new Date()
      this.cancelIdleTimer(instance)
      return instance.url
    }

    const startPromise = this.startInstance(directory, configPath, userId, configHash)
    this.startPromises.set(directory, startPromise)

    try {
      const instance = await startPromise
      instance.refCount++
      return instance.url
    } finally {
      this.startPromises.delete(directory)
    }
  }

  async release(directory: string): Promise<void> {
    const instance = this.instances.get(directory)
    if (!instance) return

    instance.refCount = Math.max(0, instance.refCount - 1)
    instance.lastActivity = new Date()
    console.log(`[LiteLLM] Released instance for ${directory} (refCount: ${instance.refCount})`)

    if (instance.refCount === 0) {
      this.scheduleIdleShutdown(instance, directory)
    }
  }

  getInstanceUrl(directory: string): string | null {
    const instance = this.instances.get(directory)
    if (instance && instance.status === 'ready') {
      return instance.url
    }
    return null
  }

  async shutdown(): Promise<void> {
    console.log(`[LiteLLM] Shutting down all instances (${this.instances.size} active)`)

    const stopPromises: Promise<void>[] = []
    for (const [directory] of this.instances) {
      stopPromises.push(this.stopInstance(directory))
    }
    await Promise.allSettled(stopPromises)
    this.instances.clear()
    this.usedPorts.clear()
    this.startPromises.clear()
  }

  async forceStop(directory: string): Promise<void> {
    return this.stopInstance(directory)
  }

  private allocatePort(): number {
    for (let port = this.portMin; port <= this.portMax; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port)
        return port
      }
    }
    throw new Error(`No available LiteLLM ports in range ${this.portMin}-${this.portMax}. All ${this.portMax - this.portMin + 1} ports are in use.`)
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port)
  }

  private async startInstance(directory: string, configPath: string, userId?: string, configHash = ''): Promise<LiteLLMInstance> {
    const port = this.allocatePort()
    const url = `http://localhost:${port}`

    console.log(`[LiteLLM] Starting for ${directory} on port ${port} with config ${configPath}`)

    const litellmPath = '/var/lib/litellm/shared/venv/bin/litellm'

    // Ensure config directory exists and is accessible
    const isolatedConfigDir = getProjectConfigDirectory(directory)
    await mkdir(isolatedConfigDir, { recursive: true })

    // Read the master key for health-check authentication
    let masterKey: string | undefined
    try {
      const keyFile = `${isolatedConfigDir}/.litellm-master-key`
      const keyData = await readFile(keyFile, 'utf8')
      if (keyData.trim().startsWith('sk-litellm-')) {
        masterKey = keyData.trim()
      }
    } catch {
      // No key file — health checks without auth will fail if master_key is set
    }

    // Spawn LiteLLM with the generated config. No --detailed_debug: it emits dozens of
    // "is callback X disabled" DEBUG lines PER request (and a verbose startup), which both
    // slows the proxy and floods the logs. Default INFO logging + the meter's own prints
    // are enough; set LITELLM_LOG=DEBUG in env temporarily if deep tracing is needed.
    const child = spawn(litellmPath, [
      '--config', configPath,
      '--port', String(port),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      cwd: isolatedConfigDir,
      env: (() => {
        // Strip DATABASE_URL and any other AuroraCraft env vars that
        // might confuse LiteLLM into thinking a database is configured.
        const childEnv: NodeJS.ProcessEnv = { ...process.env }
        delete childEnv.DATABASE_URL
        delete childEnv.DATABASE_CONNECTION_POOL_URL
        delete childEnv.POSTGRES_URL
        delete childEnv.POSTGRES_PRISMA_URL
        childEnv.PYTHONUNBUFFERED = '1'
        // Use the bundled model-cost map instead of fetching it from GitHub on every
        // cold start. LiteLLM otherwise blocks for ~40s downloading
        // model_prices_and_context_window.json before the proxy answers /health — and we
        // don't need it at all, since per-deployment pricing + the aurora meter do the
        // billing. This is the dominant cold-start cost for the first agent message.
        childEnv.LITELLM_LOCAL_MODEL_COST_MAP = 'True'
        // Real-time meter identity (read by aurora_litellm_callback.py). One proxy
        // == one project == one user, so these stay valid across warm reuse.
        if (userId) childEnv.AURORA_USER_ID = userId
        childEnv.AURORA_PROJECT_DIR = directory
        childEnv.AURORA_CALLBACK_BASE = `http://127.0.0.1:${env.PORT}`
        childEnv.AURORA_INTERNAL_SECRET = env.LITELLM_INTERNAL_SECRET ?? env.SESSION_SECRET
        return childEnv
      })()
    })

    const instance: LiteLLMInstance = {
      process: child,
      port,
      url,
      directory,
      refCount: 0,
      lastActivity: new Date(),
      status: 'starting',
      configHash,
    }

    this.instances.set(directory, instance)

    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[LiteLLM:${port}] ${data.toString().trim()}`)
    })

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[LiteLLM:${port}] ${data.toString().trim()}`)
    })

    child.on('error', (err) => {
      console.error(`[LiteLLM] Process error for ${directory}:`, err.message)
      this.cleanupInstance(directory, instance)
    })

    child.on('exit', (code, signal) => {
      console.log(`[LiteLLM] Process exited for ${directory} (code: ${code}, signal: ${signal})`)
      this.cleanupInstance(directory, instance)
    })

    // Wait for LiteLLM to be ready (it exposes /health endpoint).
    // Model validation during startup can take 40-55s — give ample time.
    const ready = await this.waitForReady(url, 90_000, masterKey)
    if (!ready) {
      console.error(`[LiteLLM] Failed to bind within 60s on port ${port}`)
      await this.stopInstance(directory)
      throw new Error(`LiteLLM failed to start for ${directory}. Check config at ${configPath}`)
    }

    await new Promise((r) => setTimeout(r, 500))
    if (instance.status === 'stopped') {
      throw new Error(`LiteLLM process exited shortly after becoming ready for ${directory}`)
    }

    instance.status = 'ready'
    console.log(`[LiteLLM] Ready for ${directory} on port ${port}`)
    return instance
  }

  private async stopInstance(directory: string): Promise<void> {
    const instance = this.instances.get(directory)
    if (!instance) return

    instance.status = 'stopping'
    this.cancelIdleTimer(instance)

    console.log(`[LiteLLM] Stopping instance for ${directory} on port ${instance.port}`)

    const child = instance.process

    try {
      child.kill('SIGTERM')

      await new Promise<void>((resolve) => {
        const forceKill = setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch { /* already dead */ }
          resolve()
        }, 5000)

        child.on('exit', () => {
          clearTimeout(forceKill)
          resolve()
        })
      })
    } catch {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
    }

    this.cleanupInstance(directory, instance)
  }

  private cleanupInstance(directory: string, instance: LiteLLMInstance): void {
    if (instance.status === 'stopped') return
    instance.status = 'stopped'
    this.cancelIdleTimer(instance)
    this.releasePort(instance.port)
    this.instances.delete(directory)
    console.log(`[LiteLLM] Cleaned up instance for ${directory} (port ${instance.port} released)`)
  }

  private async waitForReady(url: string, timeoutMs: number, apiKey?: string): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    const pollInterval = 500
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    let firstResponseAt: number | undefined
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${url}/health`, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(15000),
        })
        if (!firstResponseAt) firstResponseAt = Date.now()
        if (res.ok) {
          if (firstResponseAt) {
            console.log(`[LiteLLM] Health check passed after ${((Date.now() - (deadline - timeoutMs)) / 1000).toFixed(1)}s`)
          }
          return true
        }
      } catch {
        // Not ready yet — connection refused or timeout
      }
      await new Promise((r) => setTimeout(r, pollInterval))
    }
    if (firstResponseAt) {
      console.log(`[LiteLLM] Health endpoint responded but never returned 200 within ${timeoutMs / 1000}s`)
    }
    return false
  }

  private scheduleIdleShutdown(instance: LiteLLMInstance, directory: string): void {
    this.cancelIdleTimer(instance)
    console.log(`[LiteLLM] Scheduling idle shutdown for ${directory} in ${this.idleTimeoutMs / 1000}s`)

    instance.idleTimer = setTimeout(() => {
      if (instance.refCount === 0 && instance.status === 'ready') {
        console.log(`[LiteLLM] Idle timeout reached for ${directory} — stopping`)
        this.stopInstance(directory).catch((err) => {
          console.error(`[LiteLLM] Error stopping idle instance for ${directory}:`, err)
        })
      }
    }, this.idleTimeoutMs)
  }

  private cancelIdleTimer(instance: LiteLLMInstance): void {
    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer)
      instance.idleTimer = undefined
    }
  }
}

export const litellmProcessManager = new LiteLLMProcessManager()
