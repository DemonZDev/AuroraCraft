import type { FastifyInstance } from 'fastify'
import { db } from '../db'
import { users } from '../db/schema/users'
import { projects } from '../db/schema/projects'
import { codeReviews } from '../db/schema/code-reviews'
import { eq, and, desc, or, sql } from 'drizzle-orm'
import { authMiddleware, adminGuard } from '../middleware/auth'
import { access, readdir, unlink, rm, readFile } from 'fs/promises'
import { join } from 'path'

declare global {
  // eslint-disable-next-line no-var
  var coderabbitLoginProcesses: Record<string, { userHome: string; sessionName: string; logFile: string }> | undefined
}

/**
 * Read the line-delimited JSON emitted by `coderabbit auth login --agent`, captured
 * to a logfile via `tmux pipe-pane`. Strips carriage returns + ANSI/OSC escape codes
 * and returns every parseable JSON object, in order.
 *
 * Reading from the logfile (not the live pane) is essential: in --agent mode the CLI
 * EXITS immediately after it processes the pasted callback, so `tmux capture-pane`
 * would fail with "can't find pane" and we would lose the terminal success/error JSON.
 */
async function readAgentJson(logFile: string): Promise<any[]> {
  let raw = ''
  try {
    raw = await readFile(logFile, 'utf8')
  } catch {
    return []
  }
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences (e.g. hyperlinks)
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI / color sequences
        .trim()
    )
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

async function cleanupCoderabbitCache(userHome: string) {
  const dirs = [
    join(userHome, '.coderabbit', 'reviews'),
    join(userHome, '.coderabbit', 'logs'),
  ]
  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const entryPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await rm(entryPath, { recursive: true, force: true })
        } else {
          await unlink(entryPath)
        }
      }
    } catch {
    }
  }
}

async function resolveCoderabbitPath(userHome: string): Promise<string | null> {
  const systemWide = '/usr/local/bin/coderabbit'
  const userLocal = `${userHome}/.local/bin/coderabbit`
  try {
    await access(systemWide)
    return systemWide
  } catch {
    try {
      await access(userLocal)
      return userLocal
    } catch {
      return null
    }
  }
}

export default async function coderabbitRoutes(app: FastifyInstance) {
  const paidCheck = (request: any, reply: any) => {
    const userTier = (request as any).user?.tier ?? 'free'
    if (userTier === 'free') {
      reply.status(403).send({ error: 'Code review requires a paid subscription. Upgrade to enable automated code review with CodeRabbit.', statusCode: 403 })
      return false
    }
    return true
  }

  // Admin: Initiate CodeRabbit login
  app.post('/api/admin/users/:id/coderabbit/initiate', { preHandler: [authMiddleware, adminGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!user) {
      reply.status(404).send({ error: 'User not found' }); return
    }

    const userHome = `/home/auroracraft-${user.username.toLowerCase()}`
    const sessionName = `coderabbit-${id}`
    const logFile = `/tmp/aurora-coderabbit-auth-${id}.log`

    try {
      const { promisify } = await import('util')
      const { exec } = await import('child_process')
      const execAsync = promisify(exec)

      // Check tmux availability first
      try {
        await execAsync('which tmux')
      } catch {
        app.log.error('tmux is not installed on the server')
        reply.status(500).send({ error: 'tmux is not installed. Please install tmux first.' }); return
      }

      // Ensure user home directory exists
      await execAsync(`mkdir -p ${userHome}`)
      await execAsync(`chown -R auroracraft-${user.username.toLowerCase()}:auroracraft-${user.username.toLowerCase()} ${userHome} 2>/dev/null || true`)

      const coderabbitPath = await resolveCoderabbitPath(userHome)
      if (!coderabbitPath) {
        const msg = 'CodeRabbit CLI is not installed. Please install it system-wide via: curl -fsSL https://cli.coderabbit.ai/install.sh | CODERABBIT_INSTALL_DIR=/usr/local/bin sh'
        app.log.error(msg)
        reply.status(500).send({ error: msg }); return
      }
      app.log.info(`Using CodeRabbit CLI: ${coderabbitPath}`)

      // Fresh start: tmux server up, no stale session, no stale logfile
      await execAsync(`tmux start-server 2>/dev/null || true`)
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`)
      await rm(logFile, { force: true }).catch(() => {})

      // Start the OAuth login in --agent mode. Unlike the interactive flow (which
      // renders the URL as an OSC 8 hyperlink and prompts on a TTY), --agent emits a
      // clean line-delimited JSON status stream we can parse deterministically:
      //   starting_login → awaiting_browser_auth {authUrl, fallbackAuthUrl} → ...
      try {
        await execAsync(`tmux new-session -d -s ${sessionName} -x 220 -y 50 "HOME=${userHome} ${coderabbitPath} auth login --agent"`)
      } catch (tmuxErr: any) {
        app.log.error({ err: tmuxErr }, 'Failed to create tmux session')
        reply.status(500).send({ error: `Failed to start authentication session: ${tmuxErr.message || 'tmux error'}` }); return
      }

      // Mirror the pty stream to a logfile. This is required (not just convenient):
      // in --agent mode the CLI process exits the instant it finishes processing the
      // pasted callback, so the tmux pane disappears and capture-pane stops working —
      // the logfile is the only place the terminal success/error JSON survives.
      await execAsync(`tmux pipe-pane -o -t ${sessionName} "cat >> ${logFile}"`)
      await execAsync(`chmod 600 ${logFile} 2>/dev/null || true`)

      // Poll the JSON stream for the awaiting_browser_auth status carrying the URLs.
      const maxAttempts = 8
      const delayMs = 1500
      let loginUrl: string | null = null

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, delayMs))

        const objs = await readAgentJson(logFile)

        const errObj = objs.find((o: any) => o.type === 'error')
        if (errObj) {
          await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`)
          await rm(logFile, { force: true }).catch(() => {})
          app.log.error({ errObj }, 'CodeRabbit login failed during initiation')
          reply.status(500).send({ error: errObj.message || 'CodeRabbit failed to start the login flow. Please try again.' }); return
        }

        const awaiting = objs.find((o: any) => o.status === 'awaiting_browser_auth')
        if (awaiting && (awaiting.fallbackAuthUrl || awaiting.authUrl)) {
          // Prefer fallbackAuthUrl (redirect_uri=coderabbit-cli://auth-callback): this is
          // the headless copy-paste flow — the browser page shows a callback string to
          // copy. authUrl uses redirect_uri=http://127.0.0.1:<port>/callback, a localhost
          // server on THIS machine that an admin's remote browser can never reach.
          loginUrl = awaiting.fallbackAuthUrl || awaiting.authUrl
          app.log.info({ attempt }, 'Captured CodeRabbit login URL')
          break
        }

        app.log.info({ attempt, objectsSeen: objs.length }, 'Login URL not yet visible, retrying...')
      }

      if (!loginUrl) {
        await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`)
        await rm(logFile, { force: true }).catch(() => {})
        app.log.error('No login URL found in agent JSON output after all retries')
        reply.status(500).send({ error: 'CodeRabbit CLI did not produce a login URL within the expected time. Please try again.' }); return
      }

      // Store session info (logFile included so /complete can read the terminal status)
      global.coderabbitLoginProcesses = global.coderabbitLoginProcesses || {}
      global.coderabbitLoginProcesses[id] = { userHome, sessionName, logFile }

      return { loginUrl, userId: id }
    } catch (err: any) {
      await rm(logFile, { force: true }).catch(() => {})
      app.log.error({ err }, 'Failed to initiate CodeRabbit login')
      reply.status(500).send({ error: `Failed to initiate login: ${err?.message || 'Unknown error'}` }); return
    }
  })

  // Admin: Complete login with token
  app.post('/api/admin/users/:id/coderabbit/complete', { preHandler: [authMiddleware, adminGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { token } = request.body as { token: string }

    if (!token || !token.trim()) {
      reply.status(400).send({ error: 'Token is required' }); return
    }

    const processInfo = global.coderabbitLoginProcesses?.[id]
    if (!processInfo) {
      reply.status(400).send({ error: 'No active login session. Please generate a new login URL.' }); return
    }
    const { userHome, sessionName, logFile } = processInfo

    const cleanup = async () => {
      await rm(logFile, { force: true }).catch(() => {})
      if (global.coderabbitLoginProcesses?.[id] !== undefined) delete global.coderabbitLoginProcesses[id]
    }

    try {
      const { promisify } = await import('util')
      const { exec, execFile } = await import('child_process')
      const execAsync = promisify(exec)
      const execFileAsync = promisify(execFile)

      // The CLI must still be alive and waiting for the pasted callback.
      try {
        await execAsync(`tmux has-session -t ${sessionName}`)
      } catch {
        await cleanup()
        reply.status(400).send({ error: 'Login session expired. Please generate a new login URL.' }); return
      }

      // Only inspect JSON produced AFTER we submit the callback.
      const seenBefore = (await readAgentJson(logFile)).length

      // Submit the pasted token/callback to the CLI's stdin. `send-keys -l` sends the
      // string literally (so '&' '?' '=' ':' '/' are not parsed as tmux key names), and
      // execFile runs tmux without a shell (no escaping/injection via the callback value).
      await execFileAsync('tmux', ['send-keys', '-t', sessionName, '-l', token.trim()])
      await execFileAsync('tmux', ['send-keys', '-t', sessionName, 'Enter'])

      // Poll for the terminal JSON. In --agent mode the flow is
      // processing_callback → fetching_user → (success | error) and the process then
      // exits, so we stop as soon as we see an error, a success status, or the pane dies.
      let errObj: any = null
      const maxAttempts = 12
      const delayMs = 1000
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, delayMs))

        const fresh = (await readAgentJson(logFile)).slice(seenBefore)
        errObj = fresh.find((o: any) => o.type === 'error')
        if (errObj) break

        const success = fresh.find((o: any) => o.authenticated === true || /success|completed|logged_in|authenticated/i.test(o.status || ''))
        let alive = true
        try {
          await execAsync(`tmux has-session -t ${sessionName}`)
        } catch {
          alive = false
        }
        if (success || !alive) break
      }

      // Tear down the tmux session (no-op if the CLI already exited).
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`)

      if (errObj) {
        app.log.error({ errObj }, 'CodeRabbit authentication failed')
        await cleanup()
        reply.status(400).send({ error: errObj.message || 'Authentication failed — the token may be invalid or expired. Please generate a new login URL and try again.' }); return
      }

      // Source of truth: ask the CLI whether credentials are now stored & valid.
      const coderabbitPath = await resolveCoderabbitPath(userHome)
      if (!coderabbitPath) {
        await cleanup()
        reply.status(500).send({ error: 'CodeRabbit CLI not found' }); return
      }

      let authenticated = false
      try {
        const { stdout } = await execFileAsync(coderabbitPath, ['auth', 'status', '--agent'], {
          env: { ...process.env, HOME: userHome },
        })
        app.log.info({ authStatus: stdout.slice(0, 300) }, 'CodeRabbit auth status check')
        for (const line of stdout.trim().split('\n')) {
          try {
            const obj = JSON.parse(line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim())
            if (obj.authenticated === true) { authenticated = true; break }
          } catch {}
        }
      } catch (statusErr) {
        app.log.warn({ statusErr }, 'auth status --agent check failed')
      }

      if (!authenticated) {
        app.log.error('CodeRabbit not authenticated after token submission')
        await cleanup()
        reply.status(400).send({ error: 'Authentication did not complete. Make sure you pasted the full callback string, and try again promptly — the login link can expire.' }); return
      }

      await db
        .update(users)
        .set({
          coderabbitEnabled: true,
          coderabbitGrantedBy: request.user!.id,
          coderabbitGrantedAt: new Date(),
        })
        .where(eq(users.id, id))

      // Fix ownership so the user (reviews run via runuser) can read the stored auth.json.
      // userHome is `/home/auroracraft-<username>`, so its basename is the system user.
      try {
        const sysUser = userHome.split('/').pop() || ''
        if (sysUser) await execAsync(`chown -R ${sysUser}:${sysUser} ${userHome}`)
      } catch (chownErr) {
        app.log.warn({ chownErr }, 'Failed to fix ownership, but authentication succeeded')
      }

      await cleanup()
      return { success: true }
    } catch (err) {
      await cleanup()
      app.log.error({ err }, 'Failed to complete CodeRabbit login')
      reply.status(500).send({ error: 'Failed to complete login' }); return
    }
  })

  // Admin: Logout user from CodeRabbit
  app.post('/api/admin/users/:id/coderabbit/revoke', { preHandler: [authMiddleware, adminGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!user) {
      reply.status(404).send({ error: 'User not found' }); return
    }

    const userHome = `/home/auroracraft-${user.username.toLowerCase()}`

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const coderabbitPath = await resolveCoderabbitPath(userHome)
      if (!coderabbitPath) {
        reply.status(500).send({ error: 'CodeRabbit CLI not found' }); return
      }
      await execAsync(`cd ${userHome} && ${coderabbitPath} auth logout`, {
        env: { ...process.env, HOME: userHome }
      })

      await db
        .update(users)
        .set({
          coderabbitEnabled: false,
          coderabbitGrantedBy: null,
          coderabbitGrantedAt: null,
        })
        .where(eq(users.id, id))

      return { success: true }
    } catch (err) {
      app.log.error({ err }, 'Failed to logout')
      reply.status(500).send({ error: 'Failed to logout' }); return
    }
  })

  // Check if CodeRabbit is enabled for project
  app.get('/api/projects/:id/coderabbit/status', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id } = request.params as { id: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    const [user] = await db
      .select({ coderabbitEnabled: users.coderabbitEnabled })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    return { enabled: user.coderabbitEnabled || false }
  })

  // Start code review
  app.post('/api/projects/:id/coderabbit/review', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id } = request.params as { id: string }
    const { scope = 'full' } = request.body as { scope?: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    const [user] = await db
      .select({ coderabbitEnabled: users.coderabbitEnabled, username: users.username })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    if (!user.coderabbitEnabled) {
      reply.status(403).send({ error: 'CodeRabbit not enabled for your account' }); return
    }

    const projectDir = project.linkId ? `/home/auroracraft-${user.username.toLowerCase()}/${project.linkId}` : null
    if (!projectDir) {
      reply.status(404).send({ error: 'Project directory not found' }); return
    }

    const userHome = `/home/auroracraft-${user.username.toLowerCase()}`

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Mark previous pending reviews as superseded (only pending, to avoid multiple active reviews)
      await db
        .update(codeReviews)
        .set({ status: 'superseded' })
        .where(and(
          eq(codeReviews.projectId, id),
          eq(codeReviews.userId, request.user!.id),
          eq(codeReviews.status, 'pending')
        ))

      // Create review record
      const [review] = await db
        .insert(codeReviews)
        .values({
          projectId: id,
          userId: request.user!.id,
          scope,
          status: 'pending',
        })
        .returning()

      // Run CodeRabbit review asynchronously — the CLI can take 60+ seconds
      const coderabbitPath = await resolveCoderabbitPath(userHome)
      if (!coderabbitPath) {
        reply.status(500).send({ error: 'CodeRabbit CLI not found' }); return
      }
      const typeFlag = 'uncommitted'
      const systemUser = `auroracraft-${user.username.toLowerCase()}`

      // Detect current git branch to use as base
      let baseBranch = 'main'
      try {
        const { stdout: branchOut } = await execAsync(
          `runuser -u ${systemUser} -- git -C "${projectDir}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main`
        )
        baseBranch = branchOut.trim() || 'main'
      } catch {
        app.log.warn('Could not detect git branch, defaulting to main')
      }

      // Configure base branch for CodeRabbit (persisted in repo config)
      try {
        await execAsync(
          `runuser -u ${systemUser} -- git -C "${projectDir}" config coderabbit.baseBranch "${baseBranch}" 2>/dev/null || true`
        )
      } catch {
        // Non-fatal
      }

      // Spawn the review in the background so the HTTP request can return immediately
      const { spawn } = await import('child_process')
      const reviewCmd = `cd "${projectDir}" && HOME="${userHome}" "${coderabbitPath}" review --agent --type ${typeFlag} --base ${baseBranch}`
      
      app.log.info({ reviewId: review.id, projectId: id }, 'Starting background CodeRabbit review')
      
      const child = spawn('runuser', ['-u', systemUser, '--', 'bash', '-c', reviewCmd], {
        env: {
          ...process.env,
          HOME: userHome,
          PATH: `${userHome}/.local/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`
        },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('error', (spawnErr) => {
        app.log.error({ err: spawnErr, reviewId: review.id }, 'CodeRabbit review spawn error')
        db.update(codeReviews)
          .set({ status: 'error', issuesJson: [{ type: 'error', message: spawnErr.message }], resolvedAt: new Date() })
          .where(eq(codeReviews.id, review.id))
          .catch((dbErr) => app.log.error({ err: dbErr }, 'Failed to update review status after spawn error'))
      })

      child.on('close', async (code) => {
        app.log.info({ reviewId: review.id, exitCode: code, stdoutLen: stdout.length, stderrLen: stderr.length }, 'CodeRabbit review completed')

        // Always try to parse the JSON output to extract errors or findings
        const allLines = (stdout + '\n' + stderr).trim().split('\n')
        const parsedObjects = allLines
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line)
            } catch {
              return null
            }
          })
          .filter(Boolean)

        const errorObj = parsedObjects.find((obj: any) => obj.type === 'error')

        if (code !== 0 || errorObj) {
          app.log.error({ reviewId: review.id, stderr, stdout: stdout.slice(0, 500), errorObj }, 'CodeRabbit review exited with error')

          let errorMessage = 'Review process failed'
          let status = 'error'

          if (errorObj) {
            const errorType = errorObj.errorType || errorObj.type
            if (errorType === 'rate_limit') {
              const waitTime = errorObj.metadata?.waitTime || 'a few minutes'
              errorMessage = `CodeRabbit rate limit exceeded. Please wait ${waitTime} before running another review.`
              status = 'rate_limited'
            } else if (errorType === 'git_error' || errorObj.message?.includes('dubious ownership')) {
              errorMessage = 'Git repository ownership mismatch'
            } else if (errorType === 'branch_error' || errorObj.message?.includes('base branch') || errorObj.message?.includes('baseBranch')) {
              errorMessage = `CodeRabbit could not determine base branch (detected: ${baseBranch})`
            } else if (errorType === 'auth_error' || errorObj.message?.includes('not authenticated') || errorObj.message?.includes('Authentication failed')) {
              errorMessage = 'CodeRabbit authentication expired'
            } else {
              errorMessage = errorObj.message || 'CodeRabbit review failed'
            }
          } else {
            // Fallback to string matching if no structured error was found
            const combined = stderr + stdout
            if (combined.includes('dubious ownership')) {
              errorMessage = 'Git repository ownership mismatch'
            } else if (combined.includes('No commits')) {
              errorMessage = 'No commits found in repository'
            }
          }

          await db
            .update(codeReviews)
            .set({ status, issuesJson: [{ type: 'error', message: errorMessage, details: stderr || stdout }], resolvedAt: new Date() })
            .where(eq(codeReviews.id, review.id))
            .catch((dbErr) => app.log.error({ err: dbErr }, 'Failed to update review status'))
          setTimeout(() => cleanupCoderabbitCache(userHome).catch(() => {}), 30000)
          return
        }

        // Parse findings from JSON output
        const issues = parsedObjects.filter((obj: any) => obj.type === 'finding')

        const hasCritical = issues.some((i: any) => i.severity === 'critical' || i.severity === 'major')
        const status = issues.length === 0 ? 'passed' : hasCritical ? 'failed' : 'passed'

        await db
          .update(codeReviews)
          .set({ status, issuesJson: issues, resolvedAt: new Date() })
          .where(eq(codeReviews.id, review.id))
          .catch((dbErr) => app.log.error({ err: dbErr }, 'Failed to update review status'))
        setTimeout(() => cleanupCoderabbitCache(userHome).catch(() => {}), 30000)
      })

      // Return immediately — review is running in the background
      return { reviewId: review.id, status: 'pending', message: 'Code review is running in the background. Check review history for results.' }
    } catch (err: any) {
      app.log.error({ err }, 'Failed to run CodeRabbit review')
      reply.status(500).send({ error: `Failed to run code review: ${err?.message || 'Unknown error'}` }); return
    }
  })

  // Get review history (excludes error-only reviews like rate_limited, stale, error)
  app.get('/api/projects/:id/coderabbit/reviews', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id } = request.params as { id: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    const allReviews = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.projectId, id))
      .orderBy(desc(codeReviews.createdAt))

    // Show completed reviews: passed, failed, fixed, and superseded (old completed reviews).
    // Pending reviews are tracked via /review-status endpoint for the workspace lock.
    // Error statuses (rate_limited, stale, error) are shown in UI toasts only.
    const visibleStatuses = ['passed', 'failed', 'fixed', 'superseded']
    const reviews = allReviews.filter((r) => visibleStatuses.includes(r.status))

    return { reviews }
  })

  // Update review status
  app.patch('/api/projects/:id/coderabbit/reviews/:reviewId', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id, reviewId } = request.params as { id: string; reviewId: string }
    const { status } = request.body as { status: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    await db
      .update(codeReviews)
      .set({ status, resolvedAt: new Date() })
      .where(and(eq(codeReviews.id, reviewId), eq(codeReviews.projectId, id)))

    return { success: true }
  })

  // Mark specific issues as fixed within a review
  app.post('/api/projects/:id/coderabbit/reviews/:reviewId/fix-issues', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id, reviewId } = request.params as { id: string; reviewId: string }
    const { fixedIndices } = request.body as { fixedIndices: number[] }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    const [review] = await db
      .select()
      .from(codeReviews)
      .where(and(eq(codeReviews.id, reviewId), eq(codeReviews.projectId, id)))
      .limit(1)

    if (!review) {
      reply.status(404).send({ error: 'Review not found' }); return
    }

    const issues = Array.isArray(review.issuesJson) ? review.issuesJson : []
    const fixedSet = new Set(fixedIndices)

    // Mark specified issues as fixed
    const updatedIssues = issues.map((issue: any, idx: number) => {
      if (fixedSet.has(idx)) {
        return { ...issue, _fixed: true, _fixedAt: new Date().toISOString() }
      }
      return issue
    })

    // Count how many are fixed vs total findings
    const totalFindings = issues.filter((i: any) => i.type === 'finding').length
    const fixedCount = updatedIssues.filter((i: any) => i.type === 'finding' && i._fixed).length

    // Update status: all fixed → 'fixed', some fixed → keep 'failed', none fixed → keep original
    const newStatus = fixedCount >= totalFindings && totalFindings > 0 ? 'fixed' : review.status

    await db
      .update(codeReviews)
      .set({
        issuesJson: updatedIssues,
        status: newStatus,
      })
      .where(and(eq(codeReviews.id, reviewId), eq(codeReviews.projectId, id)))

    return { success: true, fixedCount, totalFindings, status: newStatus }
  })

  // Check active review status (for workspace lock)
  app.get('/api/projects/:id/review-status', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id } = request.params as { id: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    // Clean up stale pending reviews (older than 10 minutes — likely orphaned by server restart)
    try {
      await db.execute(sql`UPDATE code_reviews SET status = 'stale', issues_json = '[{"type":"error","message":"Review was interrupted (server restart or timeout)"}]', resolved_at = NOW()
         WHERE project_id = ${id} AND user_id = ${request.user!.id} AND status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes'`)
    } catch {
      // Non-fatal
    }

    // Find the most recent review for this project (any status)
    const [latestReview] = await db
      .select()
      .from(codeReviews)
      .where(and(
        eq(codeReviews.projectId, id),
        eq(codeReviews.userId, request.user!.id),
      ))
      .orderBy(desc(codeReviews.createdAt))
      .limit(1)

    if (latestReview) {
      const isError = latestReview.status === 'rate_limited' || latestReview.status === 'stale' || latestReview.status === 'error'
      const isPending = latestReview.status === 'pending'

      if (isError) {
        // Extract error message from issuesJson
        let errorMessage = 'Review failed'
        try {
          const issues = Array.isArray(latestReview.issuesJson) ? latestReview.issuesJson : []
          const errorIssue = issues.find((i: any) => i.type === 'error')
          if (errorIssue?.message) errorMessage = errorIssue.message
        } catch {
          // Fallback
        }
        return {
          locked: false,
          review: null,
          error: {
            id: latestReview.id,
            message: errorMessage,
            status: latestReview.status,
          }
        }
      }

      return {
        locked: isPending,
        review: {
          id: latestReview.id,
          status: latestReview.status,
          scope: latestReview.scope,
          createdAt: latestReview.createdAt,
          issuesCount: Array.isArray(latestReview.issuesJson) ? latestReview.issuesJson.length : 0,
        },
        error: null,
      }
    }

    return { locked: false, review: null, error: null }
  })

  // Delete a review (used by client to clean up error/rate_limited reviews after showing the error)
  app.delete('/api/projects/:id/coderabbit/reviews/:reviewId', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!paidCheck(request, reply)) return
    const { id, reviewId } = request.params as { id: string; reviewId: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      reply.status(404).send({ error: 'Project not found' }); return
    }

    await db
      .delete(codeReviews)
      .where(and(eq(codeReviews.id, reviewId), eq(codeReviews.projectId, id), eq(codeReviews.userId, request.user!.id)))

    return { success: true }
  })
}
