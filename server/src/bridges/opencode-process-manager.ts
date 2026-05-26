import { spawn, type ChildProcess, execFile } from 'child_process'
import { mkdir, writeFile, chown } from 'fs/promises'
import { promisify } from 'util'
import { env } from '../env.js'

const execFileAsync = promisify(execFile)

interface OpenCodeInstance {
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

// Recursive chown via the `chown` binary — avoids stdin-based hangs that can
// plague `sudo tee` / `execFile` with stdin, and is faster than walking the tree in JS.
async function chownRecursive(path: string, uid: number, gid: number): Promise<void> {
  await execFileAsync('chown', ['-R', `${uid}:${gid}`, path])
}

// Escape a string for safe embedding inside single quotes in a POSIX shell.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// ── Process Manager ─────────────────────────────────────────────────

export class OpenCodeProcessManager {
  private instances = new Map<string, OpenCodeInstance>()
  private startPromises = new Map<string, Promise<OpenCodeInstance>>()
  private usedPorts = new Set<number>()
  private portMin: number
  private portMax: number
  private idleTimeoutMs: number
  // Hard timeout on the entire startup path. Any longer and we assume a hang
  // and tear everything down so startPromises can never deadlock the bridge.
  private readonly STARTUP_TIMEOUT_MS = 45_000

  constructor() {
    this.portMin = env.OPENCODE_PORT_MIN
    this.portMax = env.OPENCODE_PORT_MAX
    this.idleTimeoutMs = env.OPENCODE_IDLE_TIMEOUT
  }

  async acquire(directory: string): Promise<string> {
    const existing = this.instances.get(directory)
    if (existing && existing.status === 'ready') {
      this.cancelIdleTimer(existing)
      existing.refCount++
      existing.lastActivity = new Date()
      console.log(`[ProcessManager] Reusing OpenCode instance for ${directory} on port ${existing.port} (refCount: ${existing.refCount})`)
      return existing.url
    }

    const pending = this.startPromises.get(directory)
    if (pending) {
      console.log(`[ProcessManager] Waiting for pending OpenCode start for ${directory}`)
      const instance = await pending
      instance.refCount++
      instance.lastActivity = new Date()
      this.cancelIdleTimer(instance)
      return instance.url
    }

    const startPromise = this.startInstance(directory)
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
    console.log(`[ProcessManager] Released OpenCode instance for ${directory} (refCount: ${instance.refCount})`)

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
    console.log(`[ProcessManager] Shutting down all OpenCode instances (${this.instances.size} active)`)

    const stopPromises: Promise<void>[] = []
    for (const [directory] of this.instances) {
      stopPromises.push(this.stopInstance(directory))
    }
    await Promise.allSettled(stopPromises)
    this.instances.clear()
    this.usedPorts.clear()
    this.startPromises.clear()
  }

  private allocatePort(): number {
    for (let port = this.portMin; port <= this.portMax; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port)
        return port
      }
    }
    throw new Error(`No available ports in range ${this.portMin}-${this.portMax}. All ${this.portMax - this.portMin + 1} ports are in use.`)
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port)
  }

  /**
   * Start an OpenCode instance with a hard timeout. If startup exceeds
   * STARTUP_TIMEOUT_MS, any partial state (spawned process, allocated port,
   * registered instance) is torn down and the promise rejects. This guarantees
   * a hung startup can never permanently deadlock the bridge.
   */
  private startInstance(directory: string): Promise<OpenCodeInstance> {
    // Tracked resources so the timeout handler can clean up partial state
    const state: { port: number | null; child: ChildProcess | null; settled: boolean } = {
      port: null,
      child: null,
      settled: false,
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        if (state.settled) return
        console.error(`[ProcessManager] OpenCode startup timed out after ${this.STARTUP_TIMEOUT_MS}ms for ${directory}`)
        if (state.child) {
          try { state.child.kill('SIGKILL') } catch { /* ignore */ }
        }
        const partial = this.instances.get(directory)
        if (partial) {
          this.cleanupInstance(directory, partial)
        } else if (state.port !== null) {
          // cleanupInstance was not called (instance never registered) — release port directly
          this.releasePort(state.port)
        }
        reject(new Error(
          `OpenCode failed to start within ${this.STARTUP_TIMEOUT_MS / 1000}s for ${directory}. ` +
          `Ensure 'opencode' is installed and accessible.`,
        ))
      }, this.STARTUP_TIMEOUT_MS)
    })

    const startPromise = this.startInstanceInternal(directory, state)

    return Promise.race([startPromise, timeoutPromise]).finally(() => {
      state.settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
    })
  }

  private async startInstanceInternal(
    directory: string,
    state: { port: number | null; child: ChildProcess | null; settled: boolean },
  ): Promise<OpenCodeInstance> {
    const port = this.allocatePort()
    state.port = port
    const url = `http://localhost:${port}`

    console.log(`[ProcessManager] Starting OpenCode for ${directory} on port ${port}`)

    // Extract username from directory path: /home/auroracraft-{username}/{project}
    const match = directory.match(/\/home\/auroracraft-([^/]+)/)
    const username = match ? match[1] : null
    const systemUser = username ? `auroracraft-${username}` : null

    // Prepare project directory + config files using native fs.
    // The server runs as root so we don't need sudo (previous `sudo tee` hung indefinitely).
    if (systemUser) {
      try {
        const { uid, gid } = await resolveUserIds(systemUser)

        // Create project directory and chown to owner
        await mkdir(directory, { recursive: true })
        await chownRecursive(directory, uid, gid)

        const configContent = JSON.stringify({
          $schema: 'https://opencode.ai/config.json',
          permission: 'allow',
          tools: { question: false },
        }, null, 2)

        // User-level config: /home/{user}/.config/opencode/opencode.json
        const userConfigDir = `/home/${systemUser}/.config/opencode`
        const userConfigPath = `${userConfigDir}/opencode.json`
        await mkdir(userConfigDir, { recursive: true })
        await writeFile(userConfigPath, configContent, 'utf8')
        await chownRecursive(`/home/${systemUser}/.config/opencode`, uid, gid)

        // Project-level config: {directory}/opencode.json
        const projectConfigPath = `${directory}/opencode.json`
        await writeFile(projectConfigPath, configContent, 'utf8')
        await chown(projectConfigPath, uid, gid)
      } catch (err) {
        console.warn(`[ProcessManager] Failed to prepare ${directory}:`, err instanceof Error ? err.message : err)
      }
    } else {
      await mkdir(directory, { recursive: true })
    }

    // Bail out if the outer timeout already fired — don't proceed to spawning.
    if (state.settled) {
      throw new Error('OpenCode startup was aborted')
    }

    // Spawn OpenCode as the project owner using runuser -l (consistent with the Kiro bridge).
    // runuser -l resets env, so OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS must be set in the
    // shell command itself rather than via spawn's `env` option.
    // IMPORTANT: The binary must be in a path accessible to all system users (e.g. /usr/local/share/nvm),
    // NOT in a user-specific home directory (e.g. /home/codespace/nvm) which other users cannot access.
    const opencodePath = '/usr/local/share/nvm/current/bin/opencode'

    let child: ChildProcess
    if (systemUser) {
      const shellCmd =
        `cd ${shellQuote(directory)} && ` +
        `OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS=true ` +
        `${shellQuote(opencodePath)} serve --port ${port}`

      // runuser -l resets the environment to a clean login shell, so any env
      // passed here is discarded. Env vars needed by opencode are set inside
      // the shell command itself (e.g. OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS).
      child = spawn('sudo', ['runuser', '-l', systemUser, '-c', shellCmd], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })
    } else {
      child = spawn(opencodePath, ['serve', '--port', String(port)], {
        cwd: directory,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
          OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS: 'true',
          PATH: process.env.PATH,
        },
      })
    }
    state.child = child

    // Timeout may have fired between config prep and spawn completing; bail out
    // BEFORE registering the instance so no zombie entry is left in the map.
    if (state.settled) {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
      throw new Error('OpenCode startup was aborted')
    }

    const instance: OpenCodeInstance = {
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
      console.log(`[OpenCode:${port}] ${data.toString().trim()}`)
    })

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[OpenCode:${port}] ${data.toString().trim()}`)
    })

    child.on('error', (err) => {
      console.error(`[ProcessManager] OpenCode process error for ${directory}:`, err.message)
      this.cleanupInstance(directory, instance)
    })

    child.on('exit', (code, signal) => {
      console.log(`[ProcessManager] OpenCode process exited for ${directory} (code: ${code}, signal: ${signal})`)
      this.cleanupInstance(directory, instance)
    })

    const ready = await this.waitForReady(url, 30_000)
    if (!ready) {
      console.error(`[ProcessManager] OpenCode failed to bind within 30s on port ${port}`)
      await this.stopInstance(directory)
      throw new Error(`OpenCode failed to start for ${directory}. Make sure 'opencode' is installed and accessible.`)
    }

    // Bail out if the outer timeout fired while waiting for readiness.
    if (state.settled) {
      this.cleanupInstance(directory, instance)
      throw new Error('OpenCode startup was aborted')
    }

    // Post-ready stabilization: guard against processes that bind briefly then exit.
    await new Promise((r) => setTimeout(r, 500))
    if (instance.status === 'stopped') {
      throw new Error(`OpenCode process exited shortly after becoming ready for ${directory}`)
    }

    // Final abort check before publishing the instance as ready.
    if (state.settled) {
      this.cleanupInstance(directory, instance)
      throw new Error('OpenCode startup was aborted')
    }

    instance.status = 'ready'
    console.log(`[ProcessManager] OpenCode ready for ${directory} on port ${port}`)
    return instance
  }

  private async stopInstance(directory: string): Promise<void> {
    const instance = this.instances.get(directory)
    if (!instance) return

    instance.status = 'stopping'
    this.cancelIdleTimer(instance)

    console.log(`[ProcessManager] Stopping OpenCode for ${directory} on port ${instance.port}`)

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

  private cleanupInstance(directory: string, instance: OpenCodeInstance): void {
    if (instance.status === 'stopped') return
    instance.status = 'stopped'
    this.cancelIdleTimer(instance)
    this.releasePort(instance.port)
    this.instances.delete(directory)
    console.log(`[ProcessManager] Cleaned up instance for ${directory} (port ${instance.port} released)`)
  }

  private async waitForReady(url: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    const pollInterval = 500

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${url}/session`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) return true
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, pollInterval))
    }
    return false
  }

  private scheduleIdleShutdown(instance: OpenCodeInstance, directory: string): void {
    this.cancelIdleTimer(instance)
    console.log(`[ProcessManager] Scheduling idle shutdown for ${directory} in ${this.idleTimeoutMs / 1000}s`)

    instance.idleTimer = setTimeout(() => {
      if (instance.refCount === 0 && instance.status === 'ready') {
        console.log(`[ProcessManager] Idle timeout reached for ${directory} — stopping`)
        this.stopInstance(directory).catch((err) => {
          console.error(`[ProcessManager] Error stopping idle instance for ${directory}:`, err)
        })
      }
    }, this.idleTimeoutMs)
  }

  private cancelIdleTimer(instance: OpenCodeInstance): void {
    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer)
      instance.idleTimer = undefined
    }
  }
}

export const processManager = new OpenCodeProcessManager()
