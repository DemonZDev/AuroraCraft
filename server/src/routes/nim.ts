import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, inArray, notInArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { codeReviews } from '../db/schema/code-reviews.js'
import { nimJobs, NIM_TERMINAL_STATUSES, type NimJob, type NimJobStatus } from '../db/schema/nim-jobs.js'
import { authMiddleware } from '../middleware/auth.js'
import { users } from '../db/schema/users.js'
import { nimEngine, type EnhanceStyle, type NimTarget } from '../agents/nim-engine.js'
import { resolveModelById, listModelsForUsage, getUserProviderKeyMap, type ModelUsage } from '../utils/ai-runtime.js'

type NimResolution =
  | { ok: true; target: NimTarget; apiKey: string }
  | { ok: false; status: number; message: string }

/**
 * Resolve a model id (for the Prompt Enhancer / Error Prompt Maker) into a concrete
 * call target + the user's provider key. Enforces usage, tier, and key presence.
 * These features call chat-completions directly, so a Zen model (no base URL) is rejected.
 */
async function resolveNimTarget(
  userId: string,
  tier: 'free' | 'paid',
  modelId: string,
  usage: ModelUsage,
): Promise<NimResolution> {
  const model = await resolveModelById(modelId)
  if (!model || !model.isActive || !model.provider.isActive || !model.usages.includes(usage)) {
    return { ok: false, status: 400, message: 'Selected model is not available for this feature.' }
  }
  if (model.provider.kind === 'zen' || !model.provider.baseUrl) {
    return { ok: false, status: 400, message: 'Selected model does not support this feature.' }
  }
  if (!model.provider.isFree && tier !== 'paid') {
    return { ok: false, status: 403, message: `${model.showName} requires a paid subscription.` }
  }
  const keys = await getUserProviderKeyMap(userId)
  const apiKey = keys[model.provider.slug]
  if (!apiKey) {
    return { ok: false, status: 403, message: `No API key configured for ${model.provider.name}. Ask an admin to add one.` }
  }
  return { ok: true, target: { baseUrl: model.provider.baseUrl, slug: model.realName }, apiKey }
}

async function getUserTier(userId: string): Promise<'free' | 'paid'> {
  const [u] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.tier ?? 'free'
}

const enhanceSchema = z.object({
  prompt: z.string().min(1).max(20000),
  style: z.enum(['optimized', 'structured', 'explanatory', 'feature_adding']),
  nimModel: z.string().min(1).max(60),
})
const refineSchema = z.object({ changeRequest: z.string().min(1).max(8000) })
const errorFixSchema = z.object({
  reviewIssueRefs: z.array(z.object({ reviewId: z.string().uuid(), issueIdx: z.number().int().min(0) })).min(1).max(30),
  nimModel: z.string().min(1).max(60),
  agentModel: z.string().max(100),
  sessionId: z.string().uuid().optional(),
})
// In-Built Prompt Maker: a no-NIM error_fix job carrying a pre-built prompt so the
// in-built dispatch is just as refresh-proof + idempotent as the AI flow.
const dispatchSchema = z.object({
  prompt: z.string().min(1).max(50000),
  agentModel: z.string().max(100),
})

const isTerminal = (s: string): boolean => NIM_TERMINAL_STATUSES.includes(s as NimJobStatus)

export async function nimRoutes(app: FastifyInstance) {
  async function loadOwnedProject(userId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1)
    return project ?? null
  }

  function publicJob(job: NimJob, includeResult: boolean) {
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      nimModel: job.nimModel,
      agentModel: job.agentModel,
      style: job.style,
      error: job.error,
      result: includeResult ? job.resultJson : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  // Enhancer needs its result to render; error_fix exposes its result only when 'ready'
  // (so the client can dispatch it to the Agent).
  const shouldIncludeResult = (job: NimJob): boolean =>
    job.kind === 'prompt_enhance' || job.status === 'ready'

  async function pruneJobs(projectId: string, userId: string): Promise<void> {
    const terminal = await db.select({ id: nimJobs.id }).from(nimJobs)
      .where(and(eq(nimJobs.projectId, projectId), eq(nimJobs.userId, userId), inArray(nimJobs.status, NIM_TERMINAL_STATUSES)))
      .orderBy(desc(nimJobs.createdAt))
    const stale = terminal.slice(30).map((r) => r.id)
    if (stale.length) await db.delete(nimJobs).where(inArray(nimJobs.id, stale)).catch(() => {})
  }

  // ── Models (for the Prompt Enhancer + Error Prompt Maker pickers) ──────
  app.get('/api/nim/models', { preHandler: [authMiddleware] }, async (request) => {
    const tier = await getUserTier(request.user!.id)
    const userKeys = await getUserProviderKeyMap(request.user!.id)

    const shape = (usage: ModelUsage) =>
      listModelsForUsage(usage, tier).then((models) =>
        models
          // enhancer/maker call chat-completions directly — Zen (no base URL) can't serve them
          .filter((m) => m.provider.kind !== 'zen' && !!m.provider.baseUrl)
          .map((m) => ({
            id: m.id,
            label: m.showName,
            typeTag: m.typeTag,
            providerName: m.provider.name,
            isFree: m.provider.isFree,
            hasKey: !!userKeys[m.provider.slug],
          })),
      )

    const [enhancer, errorMaker] = await Promise.all([shape('prompt_enhancer'), shape('error_prompt_maker')])
    // Default = first model the user can actually run (has a key), else the first listed.
    const pick = (list: typeof enhancer) => (list.find((m) => m.hasKey) ?? list[0])?.id ?? ''
    return {
      enhancer,
      errorMaker,
      defaultEnhancerId: pick(enhancer),
      defaultErrorMakerId: pick(errorMaker),
    }
  })

  // ── Latest non-terminal job (re-attach after refresh) ─────────────────
  app.get('/api/projects/:id/nim/active', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })

    // Latest NON-terminal job (so an older awaiting_user job is still found even if a
    // newer terminal job exists). In the UI the workspace lock prevents that ordering,
    // but this keeps re-attach correct regardless.
    const [job] = await db.select().from(nimJobs)
      .where(and(
        eq(nimJobs.projectId, id),
        eq(nimJobs.userId, request.user!.id),
        notInArray(nimJobs.status, NIM_TERMINAL_STATUSES),
      ))
      .orderBy(desc(nimJobs.createdAt))
      .limit(1)

    if (!job) return { job: null }
    return { job: publicJob(job, shouldIncludeResult(job)) }
  })

  // ── Poll one job ──────────────────────────────────────────────────────
  app.get('/api/projects/:id/nim/jobs/:jobId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const [job] = await db.select().from(nimJobs)
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
      .limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    return { job: publicJob(job, shouldIncludeResult(job)) }
  })

  // ── Force-stop ────────────────────────────────────────────────────────
  app.post('/api/projects/:id/nim/jobs/:jobId/cancel', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const [job] = await db.select().from(nimJobs)
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
      .limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    if (!isTerminal(job.status)) {
      await db.update(nimJobs).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(nimJobs.id, jobId))
    }
    nimEngine.abort(jobId)
    return { status: 'cancelled' }
  })

  // ── Prompt Enhancer: start ────────────────────────────────────────────
  app.post('/api/projects/:id/nim/enhance', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    const parsed = enhanceSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const tier = await getUserTier(request.user!.id)
    const resolved = await resolveNimTarget(request.user!.id, tier, parsed.data.nimModel, 'prompt_enhancer')
    if (!resolved.ok) return reply.status(resolved.status).send({ message: resolved.message, statusCode: resolved.status })

    const modelId = parsed.data.nimModel
    const [job] = await db.insert(nimJobs).values({
      userId: request.user!.id, projectId: id, kind: 'prompt_enhance', status: 'running',
      nimModel: modelId, style: parsed.data.style, inputJson: { prompt: parsed.data.prompt },
    }).returning()

    void nimEngine.runEnhance(job.id, resolved.apiKey, parsed.data.style as EnhanceStyle, resolved.target, {
      prompt: parsed.data.prompt, projectName: project.name, software: project.software, language: project.language,
    }).catch((err) => app.log.error({ err, jobId: job.id }, 'enhance job crashed'))

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: job.id })
  })

  // ── Prompt Enhancer: refine ───────────────────────────────────────────
  app.post('/api/projects/:id/nim/enhance/:jobId/refine', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const parsed = refineSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [job] = await db.select().from(nimJobs)
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id))).limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    if (job.kind !== 'prompt_enhance' || job.status !== 'awaiting_user')
      return reply.status(409).send({ message: 'Job is not awaiting input', statusCode: 409 })

    const tier = await getUserTier(request.user!.id)
    const resolved = await resolveNimTarget(request.user!.id, tier, job.nimModel, 'prompt_enhancer')
    if (!resolved.ok) return reply.status(resolved.status).send({ message: resolved.message, statusCode: resolved.status })

    const current = (job.resultJson as { prompt?: string })?.prompt ?? ''
    const history = (job.historyJson as unknown[]) ?? []
    await db.update(nimJobs).set({ status: 'running', updatedAt: new Date() }).where(eq(nimJobs.id, jobId))
    void nimEngine.runRefine(jobId, resolved.apiKey, resolved.target, current, parsed.data.changeRequest, history)
      .catch((err) => app.log.error({ err, jobId }, 'refine job crashed'))
    return reply.status(202).send({ jobId })
  })

  // ── Prompt Enhancer: mark completed (client dispatched the confirmed prompt) ──
  app.post('/api/projects/:id/nim/enhance/:jobId/complete', { preHandler: [authMiddleware] }, async (request) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    await db.update(nimJobs).set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
    return { status: 'completed' }
  })

  // ── Prompt Enhancer: dispatch to Agent (refresh-proof, idempotent) ─────
  // Marks the enhance job completed atomically and creates a ready agent_dispatch
  // job so the actual send can survive refresh and is claimed only once by /messages.
  const enhanceDispatchSchema = z.object({ agentModel: z.string().max(100) })
  app.post('/api/projects/:id/nim/enhance/:jobId/dispatch', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })

    const parsed = enhanceDispatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [job] = await db.select().from(nimJobs)
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id))).limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    if (job.kind !== 'prompt_enhance' || job.status !== 'awaiting_user')
      return reply.status(409).send({ message: 'Job is not awaiting input', statusCode: 409 })

    const prompt = (job.resultJson as { prompt?: string })?.prompt ?? ''
    if (!prompt) return reply.status(409).send({ message: 'No enhanced prompt available', statusCode: 409 })

    // Mark the enhance job completed so it won't re-attach
    await db.update(nimJobs).set({ status: 'completed', updatedAt: new Date() }).where(eq(nimJobs.id, jobId))

    // Create a refresh-proof dispatch job that carries the final prompt
    const [dispatchJob] = await db.insert(nimJobs).values({
      userId: request.user!.id, projectId: id, kind: 'agent_dispatch', status: 'ready',
      nimModel: job.nimModel, agentModel: parsed.data.agentModel,
      resultJson: { prompt },
    }).returning()

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: dispatchJob.id })
  })

  // ── Error Prompt Maker (Option A): start ──────────────────────────────
  app.post('/api/projects/:id/nim/error-fix', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    const parsed = errorFixSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const tier = await getUserTier(request.user!.id)
    const resolved = await resolveNimTarget(request.user!.id, tier, parsed.data.nimModel, 'error_prompt_maker')
    if (!resolved.ok) return reply.status(resolved.status).send({ message: resolved.message, statusCode: resolved.status })

    const reviewIds = [...new Set(parsed.data.reviewIssueRefs.map((r) => r.reviewId))]
    const reviews = await db.select().from(codeReviews)
      .where(and(eq(codeReviews.projectId, id), inArray(codeReviews.id, reviewIds)))
    const byId = new Map(reviews.map((r) => [r.id, (r.issuesJson as any[]) ?? []]))
    const issues = parsed.data.reviewIssueRefs
      .map((ref) => byId.get(ref.reviewId)?.[ref.issueIdx])
      .filter(Boolean)
    if (issues.length === 0) return reply.status(400).send({ message: 'No matching issues found', statusCode: 400 })

    const modelId = parsed.data.nimModel
    const [job] = await db.insert(nimJobs).values({
      userId: request.user!.id, projectId: id, kind: 'error_fix', status: 'running',
      nimModel: modelId, agentModel: parsed.data.agentModel,
      inputJson: { issueRefs: parsed.data.reviewIssueRefs, sessionId: parsed.data.sessionId ?? null },
    }).returning()

    void nimEngine.runErrorFix(job.id, resolved.apiKey, resolved.target, {
      issues, projectName: project.name, software: project.software, language: project.language,
    }).catch((err) => app.log.error({ err, jobId: job.id }, 'error-fix job crashed'))

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: job.id })
  })

  // ── In-Built Prompt Maker: register a ready dispatch job (no NIM) ──────
  // Mirrors the AI flow's persistence: the prompt lives in a nim_job so the
  // subsequent agent send is refresh-proof + idempotent (completed atomically
  // by the /messages handler via nimJobId).
  app.post('/api/projects/:id/nim/dispatch', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    const parsed = dispatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [job] = await db.insert(nimJobs).values({
      userId: request.user!.id, projectId: id, kind: 'error_fix', status: 'ready',
      nimModel: 'in-built', agentModel: parsed.data.agentModel,
      resultJson: { prompt: parsed.data.prompt },
    }).returning()

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: job.id })
  })

  // ── Error Prompt Maker: mark completed (client dispatched the prompt to the Agent) ──
  app.post('/api/projects/:id/nim/error-fix/:jobId/complete', { preHandler: [authMiddleware] }, async (request) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    await db.update(nimJobs).set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
    return { status: 'completed' }
  })
}
