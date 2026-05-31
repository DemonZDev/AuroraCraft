import { spawn, type ChildProcess, execFileSync } from 'child_process'
import { Readable } from 'stream'

interface KiroExecution {
  process: ChildProcess
  stdout: ReadableStream
  stderr: ReadableStream
}

function escapeForSingleQuotes(str: string): string {
  // Replace ' with '\'' (end quote, escaped quote, start quote)
  return str.replace(/'/g, "'\\''")
}

export class KiroProcessManager {
  private processes = new Map<string, ChildProcess>()

  execute(
    directory: string,
    prompt: string,
    username: string,
    signal?: AbortSignal,
    model?: string,
  ): KiroExecution {
    console.log(`[KiroProcess] execute() called with directory: ${directory}`)
    const sessionId = crypto.randomUUID()
    const escapedPrompt = escapeForSingleQuotes(prompt)
    const systemUser = `auroracraft-${username.toLowerCase()}`
    const homeDir = `/home/${systemUser}`

    // Create directory if it doesn't exist - MUST happen before file watcher starts
    try {
      console.log(`[KiroProcess] Creating directory: ${directory}`)
      execFileSync('sudo', ['mkdir', '-p', directory], { stdio: 'pipe' })
      execFileSync('sudo', ['chown', '-R', `${systemUser}:${systemUser}`, directory], { stdio: 'pipe' })
      console.log(`[KiroProcess] Directory created and chowned: ${directory}`)
    } catch (err: any) {
      console.error(`[KiroProcess] Failed to create/chown ${directory}:`, err.message)
      if (err.stderr) console.error(`[KiroProcess] stderr:`, err.stderr.toString())
    }

    const modelFlag = model ? ` --model '${escapeForSingleQuotes(model)}'` : ''
    // Always use --resume to continue the most recent session in this directory
    const kiroCmd = `kiro-cli chat --no-interactive --trust-all-tools --resume${modelFlag} '${escapedPrompt}'`
    const command = `cd '${escapeForSingleQuotes(directory)}' && ${kiroCmd}`

    console.log(`[KiroProcess] Spawning kiro-cli for session ${sessionId} (user: ${systemUser}, dir: ${directory}, using --resume)`)

    const child = spawn('sudo', ['runuser', '-l', systemUser, '-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    this.processes.set(sessionId, child)

    child.on('error', (err) => {
      console.error(`[KiroProcess] Process error for session ${sessionId}:`, err.message)
      this.processes.delete(sessionId)
    })

    child.on('exit', (code, sig) => {
      console.log(`[KiroProcess] Process exited for session ${sessionId} (code: ${code}, signal: ${sig})`)
      this.processes.delete(sessionId)
    })

    if (signal) {
      const onAbort = () => {
        console.log(`[KiroProcess] Abort signal received for session ${sessionId}`)
        this.cancel(sessionId)
      }

      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
        child.on('exit', () => {
          signal.removeEventListener('abort', onAbort)
        })
      }
    }

    const stdout = Readable.toWeb(child.stdout!) as ReadableStream
    const stderr = Readable.toWeb(child.stderr!) as ReadableStream

    return { process: child, stdout, stderr }
  }

  cancel(sessionId: string): void {
    const child = this.processes.get(sessionId)
    if (!child) {
      console.log(`[KiroProcess] No active process found for session ${sessionId}`)
      return
    }

    console.log(`[KiroProcess] Cancelling process for session ${sessionId} (SIGTERM)`)

    try {
      child.kill('SIGTERM')
    } catch {
      /* already dead */
    }

    const forceKill = setTimeout(() => {
      if (this.processes.has(sessionId)) {
        console.log(`[KiroProcess] Force killing process for session ${sessionId} (SIGKILL)`)
        try {
          child.kill('SIGKILL')
        } catch {
          /* already dead */
        }
        this.processes.delete(sessionId)
      }
    }, 5000)

    child.on('exit', () => {
      clearTimeout(forceKill)
      this.processes.delete(sessionId)
    })
  }

  isActive(sessionId: string): boolean {
    return this.processes.has(sessionId)
  }

  shutdown(): void {
    console.log(`[KiroProcess] Shutting down all Kiro processes (${this.processes.size} active)`)

    for (const [sessionId, child] of this.processes) {
      console.log(`[KiroProcess] Killing process for session ${sessionId}`)
      try {
        child.kill('SIGTERM')
      } catch {
        /* already dead */
      }

      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* already dead */
        }
      }, 5000)
    }

    this.processes.clear()
  }
}

export const kiroProcessManager = new KiroProcessManager()
