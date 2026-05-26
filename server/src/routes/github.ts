import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { projects } from '../db/schema/projects.js'
import { authMiddleware } from '../middleware/auth.js'
import { env } from '../env.js'

export async function githubRoutes(app: FastifyInstance) {
  // Initiate GitHub OAuth flow
  app.get('/api/auth/github/connect', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!env.GITHUB_CLIENT_ID) {
      return reply.status(500).send({ error: 'GitHub OAuth not configured' })
    }

    const { returnTo } = request.query as { returnTo?: string }
    const state = JSON.stringify({ userId: request.user!.id, returnTo: returnTo || '/dashboard' })
    const redirectUri = env.GITHUB_CALLBACK_URL || `${env.CLIENT_URL}/api/auth/github/callback`
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
    
    return reply.redirect(authUrl)
  })

  // Handle GitHub OAuth callback
  app.get('/api/auth/github/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string }

    if (!code || !state) {
      return reply.redirect(`${env.CLIENT_URL}/dashboard?github_error=missing_code`)
    }

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return reply.redirect(`${env.CLIENT_URL}/dashboard?github_error=not_configured`)
    }

    let userId: string
    let returnTo = '/dashboard'
    
    try {
      const parsed = JSON.parse(decodeURIComponent(state))
      userId = parsed.userId
      returnTo = parsed.returnTo || '/dashboard'
    } catch {
      userId = state
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      })

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string }

      if (!tokenData.access_token) {
        return reply.redirect(`${env.CLIENT_URL}${returnTo}?github_error=token_failed`)
      }

      // Get GitHub user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      })

      const githubUser = await userResponse.json() as { login?: string }

      if (!githubUser.login) {
        return reply.redirect(`${env.CLIENT_URL}${returnTo}?github_error=user_failed`)
      }

      // Update user with GitHub credentials
      await db
        .update(users)
        .set({
          githubAccessToken: tokenData.access_token,
          githubUsername: githubUser.login,
          githubConnectedAt: new Date(),
        })
        .where(eq(users.id, userId))

      return reply.redirect(`${env.CLIENT_URL}${returnTo}?github_connected=true`)
    } catch (err) {
      app.log.error({ err }, 'GitHub OAuth callback error')
      return reply.redirect(`${env.CLIENT_URL}${returnTo}?github_error=unknown`)
    }
  })

  // Check GitHub connection status
  app.get('/api/auth/github/status', { preHandler: [authMiddleware] }, async (request, reply) => {
    const [user] = await db
      .select({ githubUsername: users.githubUsername, githubConnectedAt: users.githubConnectedAt })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    return {
      connected: !!user.githubUsername,
      username: user.githubUsername || null,
      connectedAt: user.githubConnectedAt || null,
    }
  })

  // Disconnect GitHub account
  app.post('/api/auth/github/disconnect', { preHandler: [authMiddleware] }, async (request, reply) => {
    await db
      .update(users)
      .set({
        githubAccessToken: null,
        githubUsername: null,
        githubConnectedAt: null,
      })
      .where(eq(users.id, request.user!.id))

    return { success: true }
  })

  // Get git branches for a project
  app.get('/api/projects/:id/git/branches', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      
      // Check if git repo exists
      try {
        await execAsync('git rev-parse --git-dir', { cwd: projectDir })
      } catch {
        // Initialize git if not exists
        await execAsync('git init', { cwd: projectDir })
        await execAsync('git checkout -b main', { cwd: projectDir })
        return { branches: ['main'], currentBranch: 'main', needsRemote: true }
      }
      
      // Check if remote exists
      let hasRemote = false
      try {
        const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', { cwd: projectDir })
        hasRemote = !!remoteUrl.trim()
      } catch {}
      
      const { stdout } = await execAsync('git branch -a', { cwd: projectDir })
      const branches = stdout
        .split('\n')
        .map(b => b.trim().replace(/^\*\s+/, '').replace(/^remotes\/origin\//, ''))
        .filter(b => b && b !== 'HEAD' && !b.includes('->'))
        .filter((b, i, arr) => arr.indexOf(b) === i)
      
      const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir })
      
      return { 
        branches: branches.length > 0 ? branches : ['main'], 
        currentBranch: currentBranch.trim() || 'main',
        needsRemote: !hasRemote
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to get git branches')
      return { branches: ['main'], currentBranch: 'main', needsRemote: true }
    }
  })

  // Set GitHub repository URL
  app.post('/api/projects/:id/git/remote', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { repoUrl } = request.body as { repoUrl: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Remove existing remote if any
      try {
        await execAsync('git remote remove origin', { cwd: projectDir })
      } catch {}

      // Add new remote
      await execAsync(`git remote add origin "${repoUrl}"`, { cwd: projectDir })

      return { success: true }
    } catch (err) {
      app.log.error({ err }, 'Failed to set git remote')
      return reply.status(500).send({ error: 'Failed to set repository URL' })
    }
  })

  // Push code to GitHub
  app.post('/api/projects/:id/git/push', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { branch, message, force } = request.body as { branch: string; message: string; force?: boolean }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    if (!user.githubAccessToken) {
      return reply.status(400).send({ error: 'GitHub account not connected' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Configure git credentials
      await execAsync(`git config credential.helper store`, { cwd: projectDir })
      
      // Get remote URL and inject token
      const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', { cwd: projectDir })
      const url = remoteUrl.trim()
      
      if (url.includes('github.com')) {
        const tokenUrl = url.replace('https://github.com/', `https://oauth2:${user.githubAccessToken}@github.com/`)
        await execAsync(`git remote set-url origin "${tokenUrl}"`, { cwd: projectDir })
      }

      // Git add, commit, push
      await execAsync('git add .', { cwd: projectDir })
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}" || true`, { cwd: projectDir })
      await execAsync(`git push origin ${branch}${force ? ' --force' : ''}`, { cwd: projectDir })

      // Reset URL to remove token
      await execAsync(`git remote set-url origin "${url}"`, { cwd: projectDir })

      return { success: true }
    } catch (err) {
      app.log.error({ err }, 'Failed to push to GitHub')
      return reply.status(500).send({ error: 'Failed to push to GitHub' })
    }
  })

  // Reset project from Git
  app.post('/api/projects/:id/git/reset', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { branch, commit } = request.body as { branch?: string; commit?: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const { rm, mkdir } = await import('fs/promises')

      // Get remote URL before deleting
      const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', { cwd: projectDir })
      const repoUrl = remoteUrl.trim()

      if (!repoUrl) {
        return reply.status(400).send({ error: 'No Git remote configured' })
      }

      // Check if private repo (needs token)
      let cloneUrl = repoUrl
      if (repoUrl.includes('github.com')) {
        const [user] = await db
          .select({ githubAccessToken: users.githubAccessToken })
          .from(users)
          .where(eq(users.id, request.user!.id))
          .limit(1)

        if (user.githubAccessToken && !repoUrl.includes('@')) {
          cloneUrl = repoUrl.replace('https://github.com/', `https://oauth2:${user.githubAccessToken}@github.com/`)
        }
      }

      // Delete all files
      await rm(projectDir, { recursive: true, force: true })
      await mkdir(projectDir, { recursive: true })

      // Clone fresh
      const branchFlag = branch ? ` -b "${branch}"` : ''
      await execAsync(`git clone${branchFlag} "${cloneUrl}" "${projectDir}"`)

      // Checkout specific commit if provided
      if (commit) {
        await execAsync(`git checkout "${commit}"`, { cwd: projectDir })
      }

      return { success: true }
    } catch (err) {
      app.log.error({ err }, 'Failed to reset from Git')
      return reply.status(500).send({ error: 'Failed to reset from Git' })
    }
  })

  // ── Project Git Connection Management ────────────────────────────────────

  // Get project git connection status
  app.get('/api/projects/:id/git/status', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken, githubUsername: users.githubUsername })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    const githubAuth = !!user.githubAccessToken

    // Check filesystem remote as fallback
    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    let hasRemote = false
    let currentBranch = project.repoBranch || 'main'
    if (projectDir) {
      try {
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)
        try {
          const { stdout } = await execAsync('git config --get remote.origin.url', { cwd: projectDir })
          hasRemote = !!stdout.trim()
        } catch {}
        try {
          const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir })
          currentBranch = stdout.trim() || currentBranch
        } catch {}
      } catch {}
    }

    return {
      connected: !!(project.repoUrl && hasRemote),
      repoUrl: project.repoUrl || null,
      repoBranch: currentBranch,
      githubAuth,
      githubUsername: user.githubUsername || null,
    }
  })

  // List user's GitHub repositories
  app.get('/api/github/repos', { preHandler: [authMiddleware] }, async (request, reply) => {
    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    if (!user.githubAccessToken) {
      return reply.status(401).send({ error: 'GitHub not connected' })
    }

    try {
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        return reply.status(500).send({ error: 'Failed to fetch repositories' })
      }

      const repos = await response.json() as Array<{ full_name: string; name: string; html_url: string; private: boolean; default_branch: string }>
      return {
        repos: repos.map(r => ({
          fullName: r.full_name,
          name: r.name,
          url: r.html_url,
          cloneUrl: `https://github.com/${r.full_name}.git`,
          isPrivate: r.private,
          defaultBranch: r.default_branch,
        })),
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to fetch GitHub repos')
      return reply.status(500).send({ error: 'Failed to fetch repositories' })
    }
  })

  // Get branches for a specific repository
  app.get('/api/github/repos/branches', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { repo } = request.query as { repo?: string }

    if (!repo) {
      return reply.status(400).send({ error: 'Repository name required' })
    }

    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    if (!user.githubAccessToken) {
      return reply.status(401).send({ error: 'GitHub not connected' })
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        return reply.status(500).send({ error: 'Failed to fetch branches' })
      }

      const branches = await response.json() as Array<{ name: string }>
      return {
        branches: branches.map(b => b.name),
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to fetch branches')
      return reply.status(500).send({ error: 'Failed to fetch branches' })
    }
  })

  // Create a new GitHub repository
  app.post('/api/github/repos', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { name, description, isPrivate = true } = request.body as { name: string; description?: string; isPrivate?: boolean }

    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1)

    if (!user.githubAccessToken) {
      return reply.status(401).send({ error: 'GitHub not connected' })
    }

    try {
      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description: description || '',
          private: isPrivate,
          auto_init: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { message?: string }
        return reply.status(500).send({ error: error.message || 'Failed to create repository' })
      }

      const repo = await response.json() as { full_name: string; html_url: string; default_branch: string }
      return {
        fullName: repo.full_name,
        cloneUrl: `https://github.com/${repo.full_name}.git`,
        defaultBranch: repo.default_branch,
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to create GitHub repo')
      return reply.status(500).send({ error: 'Failed to create repository' })
    }
  })

  // Connect project to a GitHub repository and branch
  app.post('/api/projects/:id/git/connect', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { repoUrl, branch } = request.body as { repoUrl: string; branch: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Initialize git if not exists
      try {
        await execAsync('git rev-parse --git-dir', { cwd: projectDir })
      } catch {
        await execAsync('git init', { cwd: projectDir })
      }

      // Set git identity (required for commits)
      try {
        await execAsync('git config user.email "auroracraft@local"', { cwd: projectDir })
        await execAsync('git config user.name "AuroraCraft"', { cwd: projectDir })
      } catch {}

      // Remove existing remote if any
      try { await execAsync('git remote remove origin', { cwd: projectDir }) } catch {}

      // Add new remote
      await execAsync(`git remote add origin "${repoUrl}"`, { cwd: projectDir })

      // Ensure branch exists locally
      try {
        await execAsync(`git checkout -b "${branch}"`, { cwd: projectDir })
      } catch {
        // Branch may already exist
        try {
          await execAsync(`git checkout "${branch}"`, { cwd: projectDir })
        } catch {}
      }

      // Save to database
      await db.update(projects)
        .set({ repoUrl, repoBranch: branch })
        .where(eq(projects.id, id))

      return { success: true, repoUrl, branch }
    } catch (err) {
      app.log.error({ err }, 'Failed to connect project to git')
      return reply.status(500).send({ error: 'Failed to connect repository' })
    }
  })

  // Disconnect project from git repository
  app.post('/api/projects/:id/git/disconnect', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null

    // Remove remote from filesystem
    if (projectDir) {
      try {
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)
        try { await execAsync('git remote remove origin', { cwd: projectDir }) } catch {}
      } catch {}
    }

    // Clear from database
    await db.update(projects)
      .set({ repoUrl: null, repoBranch: null })
      .where(eq(projects.id, id))

    return { success: true }
  })

  // Create a new branch in the project
  app.post('/api/projects/:id/git/branch', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { branchName } = request.body as { branchName: string }

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    
    if (!project || project.userId !== request.user!.id) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`git checkout -b "${branchName}"`, { cwd: projectDir })
      return { success: true, branch: branchName }
    } catch (err) {
      app.log.error({ err }, 'Failed to create branch')
      return reply.status(500).send({ error: 'Failed to create branch' })
    }
  })
}
