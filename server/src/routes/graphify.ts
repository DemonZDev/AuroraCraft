import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { createReadStream, existsSync } from 'fs'
import { join } from 'path'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { authMiddleware } from '../middleware/auth.js'
import {
  buildProjectGraph,
  removeProjectGraph,
  getWorkspaceDir,
} from '../utils/graphify-service.js'

/**
 * Graphify routes — paid-only "Save tokens using Graphify" feature.
 *  GET    /api/projects/:id/graphify             → { enabled, status, builtAt }
 *  POST   /api/projects/:id/graphify             → enable + (fire-and-forget) build
 *  DELETE /api/projects/:id/graphify             → remove artifacts + skill, clear intent
 *  GET    /api/projects/:id/graphify/graph.html  → stream the interactive graph (localhost viewer)
 *
 * Builds/queries cost 0 tokens (AST-only). Enforcement of agent access is via skill
 * presence (managed by graphify-service); see Graphify-Impliment.md.
 */
export async function graphifyRoutes(app: FastifyInstance) {
  const isPaid = (request: { user?: { tier?: 'free' | 'paid' | null } }): boolean =>
    (request.user?.tier ?? 'free') === 'paid'

  async function loadOwnedProject(userId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1)
    return project ?? null
  }

  // ── Status ──────────────────────────────────────────────────────────────
  app.get('/api/projects/:id/graphify', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }
    return {
      enabled: project.graphifyEnabled,
      status: project.graphifyStatus,
      builtAt: project.graphifyBuiltAt,
    }
  })

  // ── Enable + build ──────────────────────────────────────────────────────
  app.post('/api/projects/:id/graphify', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!isPaid(request)) {
      return reply.status(403).send({ message: 'Graphify requires a paid subscription.', statusCode: 403 })
    }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }
    if (!project.linkId) {
      return reply.status(400).send({ message: 'Project has no workspace directory yet', statusCode: 400 })
    }

    await db.update(projects)
      .set({ graphifyEnabled: true, graphifyStatus: 'building', updatedAt: new Date() })
      .where(eq(projects.id, id))

    const directory = getWorkspaceDir(request.user!.username, project.linkId)
    // Fire-and-forget: the build is no-AI and can take a few seconds.
    void buildProjectGraph(id, directory).catch((err) => {
      app.log.error({ err, projectId: id }, 'Graphify build failed')
    })

    return reply.status(202).send({ status: 'building' })
  })

  // ── Remove (explicit) ─────────────────────────────────────────────────────
  app.delete('/api/projects/:id/graphify', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!isPaid(request)) {
      return reply.status(403).send({ message: 'Graphify requires a paid subscription.', statusCode: 403 })
    }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    if (project.linkId) {
      const directory = getWorkspaceDir(request.user!.username, project.linkId)
      await removeProjectGraph(id, directory, { clearIntent: true })
    } else {
      await db.update(projects)
        .set({ graphifyEnabled: false, graphifyStatus: 'none', graphifyBuiltAt: null, updatedAt: new Date() })
        .where(eq(projects.id, id))
    }

    return reply.send({ status: 'none' })
  })

  // ── Graph viewer (HTML served over localhost) ─────────────────────────────
  app.get('/api/projects/:id/graphify/graph.html', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!isPaid(request)) {
      return reply.status(404).send({ message: 'Not found', statusCode: 404 })
    }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project || !project.linkId || project.graphifyStatus !== 'ready') {
      return reply.status(404).send({ message: 'Graph not available', statusCode: 404 })
    }

    const htmlPath = join(getWorkspaceDir(request.user!.username, project.linkId), 'graphify-out', 'graph.html')
    if (!existsSync(htmlPath)) {
      return reply.status(404).send({ message: 'Graph not available', statusCode: 404 })
    }

    // graph.html is a self-contained first-party file. It loads the vis-network
    // library from the unpkg CDN and uses inline scripts/styles, so the CSP must
    // permit those. The iframe that embeds this is sandboxed without allow-same-origin,
    // so even a crafted symbol-name XSS cannot reach the parent session.
    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Content-Security-Policy',
      "default-src 'self' data: blob:; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self' data: https://unpkg.com; " +
      "style-src 'self' 'unsafe-inline' https://unpkg.com; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com")
    reply.header('X-Content-Type-Options', 'nosniff')
    return reply.send(createReadStream(htmlPath))
  })
}
