import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import crypto from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, readdir, readFile, writeFile, rm, stat, rename as fsRename } from 'fs/promises'
import archiver from 'archiver'
import path from 'path'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { users } from '../db/schema/users.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { agentMessages } from '../db/schema/agent-messages.js'
import { agentLogs } from '../db/schema/agent-logs.js'
import { authMiddleware } from '../middleware/auth.js'
import { opencodeBridge } from '../bridges/index.js'

const createProjectSchema = z.object({
  name: z.string().min(2).max(128),
  description: z.string().max(1000).optional(),
  logo: z.string().optional(),
  versions: z.string().optional(),
  software: z.string().max(32).default('paper'),
  language: z.enum(['java', 'kotlin']).default('java'),
  javaVersion: z.string().max(8).default('21'),
  compiler: z.enum(['maven', 'gradle', 'both']).default('gradle'),
  bridge: z.enum(['opencode', 'kiro']).default('opencode'),
  visibility: z.enum(['public', 'private']).default('private'),
})

const updateProjectSchema = z.object({
  name: z.string().min(2).max(128).optional(),
  description: z.string().max(1000).nullable().optional(),
  logo: z.string().nullable().optional(),
  versions: z.string().nullable().optional(),
  layoutMode: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
  software: z.string().max(32).optional(),
  language: z.enum(['java', 'kotlin']).optional(),
  javaVersion: z.string().max(8).optional(),
  compiler: z.enum(['maven', 'gradle', 'both']).optional(),
  visibility: z.enum(['public', 'private']).optional(),
})

export function generateLinkId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  const hex = crypto.randomBytes(3).toString('hex')
  return `${slug}-${hex}`
}

export interface FileTreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeEntry[]
}

export async function readFileTree(dirPath: string, relativeTo: string, maxDepth: number): Promise<FileTreeEntry[]> {
  if (maxDepth <= 0) return []

  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const result: FileTreeEntry[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue

      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.relative(relativeTo, fullPath)

      if (entry.isDirectory()) {
        const children = await readFileTree(fullPath, relativeTo, maxDepth - 1)
        result.push({ name: entry.name, path: relPath, type: 'directory', children })
      } else {
        result.push({ name: entry.name, path: relPath, type: 'file' })
      }
    }

    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch {
    return []
  }
}

export async function projectRoutes(app: FastifyInstance) {
  // List projects for current user
  app.get('/api/projects', { preHandler: [authMiddleware] }, async (request) => {
    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, request.user!.id))
      .orderBy(desc(projects.updatedAt))

    return userProjects
  })

  // Get single project
  app.get('/api/projects/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    return project
  })

  // Get project stats
  app.get('/api/projects/:id/jars', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      return reply.code(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return { maven: null, gradle: null }
    }

    const result: { maven: string | null; gradle: string | null } = { maven: null, gradle: null }

    try {
      const mavenDir = path.join(projectDir, 'target')
      const mavenFiles = await readdir(mavenDir)
      const mavenJar = mavenFiles.find(f => f.endsWith('.jar') && !f.endsWith('-sources.jar'))
      if (mavenJar) result.maven = mavenJar
    } catch {}

    try {
      const gradleDir = path.join(projectDir, 'build', 'libs')
      const gradleFiles = await readdir(gradleDir)
      const gradleJar = gradleFiles.find(f => f.endsWith('.jar') && !f.endsWith('-sources.jar'))
      if (gradleJar) result.gradle = gradleJar
    } catch {}

    return result
  })

  app.get('/api/projects/:id/jars/:type/download', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, type } = request.params as { id: string; type: 'maven' | 'gradle' }
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!project || project.userId !== request.user!.id) {
      return reply.code(404).send({ error: 'Project not found' })
    }

    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    if (!projectDir) {
      return reply.code(404).send({ error: 'Project directory not found' })
    }

    const jarDir = type === 'maven' ? path.join(projectDir, 'target') : path.join(projectDir, 'build', 'libs')
    try {
      const files = await readdir(jarDir)
      const jarFile = files.find(f => f.endsWith('.jar') && !f.endsWith('-sources.jar'))
      if (!jarFile) {
        return reply.code(404).send({ error: 'JAR file not found' })
      }

      const jarPath = path.join(jarDir, jarFile)
      const jarContent = await readFile(jarPath)
      reply.header('Content-Type', 'application/java-archive')
      reply.header('Content-Disposition', `attachment; filename="${jarFile}"`)
      return reply.send(jarContent)
    } catch {
      return reply.code(404).send({ error: 'JAR file not found' })
    }
  })

  app.get('/api/projects/:id/stats', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const sessionRows = await db
      .select({ id: agentSessions.id })
      .from(agentSessions)
      .where(eq(agentSessions.projectId, id))

    const sessionIds = sessionRows.map((s) => s.id)

    // Count files in project directory
    const projectDir = project.linkId ? `/home/auroracraft-${request.user!.username}/${project.linkId}` : null
    let fileCount = 0
    if (projectDir) {
      try {
        const countFiles = async (dir: string): Promise<number> => {
          let count = 0
          const entries = await readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue
            if (entry.isDirectory()) {
              count += await countFiles(path.join(dir, entry.name))
            } else {
              count++
            }
          }
          return count
        }
        fileCount = await countFiles(projectDir)
      } catch {
        fileCount = 0
      }
    }

    if (sessionIds.length === 0) {
      return {
        userMessages: 0,
        aiMessages: 0,
        files: fileCount,
        tokensUsed: 0,
        createdAt: project.createdAt,
      }
    }

    const messageCounts = await db
      .select({ role: agentMessages.role, count: sql<number>`count(*)::int` })
      .from(agentMessages)
      .where(inArray(agentMessages.sessionId, sessionIds))
      .groupBy(agentMessages.role)

    const userMessages = messageCounts.find((m) => m.role === 'user')?.count ?? 0
    const aiMessages = messageCounts.find((m) => m.role === 'agent')?.count ?? 0

    return {
      userMessages,
      aiMessages,
      files: fileCount,
      tokensUsed: 0,
      createdAt: project.createdAt,
    }
  })

  // Create project
  app.post('/api/projects', { preHandler: [authMiddleware] }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        message: parsed.error.issues[0].message,
        statusCode: 400,
      })
    }

    const linkId = generateLinkId(parsed.data.name)
    const username = request.user!.username

    const [project] = await db
      .insert(projects)
      .values({
        userId: request.user!.id,
        linkId,
        ...parsed.data,
      })
      .returning()

    // Create project directory
    const projectDir = `/home/auroracraft-${username}/${linkId}`
    try {
      await mkdir(projectDir, { recursive: true })
      
      // Initialize git repository
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      
      await execAsync(`cd "${projectDir}" && git init && git config user.name "${username}" && git config user.email "${request.user!.email}"`)
      
      // Create initial commit with empty .gitkeep
      await execAsync(`cd "${projectDir}" && touch .gitkeep && git add .gitkeep && git commit -m "Initial commit"`)
      
      // Fix ownership
      await execAsync(`chown -R auroracraft-${username}:auroracraft-${username} "${projectDir}"`)
      
      // Add to safe.directory for the user
      await execAsync(`su - auroracraft-${username} -c "git config --global --add safe.directory '${projectDir}'"`)
      
      app.log.info({ projectDir }, 'Initialized git repository for blank project')
    } catch (err) {
      app.log.warn({ err, projectDir }, 'Failed to create project directory or initialize git')
    }

    return reply.status(201).send(project)
  })

  // Upload ZIP project
  app.post('/api/projects/upload', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const parts = request.parts()
      const fields: Record<string, string> = {}
      let zipBuffer: Buffer | null = null

      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'zipFile') {
            zipBuffer = await part.toBuffer()
          }
        } else {
          fields[part.fieldname] = part.value as string
        }
      }

      if (!zipBuffer) {
        return reply.status(400).send({ error: 'No ZIP file uploaded' })
      }

      const parsed = createProjectSchema.safeParse(fields)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message })
      }

      const linkId = generateLinkId(parsed.data.name)
      const username = request.user!.username
      const projectDir = `/home/auroracraft-${username}/${linkId}`

      await mkdir(projectDir, { recursive: true })

      // Save uploaded zip
      const zipPath = path.join(projectDir, 'upload.zip')
      await writeFile(zipPath, zipBuffer)

      // Extract zip
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`unzip -q "${zipPath}" -d "${projectDir}"`)
      await rm(zipPath)

      const [project] = await db
        .insert(projects)
        .values({
          userId: request.user!.id,
          linkId,
          ...parsed.data,
        })
        .returning()

      return reply.status(201).send(project)
    } catch (err) {
      app.log.error({ err }, 'Failed to upload and extract ZIP')
      return reply.status(500).send({ error: 'Failed to process ZIP file' })
    }
  })

  // Clone GitHub repository
  app.post('/api/projects/clone', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { repoUrl, branch, commit, isPrivate, ...projectData } = request.body as { repoUrl: string; branch?: string; commit?: string; isPrivate: boolean; [key: string]: unknown }

    const parsed = createProjectSchema.safeParse(projectData)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message })
    }

    const linkId = generateLinkId(parsed.data.name)
    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${linkId}`

    try {
      await mkdir(projectDir, { recursive: true })

      let cloneUrl = repoUrl
      if (isPrivate) {
        const [user] = await db
          .select({ githubAccessToken: users.githubAccessToken })
          .from(users)
          .where(eq(users.id, request.user!.id))
          .limit(1)

        if (!user.githubAccessToken) {
          await rm(projectDir, { recursive: true, force: true })
          return reply.status(400).send({ error: 'GitHub account not connected' })
        }

        // Convert https://github.com/owner/repo to https://oauth2:TOKEN@github.com/owner/repo
        cloneUrl = repoUrl.replace('https://github.com/', `https://oauth2:${user.githubAccessToken}@github.com/`)
      }

      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const branchFlag = branch ? ` -b "${branch}"` : ''
      await execAsync(`git clone${branchFlag} "${cloneUrl}" "${projectDir}"`)

      // Checkout specific commit if provided
      if (commit) {
        await execAsync(`git checkout "${commit}"`, { cwd: projectDir })
      }

      // For private repos: auto-connect the cloned repo
      // For public repos: user must manually connect their own repo later
      const repoUrlToSave = isPrivate ? repoUrl : null
      const repoBranchToSave = isPrivate ? (branch || 'main') : null

      const [project] = await db
        .insert(projects)
        .values({
          userId: request.user!.id,
          linkId,
          repoUrl: repoUrlToSave,
          repoBranch: repoBranchToSave,
          ...parsed.data,
        })
        .returning()

      // Also set git remote for private repos so reset/push work immediately
      if (isPrivate && repoUrlToSave) {
        try {
          const { exec } = await import('child_process')
          const { promisify } = await import('util')
          const execAsync = promisify(exec)
          await execAsync(`git remote add origin "${repoUrlToSave}"`, { cwd: projectDir })
        } catch {
          // Non-fatal
        }
      }

      return reply.status(201).send(project)
    } catch (err) {
      app.log.error({ err }, 'Failed to clone repository')
      try {
        await rm(projectDir, { recursive: true, force: true })
      } catch {}
      return reply.status(500).send({ error: 'Failed to clone repository' })
    }
  })

  // Update project
  app.patch('/api/projects/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateProjectSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        message: parsed.error.issues[0].message,
        statusCode: 400,
      })
    }

    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const [updated] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning()

    return updated
  })

  // Delete project
  app.delete('/api/projects/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [existing] = await db
      .select({ id: projects.id, linkId: projects.linkId })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    // Clean up OpenCode sessions before deleting the project
    const sessions = await db
      .select({ opencodeSessionId: agentSessions.opencodeSessionId })
      .from(agentSessions)
      .where(eq(agentSessions.projectId, id))

    const ocSessionIds = sessions
      .map((s) => s.opencodeSessionId)
      .filter((ocId): ocId is string => !!ocId)

    if (ocSessionIds.length > 0) {
      await Promise.allSettled(
        ocSessionIds.map((ocId) => opencodeBridge.deleteSession(ocId)),
      )
    }

    await db.delete(projects).where(eq(projects.id, id))

    // Clean up project directory (non-blocking)
    if (existing.linkId) {
      const username = request.user!.username
      const projectDir = `/home/auroracraft-${username}/${existing.linkId}`
      // Use sudo to delete directory since it's owned by auroracraft-admin
      import('child_process').then(({ exec }) => {
        exec(`sudo rm -rf "${projectDir}"`, (err) => {
          if (err) {
            app.log.warn({ err, projectDir }, 'Failed to remove project directory')
          } else {
            app.log.info({ projectDir }, 'Project directory removed successfully')
          }
        })
      }).catch((err) => {
        app.log.warn({ err, projectDir }, 'Failed to import child_process')
      })
    }

    return reply.status(204).send()
  })

  // Get file tree for a project
  app.get('/api/projects/:id/files', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return { files: [] }
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const files = await readFileTree(projectDir, projectDir, 10)

    return { files }
  })

  // Read file content
  app.get('/api/projects/:id/files/content', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { path: filePath } = request.query as { path?: string }

    if (!filePath) {
      return reply.status(400).send({ message: 'Missing path query parameter', statusCode: 400 })
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const fullPath = path.resolve(projectDir, filePath)

    // Security: ensure the resolved path is within the project directory
    if (!fullPath.startsWith(projectDir + '/')) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      const fileStat = await stat(fullPath)
      if (!fileStat.isFile()) {
        return reply.status(400).send({ message: 'Path is not a file', statusCode: 400 })
      }
      const content = await readFile(fullPath, 'utf-8')
      return { content, path: filePath }
    } catch {
      return reply.status(404).send({ message: 'File not found', statusCode: 404 })
    }
  })

  // Save/write file content
  app.put('/api/projects/:id/files/content', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = z.object({ path: z.string().min(1), content: z.string() }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const fullPath = path.resolve(projectDir, parsed.data.path)

    if (!fullPath.startsWith(projectDir + '/')) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      await mkdir(path.dirname(fullPath), { recursive: true })
      await writeFile(fullPath, parsed.data.content, 'utf-8')
    } catch (err) {
      app.log.error({ err, path: parsed.data.path }, 'Failed to write file')
      return reply.status(500).send({ message: 'Failed to write file', statusCode: 500 })
    }

    return { success: true, path: parsed.data.path }
  })

  // Create file or folder
  app.post('/api/projects/:id/files/create', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = z.object({ path: z.string().min(1), type: z.enum(['file', 'directory']) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const fullPath = path.resolve(projectDir, parsed.data.path)

    if (!fullPath.startsWith(projectDir + '/')) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      await stat(fullPath)
      return reply.status(409).send({ message: `${parsed.data.type === 'directory' ? 'Folder' : 'File'} already exists at ${parsed.data.path}`, statusCode: 409 })
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    try {
      if (parsed.data.type === 'directory') {
        await mkdir(fullPath, { recursive: true })
      } else {
        await mkdir(path.dirname(fullPath), { recursive: true })
        await writeFile(fullPath, '', 'utf-8')
      }
    } catch (err) {
      app.log.error({ err, path: parsed.data.path }, 'Failed to create file/folder')
      return reply.status(500).send({ message: 'Failed to create file/folder', statusCode: 500 })
    }

    return reply.status(201).send({ success: true, path: parsed.data.path, type: parsed.data.type })
  })

  // Delete file or folder
  app.delete('/api/projects/:id/files/delete', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = z.object({ path: z.string().min(1) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const fullPath = path.resolve(projectDir, parsed.data.path)

    if (!fullPath.startsWith(projectDir + '/') || fullPath === projectDir) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      await rm(fullPath, { recursive: true, force: true })
    } catch (err) {
      app.log.error({ err, path: parsed.data.path }, 'Failed to delete file/folder')
      return reply.status(500).send({ message: 'Failed to delete file/folder', statusCode: 500 })
    }

    return reply.status(204).send()
  })

  // Rename file or folder
  app.post('/api/projects/:id/files/rename', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = z.object({ oldPath: z.string().min(1), newPath: z.string().min(1) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const oldFullPath = path.resolve(projectDir, parsed.data.oldPath)
    const newFullPath = path.resolve(projectDir, parsed.data.newPath)

    if (!oldFullPath.startsWith(projectDir + '/') || !newFullPath.startsWith(projectDir + '/')) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      await stat(newFullPath)
      return reply.status(409).send({ message: `A file or folder already exists at ${parsed.data.newPath}`, statusCode: 409 })
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    try {
      await mkdir(path.dirname(newFullPath), { recursive: true })
      await fsRename(oldFullPath, newFullPath)
    } catch (err) {
      app.log.error({ err, oldPath: parsed.data.oldPath, newPath: parsed.data.newPath }, 'Failed to rename file/folder')
      return reply.status(500).send({ message: 'Failed to rename file/folder', statusCode: 500 })
    }

    return { success: true, oldPath: parsed.data.oldPath, newPath: parsed.data.newPath }
  })

  // Download project as ZIP
  app.get('/api/projects/:id/download/zip', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project files not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`

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

  // Download a specific project file
  app.get('/api/projects/:id/files/download', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { path: filePath } = request.query as { path?: string }

    if (!filePath) {
      return reply.status(400).send({ message: 'Missing path query parameter', statusCode: 400 })
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.user!.id)))
      .limit(1)

    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (!project.linkId) {
      return reply.status(404).send({ message: 'Project directory not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = `/home/auroracraft-${username}/${project.linkId}`
    const fullPath = path.resolve(projectDir, filePath)

    if (!fullPath.startsWith(projectDir + '/')) {
      return reply.status(403).send({ message: 'Access denied', statusCode: 403 })
    }

    try {
      const fileStat = await stat(fullPath)
      if (!fileStat.isFile()) {
        return reply.status(400).send({ message: 'Path is not a file', statusCode: 400 })
      }

      reply.header('Content-Type', 'application/octet-stream')
      reply.header('Content-Disposition', `attachment; filename="${path.basename(fullPath)}"`)
      return reply.send(createReadStream(fullPath))
    } catch {
      return reply.status(404).send({ message: 'File not found', statusCode: 404 })
    }
  })
}
