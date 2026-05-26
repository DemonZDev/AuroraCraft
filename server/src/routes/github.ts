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

    const systemUser = `auroracraft-${request.user!.username}`
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      
      const git = async (cmd: string) => {
        const { stdout } = await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" ${cmd}`)
        return stdout
      }

      // Check if git repo exists
      try {
        await git('rev-parse --git-dir')
      } catch {
        // Initialize git if not exists
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" init`)
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" checkout -b main`)
        return { branches: ['main'], currentBranch: 'main', needsRemote: true }
      }
      
      // Check if remote exists
      let hasRemote = false
      try {
        const remoteUrl = await git('config --get remote.origin.url')
        hasRemote = !!remoteUrl.trim()
      } catch {}
      
      const stdout = await git('branch -a')
      const branches = stdout
        .split('\n')
        .map(b => b.trim().replace(/^\*\s+/, '').replace(/^remotes\/origin\//, ''))
        .filter(b => b && b !== 'HEAD' && !b.includes('->'))
        .filter((b, i, arr) => arr.indexOf(b) === i)
      
      const currentBranch = await git('rev-parse --abbrev-ref HEAD')
      
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

    const systemUser = `auroracraft-${request.user!.username}`
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Remove existing remote if any
      try {
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" remote remove origin`)
      } catch {}

      // Add new remote
      await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" remote add origin '${repoUrl}'`)

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

    const systemUser = `auroracraft-${request.user!.username}`
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const git = async (cmd: string) => {
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" ${cmd}`)
      }

      // Configure git credentials
      await git('config credential.helper store')
      
      // Get remote URL and inject token
      const { stdout: remoteUrl } = await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" config --get remote.origin.url`)
      const url = remoteUrl.trim()
      
      if (url.includes('github.com')) {
        const tokenUrl = url.replace('https://github.com/', `https://oauth2:${user.githubAccessToken}@github.com/`)
        await git(`remote set-url origin '${tokenUrl}'`)
      }

      // Git add, commit, push
      await git('add .')
      await execAsync(`runuser -u ${systemUser} -- sh -c 'git -C "${projectDir}" commit -m "${message.replace(/"/g, '\\"')}" || true'`)
      await git(`push origin '${branch}'${force ? ' --force' : ''}`)

      // Reset URL to remove token
      await git(`remote set-url origin '${url}'`)

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

    const systemUser = `auroracraft-${request.user!.username}`
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Get remote URL before deleting
      const { stdout: remoteUrl } = await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" config --get remote.origin.url`)
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

      // Delete all files as project owner
      await execAsync(`runuser -u ${systemUser} -- rm -rf "${projectDir}"/* "${projectDir}"/.[!.]* 2>/dev/null || true`)
      await execAsync(`runuser -u ${systemUser} -- mkdir -p "${projectDir}"`)

      // Clone fresh as project owner
      const branchFlag = branch ? ` -b '${branch}'` : ''
      await execAsync(`runuser -u ${systemUser} -- git clone${branchFlag} '${cloneUrl}' "${projectDir}"`)

      // Checkout specific commit if provided
      if (commit) {
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" checkout '${commit}'`)
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

    const systemUser = `auroracraft-${request.user!.username}`
    const githubAuth = !!user.githubAccessToken

    // Check filesystem remote as fallback
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    let hasRemote = false
    let currentBranch = project.repoBranch || 'main'
    if (projectDir) {
      try {
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)
        try {
          const { stdout } = await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" config --get remote.origin.url`)
          hasRemote = !!stdout.trim()
        } catch {}
        try {
          const { stdout } = await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" rev-parse --abbrev-ref HEAD`)
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

    const systemUser = `auroracraft-${request.user!.username}`
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Ensure project directory exists as project owner
      await execAsync(`runuser -u ${systemUser} -- mkdir -p "${projectDir}"`)

      // Helper to run git as the project owner (avoids dubious ownership)
      const git = async (cmd: string) => {
        const { stdout, stderr } = await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" ${cmd}`)
        return { stdout, stderr }
      }

      // Initialize git if not exists
      let isFreshRepo = false
      try {
        await git('rev-parse --git-dir')
      } catch {
        await git('init')
        isFreshRepo = true
      }

      // Set git identity (required for commits)
      try {
        await git('config user.email "auroracraft@local"')
        await git('config user.name "AuroraCraft"')
      } catch {}

      // Remove existing remote if any
      try { await git('remote remove origin') } catch {}

      // Add new remote
      await git(`remote add origin '${repoUrl}'`)

      // Check if repo has any commits
      let hasCommits = false
      try {
        await git('rev-parse HEAD')
        hasCommits = true
      } catch {
        hasCommits = false
      }

      if (hasCommits) {
        // Repo has commits — ensure the requested branch exists locally
        let branchExists = false
        try {
          await git(`show-ref --verify --quiet refs/heads/'${branch}'`)
          branchExists = true
        } catch {}
        
        if (branchExists) {
          await git(`checkout '${branch}'`)
        } else {
          await git(`checkout -b '${branch}'`)
        }
      } else {
        // No commits yet — use symbolic-ref to set default branch name
        // This works even when there are no commits (fresh git init or empty repo)
        await git(`symbolic-ref HEAD refs/heads/'${branch}'`)
      }

      // Save to database
      await db.update(projects)
        .set({ repoUrl, repoBranch: branch })
        .where(eq(projects.id, id))

      return { success: true, repoUrl, branch }
    } catch (err: any) {
      app.log.error({ err }, 'Failed to connect project to git')
      return reply.status(500).send({ error: `Failed to connect repository: ${err?.message || 'Unknown error'}` })
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

    const systemUser = `auroracraft-${request.user!.username}`
    const projectDir = project.linkId ? `/home/${systemUser}/${project.linkId}` : null
    if (!projectDir) {
      return reply.status(404).send({ error: 'Project directory not found' })
    }

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      
      // Check if repo has commits
      let hasCommits = false
      try {
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" rev-parse HEAD`)
        hasCommits = true
      } catch {
        hasCommits = false
      }

      if (hasCommits) {
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" checkout -b '${branchName}'`)
      } else {
        // No commits yet — use symbolic-ref
        await execAsync(`runuser -u ${systemUser} -- git -C "${projectDir}" symbolic-ref HEAD refs/heads/'${branchName}'`)
      }
      
      return { success: true, branch: branchName }
    } catch (err) {
      app.log.error({ err }, 'Failed to create branch')
      return reply.status(500).send({ error: 'Failed to create branch' })
    }
  })
}
