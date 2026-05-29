import { spawn, execFile, type ChildProcess } from 'child_process'
import { mkdir, writeFile, readFile, chown, access, chmod } from 'fs/promises'
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
    const { directory, configPath } = options

    const existing = this.instances.get(directory)
    if (existing && existing.status === 'ready') {
      this.cancelIdleTimer(existing)
      existing.refCount++
      existing.lastActivity = new Date()
      console.log(`[LiteLLM] Reusing instance for ${directory} on port ${existing.port} (refCount: ${existing.refCount})`)
      return existing.url
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

    const startPromise = this.startInstance(directory, configPath)
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

  private async startInstance(directory: string, configPath: string): Promise<LiteLLMInstance> {
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

    // Spawn LiteLLM with the generated config
    const child = spawn(litellmPath, [
      '--config', configPath,
      '--port', String(port),
      '--detailed_debug',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      cwd: isolatedConfigDir,
      env: (() => {
        // Strip DATABASE_URL and any other AuroraCraft env vars that
        // might confuse LiteLLM into thinking a database is configured.
        const env = { ...process.env }
        delete env.DATABASE_URL
        delete env.DATABASE_CONNECTION_POOL_URL
        delete env.POSTGRES_URL
        delete env.POSTGRES_PRISMA_URL
        env.PYTHONUNBUFFERED = '1'
        return env
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
    // Give extra time (60s) because LiteLLM may need to load models
    // and initialize the HTTP server after printing the banner.
    const ready = await this.waitForReady(url, 60_000, masterKey)
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

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${url}/health`, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(10000),
        })
        if (res.ok) return true
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, pollInterval))
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
