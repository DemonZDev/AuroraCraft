import type { FastifyInstance } from 'fastify'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { assistantJobs } from '../db/schema/assistant-jobs.js'
import { getUserProviderKeys } from '../utils/token-service.js'
import { ASSISTANT_MODELS, getAssistantModel } from '../config/assistant-models.js'
import { sessionEventBus } from '../bridges/session-event-bus.js'
import type { StreamEvent } from '../bridges/types.js'
import { startJob, reviseJob, stopJob, getActiveJob } from '../utils/assistant-service.js'

type JobRow = typeof assistantJobs.$inferSelect

function serializeJob(j: JobRow) {
  return {
    id: j.id,
    projectId: j.projectId,
    sessionId: j.sessionId,
    kind: j.kind,
    status: j.status,
    model: j.model,
    input: j.input,
    draft: j.draft ?? null,
    result: j.result ?? null,
    error: j.error ?? null,
    createdAt: j.createdAt instanceof Date ? j.createdAt.toISOString() : j.createdAt,
    updatedAt: j.updatedAt instanceof Date ? j.updatedAt.toISOString() : j.updatedAt,
    completedAt: j.completedAt instanceof Date ? j.completedAt.toISOString() : j.completedAt ?? null,
  }
}

export async function assistantRoutes(app: FastifyInstance) {
  async function loadOwnedProject(userId: string, id: string) {
    const [p] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1)
    return p ?? null
  }

  async function loadOwnedJob(userId: string, projectId: string, jobId: string): Promise<JobRow | null> {
    const [j] = await db
      .select()
      .from(assistantJobs)
      .where(and(eq(assistantJobs.id, jobId), eq(assistantJobs.projectId, projectId), eq(assistantJobs.userId, userId)))
      .limit(1)
    return j ?? null
  }

  // ── Config ─────────────────────────────────────────────────────────────────

  app.get('/api/projects/:id/assistant', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await loadOwnedProject(req.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found' })
    const tier = req.user!.tier ?? 'free'
    const keys = await getUserProviderKeys(req.user!.id)
    const hasKey = !!keys['nvidia-nim']
    return {
      enabled: project.assistantEnabled,
      model: project.assistantModel,
      hasKey,
      tier,
      available: tier === 'paid' && project.assistantEnabled && hasKey,
      models: ASSISTANT_MODELS.map((m) => ({ id: m.id, name: m.name, description: m.description, isDefault: !!m.isDefault })),
    }
  })

  app.patch('/api/projects/:id/assistant', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { enabled?: boolean; model?: string }
    const project = await loadOwnedProject(req.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found' })
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.model === 'string') {
      if (!getAssistantModel(body.model)) return reply.status(400).send({ message: 'Unknown model' })
      patch.assistantModel = body.model
    }
    if (typeof body.enabled === 'boolean') {
      if (body.enabled) {
        if ((req.user!.tier ?? 'free') !== 'paid') return reply.status(403).send({ message: 'Assistant requires a paid subscription.' })
        const keys = await getUserProviderKeys(req.user!.id)
        if (!keys['nvidia-nim']) return reply.status(403).send({ message: 'No NVIDIA NIM API key is set for your account.' })
      }
      patch.assistantEnabled = body.enabled
      patch.assistantEnabledSnapshot = null // explicit user action clears any pending restore
    }
    await db.update(projects).set(patch).where(eq(projects.id, id))
    return { success: true }
  })

  // ── Feature 1: enhance ───────────────────────────────────────────────────────

  app.post('/api/projects/:id/assistant/enhance', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { prompt, style } = req.body as { prompt?: string; style?: string }
    if (!prompt?.trim()) return reply.status(400).send({ message: 'Prompt required' })
    if (!['optimized', 'structured', 'explanatory', 'feature_adding'].includes(style ?? '')) return reply.status(400).send({ message: 'Invalid style' })
    const project = await loadOwnedProject(req.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found' })
    if ((req.user!.tier ?? 'free') !== 'paid' || !project.assistantEnabled) return reply.status(403).send({ message: 'Assistant unavailable' })
    if (await getActiveJob(id)) return reply.status(409).send({ message: 'An assistant task is already in progress.' })
    const { jobId } = await startJob({ projectId: id, userId: req.user!.id, kind: 'enhance', input: { prompt: prompt.trim(), style } })
    return reply.status(202).send({ jobId })
  })

  // ── Feature 2: error-fix ───────────────────────────────────────────────────────

  app.post('/api/projects/:id/assistant/error-fix', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { issues } = req.body as { issues?: unknown[] }
    if (!Array.isArray(issues) || !issues.length) return reply.status(400).send({ message: 'No issues' })
    const project = await loadOwnedProject(req.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found' })
    if ((req.user!.tier ?? 'free') !== 'paid' || !project.assistantEnabled) return reply.status(403).send({ message: 'Assistant unavailable' })
    if (await getActiveJob(id)) return reply.status(409).send({ message: 'An assistant task is already in progress.' })
    const { jobId } = await startJob({ projectId: id, userId: req.user!.id, kind: 'error_fix', input: { issues } })
    return reply.status(202).send({ jobId })
  })

  // ── Job actions ────────────────────────────────────────────────────────────

  app.post('/api/projects/:id/assistant/jobs/:jobId/revise', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const { feedback } = req.body as { feedback?: string }
    if (!feedback?.trim()) return reply.status(400).send({ message: 'Feedback required' })
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job) return reply.status(404).send({ message: 'Job not found' })
    try {
      await reviseJob(jobId, feedback.trim())
    } catch (e: any) {
      return reply.status(409).send({ message: e?.message ?? 'Cannot revise' })
    }
    return reply.status(202).send({ jobId })
  })

  app.post('/api/projects/:id/assistant/jobs/:jobId/confirm', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job) return reply.status(404).send({ message: 'Job not found' })
    if (job.kind !== 'enhance' || job.status !== 'awaiting_user') return reply.status(409).send({ message: 'Not confirmable' })
    await db
      .update(assistantJobs)
      .set({ status: 'done', result: job.draft, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(assistantJobs.id, jobId))
    return { prompt: (job.draft as any)?.prompt ?? '' }
  })

  app.post('/api/projects/:id/assistant/jobs/:jobId/accept-action', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const { actionId } = req.body as { actionId?: string }
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job || job.kind !== 'post_session' || job.status !== 'awaiting_user') return reply.status(409).send({ message: 'Not actionable' })
    const action = ((job.result as any)?.actions ?? []).find((a: any) => a.id === actionId)
    if (!action) return reply.status(400).send({ message: 'Unknown action' })
    await db
      .update(assistantJobs)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(assistantJobs.id, jobId))
    return { action }
  })

  app.post('/api/projects/:id/assistant/jobs/:jobId/cancel', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job) return reply.status(404).send({ message: 'Job not found' })
    stopJob(jobId) // abort if mid-run
    await db
      .update(assistantJobs)
      .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(assistantJobs.id, jobId))
    return { success: true }
  })

  app.post('/api/projects/:id/assistant/jobs/:jobId/stop', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job) return reply.status(404).send({ message: 'Job not found' })
    stopJob(jobId)
    return { success: true }
  })

  // ── Reads ────────────────────────────────────────────────────────────────────

  app.get('/api/projects/:id/assistant/jobs/active', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await loadOwnedProject(req.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found' })
    const job = await getActiveJob(id)
    return job ? serializeJob(job) : null
  })

  app.get('/api/projects/:id/assistant/jobs/:jobId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job) return reply.status(404).send({ message: 'Job not found' })
    return serializeJob(job)
  })

  // ── SSE live progress (mirrors agents.ts stream skeleton) ────────────────────

  app.get('/api/projects/:id/assistant/jobs/:jobId/stream', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string }
    const job = await loadOwnedJob(req.user!.id, id, jobId)
    if (!job) return reply.status(404).send({ message: 'Job not found' })

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const sendSSE = (data: unknown) => {
      if (!raw.destroyed) raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    const heartbeat = setInterval(() => {
      if (!raw.destroyed) raw.write(': heartbeat\n\n')
    }, 15000)

    sendSSE({ type: 'status', status: 'connected' })

    const unsubscribe = sessionEventBus.subscribe(`assistant:${jobId}`, (event: StreamEvent) => {
      sendSSE(event)
      if (event.type === 'complete' || event.type === 'error') {
        clearInterval(heartbeat)
        if (!raw.destroyed) raw.end()
      }
    })

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })
}
