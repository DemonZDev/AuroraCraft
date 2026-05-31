import type { FastifyInstance, FastifyRequest } from 'fastify'
import { eq, and, desc, asc, ilike, or, sql, count } from 'drizzle-orm'
import { mkdir, stat, cp, readFile, realpath } from 'fs/promises'
import path from 'path'
import archiver from 'archiver'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { users } from '../db/schema/users.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { agentMessages } from '../db/schema/agent-messages.js'
import { projectLikes } from '../db/schema/project-likes.js'
import { projectViews } from '../db/schema/project-views.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js'
import { readFileTree, generateLinkId } from './projects.js'

function getProjectDir(ownerUsername: string, linkId: string): string {
  return `/home/auroracraft-${ownerUsername.toLowerCase()}/${linkId}`
}

async function getPublicProject(id: string) {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      logo: projects.logo,
      versions: projects.versions,
      layoutMode: projects.layoutMode,
      software: projects.software,
      language: projects.language,
      javaVersion: projects.javaVersion,
      compiler: projects.compiler,
      visibility: projects.visibility,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      linkId: projects.linkId,
      forkedFrom: projects.forkedFrom,
      ownerUsername: users.username,
      ownerId: users.id,
      ownerTier: users.tier,
    })
    .from(projects)
    .innerJoin(users, eq(projects.userId, users.id))
    .where(and(eq(projects.id, id), eq(projects.visibility, 'public'), eq(projects.status, 'active')))
    .limit(1)
  return row ?? null
}

async function getProjectLikeCount(projectId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectLikes)
    .where(eq(projectLikes.projectId, projectId))
  return result?.count ?? 0
}

async function getProjectViewCount(projectId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectViews)
    .where(eq(projectViews.projectId, projectId))
  return result?.count ?? 0
}

async function isProjectLikedByUser(projectId: string, userId: string): Promise<boolean> {
  const [result] = await db
    .select()
    .from(projectLikes)
    .where(and(eq(projectLikes.projectId, projectId), eq(projectLikes.userId, userId)))
    .limit(1)
  return !!result
}

async function isProjectViewedByUser(projectId: string, userId: string): Promise<boolean> {
  const [result] = await db
    .select()
    .from(projectViews)
    .where(and(eq(projectViews.projectId, projectId), eq(projectViews.userId, userId)))
    .limit(1)
  return !!result
}

export async function communityRoutes(app: FastifyInstance) {
  // List public projects with search, filter, sort
  app.get('/api/community/projects', async (request) => {
    const { search, software, language, sort } = request.query as {
      search?: string
      software?: string
      language?: string
      sort?: string
    }

    const conditions = [eq(projects.visibility, 'public'), eq(projects.status, 'active')]

    if (search) {
      const searchCondition = or(
        ilike(projects.name, `%${search}%`),
        ilike(projects.description, `%${search}%`),
      )
      if (searchCondition) conditions.push(searchCondition)
    }

    if (software) {
      conditions.push(eq(projects.software, software))
    }

    if (language && (language === 'java' || language === 'kotlin')) {
      conditions.push(eq(projects.language, language))
    }

    let orderBy
    switch (sort) {
      case 'likes':
        orderBy = [desc(sql`(SELECT count(*) FROM project_likes WHERE project_likes.project_id = ${projects.id})`), desc(projects.createdAt)]
        break
      case 'views':
        orderBy = [desc(sql`(SELECT count(*) FROM project_views WHERE project_views.project_id = ${projects.id})`), desc(projects.createdAt)]
        break
      case 'popular':
        // Weighted: likes * 3 + views, then recently created
        orderBy = [
          desc(sql`(
            (SELECT count(*) FROM project_likes WHERE project_likes.project_id = ${projects.id}) * 3 +
            (SELECT count(*) FROM project_views WHERE project_views.project_id = ${projects.id})
          )`),
          desc(projects.createdAt)
        ]
        break
      case 'oldest':
        orderBy = [asc(projects.createdAt)]
        break
      default:
        // Smart mix: weighted popularity + recency
        orderBy = [
          desc(sql`(
            (SELECT count(*) FROM project_likes WHERE project_likes.project_id = ${projects.id}) * 3 +
            (SELECT count(*) FROM project_views WHERE project_views.project_id = ${projects.id}) +
            CASE WHEN ${projects.createdAt} > NOW() - INTERVAL '7 days' THEN 10 ELSE 0 END
          )`),
          desc(projects.createdAt)
        ]
    }

    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        logo: projects.logo,
        versions: projects.versions,
        layoutMode: projects.layoutMode,
        software: projects.software,
        language: projects.language,
        javaVersion: projects.javaVersion,
        compiler: projects.compiler,
        visibility: projects.visibility,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        ownerUsername: users.username,
        likes: sql<number>`(SELECT count(*) FROM project_likes WHERE project_likes.project_id = ${projects.id})::int`,
        views: sql<number>`(SELECT count(*) FROM project_views WHERE project_views.project_id = ${projects.id})::int`,
      })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(100)

    return rows
  })

  // Get single public project with like/view counts and current user status
  app.get('/api/community/projects/:id', { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const likes = await getProjectLikeCount(id)
    const views = await getProjectViewCount(id)

    let isLiked = false
    let isViewed = false
    const userId = request.user?.id
    if (userId) {
      isLiked = await isProjectLikedByUser(id, userId)
      isViewed = await isProjectViewedByUser(id, userId)
    }

    const { linkId: _, ownerId: __, ownerTier: ___, ...publicFields } = project

    return {
      ...publicFields,
      likes,
      views,
      isLiked,
      isViewed,
    }
  })

  // Track a view for a project (idempotent — one per user)
  app.post('/api/community/projects/:id/view', { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const userId = request.user?.id
    if (!userId) {
      // Anonymous view — still count as view but we can't deduplicate
      return { views: await getProjectViewCount(id) + 1 }
    }

    // Check if already viewed
    const alreadyViewed = await isProjectViewedByUser(id, userId)
    if (!alreadyViewed) {
      await db.insert(projectViews).values({ userId, projectId: id }).onConflictDoNothing()
    }

    const views = await getProjectViewCount(id)
    return { views, isViewed: true }
  })

  // Like a project
  app.post('/api/community/projects/:id/like', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user!.id

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    await db.insert(projectLikes).values({ userId, projectId: id }).onConflictDoNothing()

    const likes = await getProjectLikeCount(id)
    return { likes, isLiked: true }
  })

  // Unlike a project
  app.delete('/api/community/projects/:id/like', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user!.id

    await db
      .delete(projectLikes)
      .where(and(eq(projectLikes.projectId, id), eq(projectLikes.userId, userId)))

    const likes = await getProjectLikeCount(id)
    return { likes, isLiked: false }
  })

  // Get access level for current user on a community project
  app.get('/api/community/projects/:id/access', { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const userId = request.user?.id
    const userTier = request.user?.tier ?? 'free'
    const isOwner = userId === project.ownerId

    if (isOwner) {
      return { level: 'owner', canEdit: true, canFork: false, canDownload: true, canDownloadJar: true, canViewFiles: true, canUseAI: true, canGitHub: true, canReview: true }
    }

    if (userTier === 'paid') {
      return { level: 'paid', canEdit: false, canFork: true, canDownload: true, canDownloadJar: true, canViewFiles: true, canUseAI: false, canGitHub: false, canReview: false }
    }

    return { level: 'free', canEdit: false, canFork: false, canDownload: false, canDownloadJar: true, canViewFiles: true, canUseAI: false, canGitHub: false, canReview: false }
  })

  // Get file tree for public project
  app.get('/api/community/projects/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return { files: [] }
    }

    const projectDir = getProjectDir(project.ownerUsername, project.linkId)
    const files = await readFileTree(projectDir, projectDir, 10)
    return { files }
  })

  // Read file content for public project — ALL users can view file content (needed for chat history context and file tree browsing)
  app.get('/api/community/projects/:id/files/content', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { path: filePath } = request.query as { path?: string }

    if (!filePath) {
      return reply.status(400).send({ message: 'Missing path query parameter', statusCode: 400 })
    }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const projectDir = getProjectDir(project.ownerUsername, project.linkId)
    const fullPath = path.resolve(projectDir, filePath)

    if (!fullPath.startsWith(projectDir + '/')) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      const realProjectDir = await realpath(projectDir)
      const realFullPath = await realpath(fullPath)

      if (!realFullPath.startsWith(realProjectDir + '/')) {
        return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
      }

      const fileStat = await stat(realFullPath)
      if (!fileStat.isFile()) {
        return reply.status(400).send({ message: 'Path is not a file', statusCode: 400 })
      }
      const content = await readFile(realFullPath, 'utf-8')
      return { content, path: filePath }
    } catch {
      return reply.status(404).send({ message: 'File not found', statusCode: 404 })
    }
  })

  // Get chat messages for public project
  app.get('/api/community/projects/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const messages = await db
      .select({
        id: agentMessages.id,
        sessionId: agentMessages.sessionId,
        role: agentMessages.role,
        content: agentMessages.content,
        metadata: agentMessages.metadata,
        createdAt: agentMessages.createdAt,
      })
      .from(agentMessages)
      .innerJoin(agentSessions, eq(agentMessages.sessionId, agentSessions.id))
      .where(eq(agentSessions.projectId, id))
      .orderBy(asc(agentMessages.createdAt))

    return { messages }
  })

  // Fork a public project
  app.post('/api/community/projects/:id/fork', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user!.id
    const userTier = request.user!.tier ?? 'free'

    if (userTier !== 'paid') {
      return reply.status(403).send({ message: 'Forking requires a paid subscription', statusCode: 403 })
    }

    // Get the source project (must be public)
    const [sourceProject] = await db
      .select({
        id: projects.id,
        name: projects.name,
        linkId: projects.linkId,
        description: projects.description,
        software: projects.software,
        language: projects.language,
        javaVersion: projects.javaVersion,
        compiler: projects.compiler,
        ownerUsername: users.username,
      })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(and(eq(projects.id, id), eq(projects.visibility, 'public'), eq(projects.status, 'active')))
      .limit(1)

    if (!sourceProject) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const newLinkId = generateLinkId(sourceProject.name)

    const [newProject] = await db
      .insert(projects)
      .values({
        userId,
        name: `${sourceProject.name.slice(0, 121)} (Fork)`,
        linkId: newLinkId,
        description: sourceProject.description,
        software: sourceProject.software,
        language: sourceProject.language,
        javaVersion: sourceProject.javaVersion,
        compiler: sourceProject.compiler,
        visibility: 'private',
        forkedFrom: id,
      })
      .returning()

    // Copy filesystem
    if (sourceProject.linkId) {
      const srcDir = getProjectDir(sourceProject.ownerUsername, sourceProject.linkId)
      const destDir = getProjectDir(request.user!.username, newLinkId)

      try {
        await stat(srcDir)
        await cp(srcDir, destDir, { recursive: true })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          await mkdir(destDir, { recursive: true })
        } else {
          app.log.warn({ err, srcDir, destDir }, 'Failed to copy project files during fork')
          await mkdir(destDir, { recursive: true })
        }
      }
    } else {
      const destDir = getProjectDir(request.user!.username, newLinkId)
      await mkdir(destDir, { recursive: true })
    }

    return reply.status(201).send(newProject)
  })

  // Download project as ZIP — requires auth (any tier, or anonymous)
  app.get('/api/community/projects/:id/download/zip', async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project files not found', statusCode: 404 })
    }

    const projectDir = getProjectDir(project.ownerUsername, project.linkId)

    try {
      await stat(projectDir)
    } catch {
      return reply.status(404).send({ message: 'Project files not found', statusCode: 404 })
    }

    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const archive = archiver('zip', { zlib: { level: 6 } })

    archive.on('error', (err) => {
      app.log.error({ err, projectId: id }, 'Archive error')
      reply.raw.destroy(err)
    })

    archive.directory(projectDir, false)
    void archive.finalize()

    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="${safeName}.zip"`)

    return reply.send(archive)
  })

  // Download compiled plugin JAR — all users can download JAR
  app.get('/api/community/projects/:id/download/jar', async (request, reply) => {
    const { id } = request.params as { id: string }

    const project = await getPublicProject(id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project files not found', statusCode: 404 })
    }

    const projectDir = getProjectDir(project.ownerUsername, project.linkId)
    const targetDir = `${projectDir}/target`

    try {
      const entries = await stat(targetDir)
      if (!entries.isDirectory()) {
        return reply.status(404).send({ message: 'No compiled JAR found', statusCode: 404 })
      }
    } catch {
      return reply.status(404).send({ message: 'No compiled JAR found', statusCode: 404 })
    }

    // Find the plugin JAR (not the -sources.jar or -javadoc.jar)
    const { readdir } = await import('fs/promises')
    const files = await readdir(targetDir)
    const jarFile = files.find(f => f.endsWith('.jar') && !f.includes('-sources') && !f.includes('-javadoc'))

    if (!jarFile) {
      return reply.status(404).send({ message: 'No compiled JAR found', statusCode: 404 })
    }

    const jarPath = path.join(targetDir, jarFile)
    const content = await readFile(jarPath)

    reply.header('Content-Type', 'application/java-archive')
    reply.header('Content-Disposition', `attachment; filename="${jarFile}"`)
    return reply.send(content)
  })
}
