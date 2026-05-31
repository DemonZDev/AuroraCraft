import type { FastifyInstance } from 'fastify'
import { db } from '../db'
import { users } from '../db/schema/users'
import { projects } from '../db/schema/projects'
import { codeReviews } from '../db/schema/code-reviews'
import { eq, and, desc, or, sql } from 'drizzle-orm'
import { authMiddleware, adminGuard } from '../middleware/auth'
import { access, readdir, unlink, rm } from 'fs/promises'
import { join } from 'path'

declare global {
  // eslint-disable-next-line no-var
  var coderabbitLoginProcesses: Record<string, { userHome: string; sessionName: string }> | undefined
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

    const errors: string[] = []

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

      // Ensure tmux server is running
      await execAsync(`tmux start-server 2>/dev/null || true`)

      // Kill any existing session
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`)

      // Start tmux session with coderabbit auth login (wide window to prevent URL wrapping)
      try {
        await execAsync(`tmux new-session -d -s ${sessionName} -x 200 -y 50 "HOME=${userHome} ${coderabbitPath} auth login"`)
      } catch (tmuxErr: any) {
        app.log.error({ err: tmuxErr }, 'Failed to create tmux session')
        reply.status(500).send({ error: `Failed to start authentication session: ${tmuxErr.message || 'tmux error'}` }); return
      }

      // The CLI can take 3-5 seconds to output the URL. Retry capture with backoff.
      const maxAttempts = 6
      const delayMs = 2000
      let loginUrl: string | null = null

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, delayMs))

        let stdout = ''
        try {
          const result = await execAsync(`tmux capture-pane -t ${sessionName} -p`)
          stdout = result.stdout
        } catch (captureErr: any) {
          app.log.warn({ err: captureErr, attempt }, 'tmux capture-pane failed, retrying...')
          continue
        }

        // Strip ANSI escape codes before matching
        const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '')
        const urlMatch = cleanStdout.match(/https:\/\/app\.coderabbit\.ai\/login\?[^\s\n]+/)
        if (urlMatch) {
          loginUrl = urlMatch[0]
          app.log.info({ attempt }, 'Captured CodeRabbit login URL')
          break
        }

        app.log.info({ attempt, stdoutPreview: cleanStdout.trim().slice(-200) }, 'Login URL not yet visible, retrying...')
      }

      if (!loginUrl) {
        await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`)
        app.log.error('No login URL found in tmux output after all retries')
        reply.status(500).send({ error: 'CodeRabbit CLI did not produce a login URL within the expected time. Please try again.' }); return
      }

      // Store session info
      global.coderabbitLoginProcesses = global.coderabbitLoginProcesses || {}
      global.coderabbitLoginProcesses[id] = { userHome, sessionName }

      return { loginUrl, userId: id }
    } catch (err: any) {
      app.log.error({ err }, 'Failed to initiate CodeRabbit login')
      const detail = errors.length > 0 ? errors.join('; ') : (err?.message || 'Unknown error')
      reply.status(500).send({ error: `Failed to initiate login: ${detail}` }); return
    }
  })

  // Admin: Complete login with token
  app.post('/api/admin/users/:id/coderabbit/complete', { preHandler: [authMiddleware, adminGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { token } = request.body as { token: string }

    if (!token) {
      reply.status(400).send({ error: 'Token is required' }); return
    }

    try {
      const processInfo = global.coderabbitLoginProcesses?.[id]
      if (!processInfo) {
        reply.status(400).send({ error: 'No active login session' }); return
      }

      const { promisify } = await import('util')
      const { exec } = await import('child_process')
      const execAsync = promisify(exec)

      // Check if tmux session still exists
      try {
        await execAsync(`tmux has-session -t ${processInfo.sessionName}`)
      } catch {
        reply.status(400).send({ error: 'Login session expired. Please generate a new login URL.' }); return
      }

      // Send token to tmux session
      await execAsync(`tmux send-keys -t ${processInfo.sessionName} "${token.trim()}" Enter`)

      // Wait for authentication to complete
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Capture output to check for errors
      const { stdout: tmuxOutput } = await execAsync(`tmux capture-pane -t ${processInfo.sessionName} -p`)
      
      app.log.info({ tmuxOutput: tmuxOutput.slice(-500) }, 'Tmux output after token')
      
      // Kill the session
      await execAsync(`tmux kill-session -t ${processInfo.sessionName}`)

      // Check if authentication failed in the output
      if (tmuxOutput.includes('Authentication failed') || tmuxOutput.includes('Invalid')) {
        app.log.error('CodeRabbit authentication failed in tmux output')
        reply.status(400).send({ error: 'Authentication failed - invalid token or state mismatch' }); return
      }

      // Verify authentication
      const coderabbitPath = await resolveCoderabbitPath(processInfo.userHome)
      if (!coderabbitPath) {
        reply.status(500).send({ error: 'CodeRabbit CLI not found' }); return
      }
      const { stdout } = await execAsync(`${coderabbitPath} auth status --agent`, {
        env: { ...process.env, HOME: processInfo.userHome }
      })

      app.log.info({ authStatus: stdout }, 'CodeRabbit auth status check')

      const lines = stdout.trim().split('\n')
      let authenticated = false
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          if ((obj.type === 'auth_status' || obj.type === 'status') && obj.authenticated) {
            authenticated = true
            break
          }
        } catch {}
      }

      if (!authenticated) {
        app.log.error('CodeRabbit not authenticated after token submission')
        reply.status(400).send({ error: 'Authentication failed' }); return
      }

      await db
        .update(users)
        .set({
          coderabbitEnabled: true,
          coderabbitGrantedBy: request.user!.id,
          coderabbitGrantedAt: new Date(),
        })
        .where(eq(users.id, id))

      // Fix ownership of all files in user home
      try {
        const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
        if (user) {
          await execAsync(`chown -R auroracraft-${user.username.toLowerCase()}:auroracraft-${user.username.toLowerCase()} ${processInfo.userHome}`)
        }
      } catch (chownErr) {
        app.log.warn({ chownErr }, 'Failed to fix ownership, but authentication succeeded')
      }

      global.coderabbitLoginProcesses?.[id] !== undefined && delete global.coderabbitLoginProcesses[id]

      return { success: true }
    } catch (err) {
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
