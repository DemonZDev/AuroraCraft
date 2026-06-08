import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, inArray, notInArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { codeReviews } from '../db/schema/code-reviews.js'
import { promptToolJobs, PROMPT_TOOL_TERMINAL_STATUSES, type PromptToolJob, type PromptToolJobStatus } from '../db/schema/prompt-tool-jobs.js'
import { authMiddleware } from '../middleware/auth.js'
import { users } from '../db/schema/users.js'
import { promptToolsEngine, type EnhanceStyle, type ChatTarget, type PromptToolBilling } from '../agents/prompt-tools-engine.js'
import { resolveModelById, listModelsForUsage, getUserProviderKeyMap, getRoutedKeysForProvider, type ModelUsage } from '../utils/ai-runtime.js'

type ToolResolution =
  | { ok: true; target: ChatTarget; billing: PromptToolBilling }
  | { ok: false; status: number; message: string }

/**
 * Resolve a model id (for the Prompt Enhancer / Error Prompt Maker) into a concrete
 * call target + a routed key chain + billing context. Enforces usage, tier, and key
 * presence. These tools call chat-completions directly, so a Zen model (no base URL)
 * is rejected. Paid providers route over the user's full ordered key chain; free
 * providers resolve their single key.
 */
async function resolveToolTarget(
  userId: string,
  tier: 'free' | 'paid',
  modelId: string,
  usage: ModelUsage,
): Promise<ToolResolution> {
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
  // Ordered, usable keys for this provider (weight asc). Paid: full chain; free: one key.
  const keys = await getRoutedKeysForProvider(userId, model.provider.id)
  if (keys.length === 0) {
    return { ok: false, status: 403, message: `No usable API key configured for ${model.provider.name}. Ask an admin to add one.` }
  }
  return {
    ok: true,
    target: { baseUrl: model.provider.baseUrl, slug: model.realName },
    billing: {
      userId,
      modelId: model.id,
      providerSlug: model.provider.slug,
      pricing: model.pricing,
      isFree: model.provider.isFree,
      keys,
    },
  }
}

async function getUserTier(userId: string): Promise<'free' | 'paid'> {
  const [u] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.tier ?? 'free'
}

const enhanceSchema = z.object({
  prompt: z.string().min(1).max(20000),
  style: z.enum(['optimized', 'structured', 'explanatory', 'feature_adding']),
  toolModel: z.string().min(1).max(60),
})
const refineSchema = z.object({ changeRequest: z.string().min(1).max(8000) })
const errorFixSchema = z.object({
  reviewIssueRefs: z.array(z.object({ reviewId: z.string().uuid(), issueIdx: z.number().int().min(0) })).min(1).max(30),
  toolModel: z.string().min(1).max(60),
  agentModel: z.string().max(100),
  sessionId: z.string().uuid().optional(),
})
// In-Built Prompt Maker: a no-LLM error_fix job carrying a pre-built prompt so the
// in-built dispatch is just as refresh-proof + idempotent as the AI flow.
const dispatchSchema = z.object({
  prompt: z.string().min(1).max(50000),
  agentModel: z.string().max(100),
})

const isTerminal = (s: string): boolean => PROMPT_TOOL_TERMINAL_STATUSES.includes(s as PromptToolJobStatus)

export async function promptToolRoutes(app: FastifyInstance) {
  async function loadOwnedProject(userId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1)
    return project ?? null
  }

  function publicJob(job: PromptToolJob, includeResult: boolean) {
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      toolModel: job.toolModel,
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
  const shouldIncludeResult = (job: PromptToolJob): boolean =>
    job.kind === 'prompt_enhance' || job.status === 'ready'

  async function pruneJobs(projectId: string, userId: string): Promise<void> {
    const terminal = await db.select({ id: promptToolJobs.id }).from(promptToolJobs)
      .where(and(eq(promptToolJobs.projectId, projectId), eq(promptToolJobs.userId, userId), inArray(promptToolJobs.status, PROMPT_TOOL_TERMINAL_STATUSES)))
      .orderBy(desc(promptToolJobs.createdAt))
    const stale = terminal.slice(30).map((r) => r.id)
    if (stale.length) await db.delete(promptToolJobs).where(inArray(promptToolJobs.id, stale)).catch(() => {})
  }

  // ── Models (for the Prompt Enhancer + Error Prompt Maker pickers) ──────
  app.get('/api/prompt-tools/models', { preHandler: [authMiddleware] }, async (request) => {
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
  app.get('/api/projects/:id/prompt-tools/active', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })

    // Latest NON-terminal job (so an older awaiting_user job is still found even if a
    // newer terminal job exists). In the UI the workspace lock prevents that ordering,
    // but this keeps re-attach correct regardless.
    const [job] = await db.select().from(promptToolJobs)
      .where(and(
        eq(promptToolJobs.projectId, id),
        eq(promptToolJobs.userId, request.user!.id),
        notInArray(promptToolJobs.status, PROMPT_TOOL_TERMINAL_STATUSES),
      ))
      .orderBy(desc(promptToolJobs.createdAt))
      .limit(1)

    if (!job) return { job: null }
    return { job: publicJob(job, shouldIncludeResult(job)) }
  })

  // ── Poll one job ──────────────────────────────────────────────────────
  app.get('/api/projects/:id/prompt-tools/jobs/:jobId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const [job] = await db.select().from(promptToolJobs)
      .where(and(eq(promptToolJobs.id, jobId), eq(promptToolJobs.projectId, id), eq(promptToolJobs.userId, request.user!.id)))
      .limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    return { job: publicJob(job, shouldIncludeResult(job)) }
  })

  // ── Force-stop ────────────────────────────────────────────────────────
  app.post('/api/projects/:id/prompt-tools/jobs/:jobId/cancel', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const [job] = await db.select().from(promptToolJobs)
      .where(and(eq(promptToolJobs.id, jobId), eq(promptToolJobs.projectId, id), eq(promptToolJobs.userId, request.user!.id)))
      .limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    if (!isTerminal(job.status)) {
      await db.update(promptToolJobs).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(promptToolJobs.id, jobId))
    }
    promptToolsEngine.abort(jobId)
    return { status: 'cancelled' }
  })

  // ── Prompt Enhancer: start ────────────────────────────────────────────
  app.post('/api/projects/:id/prompt-tools/enhance', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    const parsed = enhanceSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const tier = await getUserTier(request.user!.id)
    const resolved = await resolveToolTarget(request.user!.id, tier, parsed.data.toolModel, 'prompt_enhancer')
    if (!resolved.ok) return reply.status(resolved.status).send({ message: resolved.message, statusCode: resolved.status })

    const modelId = parsed.data.toolModel
    const [job] = await db.insert(promptToolJobs).values({
      userId: request.user!.id, projectId: id, kind: 'prompt_enhance', status: 'running',
      toolModel: modelId, style: parsed.data.style, inputJson: { prompt: parsed.data.prompt },
    }).returning()

    void promptToolsEngine.runEnhance(job.id, { ...resolved.billing, projectId: id }, parsed.data.style as EnhanceStyle, resolved.target, {
      prompt: parsed.data.prompt, projectName: project.name, software: project.software, language: project.language,
    }).catch((err) => app.log.error({ err, jobId: job.id }, 'enhance job crashed'))

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: job.id })
  })

  // ── Prompt Enhancer: refine ───────────────────────────────────────────
  app.post('/api/projects/:id/prompt-tools/enhance/:jobId/refine', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const parsed = refineSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [job] = await db.select().from(promptToolJobs)
      .where(and(eq(promptToolJobs.id, jobId), eq(promptToolJobs.projectId, id), eq(promptToolJobs.userId, request.user!.id))).limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    if (job.kind !== 'prompt_enhance' || job.status !== 'awaiting_user')
      return reply.status(409).send({ message: 'Job is not awaiting input', statusCode: 409 })

    const tier = await getUserTier(request.user!.id)
    const resolved = await resolveToolTarget(request.user!.id, tier, job.toolModel, 'prompt_enhancer')
    if (!resolved.ok) return reply.status(resolved.status).send({ message: resolved.message, statusCode: resolved.status })

    const current = (job.resultJson as { prompt?: string })?.prompt ?? ''
    const history = (job.historyJson as unknown[]) ?? []
    await db.update(promptToolJobs).set({ status: 'running', updatedAt: new Date() }).where(eq(promptToolJobs.id, jobId))
    void promptToolsEngine.runRefine(jobId, { ...resolved.billing, projectId: id }, resolved.target, current, parsed.data.changeRequest, history)
      .catch((err) => app.log.error({ err, jobId }, 'refine job crashed'))
    return reply.status(202).send({ jobId })
  })

  // ── Prompt Enhancer: mark completed (client dispatched the confirmed prompt) ──
  app.post('/api/projects/:id/prompt-tools/enhance/:jobId/complete', { preHandler: [authMiddleware] }, async (request) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    await db.update(promptToolJobs).set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(promptToolJobs.id, jobId), eq(promptToolJobs.projectId, id), eq(promptToolJobs.userId, request.user!.id)))
    return { status: 'completed' }
  })

  // ── Prompt Enhancer: dispatch to Agent (refresh-proof, idempotent) ─────
  // Marks the enhance job completed atomically and creates a ready agent_dispatch
  // job so the actual send can survive refresh and is claimed only once by /messages.
  const enhanceDispatchSchema = z.object({ agentModel: z.string().max(100) })
  app.post('/api/projects/:id/prompt-tools/enhance/:jobId/dispatch', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })

    const parsed = enhanceDispatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [job] = await db.select().from(promptToolJobs)
      .where(and(eq(promptToolJobs.id, jobId), eq(promptToolJobs.projectId, id), eq(promptToolJobs.userId, request.user!.id))).limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    if (job.kind !== 'prompt_enhance' || job.status !== 'awaiting_user')
      return reply.status(409).send({ message: 'Job is not awaiting input', statusCode: 409 })

    const prompt = (job.resultJson as { prompt?: string })?.prompt ?? ''
    if (!prompt) return reply.status(409).send({ message: 'No enhanced prompt available', statusCode: 409 })

    // Mark the enhance job completed so it won't re-attach
    await db.update(promptToolJobs).set({ status: 'completed', updatedAt: new Date() }).where(eq(promptToolJobs.id, jobId))

    // Create a refresh-proof dispatch job that carries the final prompt
    const [dispatchJob] = await db.insert(promptToolJobs).values({
      userId: request.user!.id, projectId: id, kind: 'agent_dispatch', status: 'ready',
      toolModel: job.toolModel, agentModel: parsed.data.agentModel,
      resultJson: { prompt },
    }).returning()

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: dispatchJob.id })
  })

  // ── Error Prompt Maker (Option A): start ──────────────────────────────
  app.post('/api/projects/:id/prompt-tools/error-fix', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    const parsed = errorFixSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const tier = await getUserTier(request.user!.id)
    const resolved = await resolveToolTarget(request.user!.id, tier, parsed.data.toolModel, 'error_prompt_maker')
    if (!resolved.ok) return reply.status(resolved.status).send({ message: resolved.message, statusCode: resolved.status })

    const reviewIds = [...new Set(parsed.data.reviewIssueRefs.map((r) => r.reviewId))]
    const reviews = await db.select().from(codeReviews)
      .where(and(eq(codeReviews.projectId, id), inArray(codeReviews.id, reviewIds)))
    const byId = new Map(reviews.map((r) => [r.id, (r.issuesJson as any[]) ?? []]))
    const issues = parsed.data.reviewIssueRefs
      .map((ref) => byId.get(ref.reviewId)?.[ref.issueIdx])
      .filter(Boolean)
    if (issues.length === 0) return reply.status(400).send({ message: 'No matching issues found', statusCode: 400 })

    const modelId = parsed.data.toolModel
    const [job] = await db.insert(promptToolJobs).values({
      userId: request.user!.id, projectId: id, kind: 'error_fix', status: 'running',
      toolModel: modelId, agentModel: parsed.data.agentModel,
      inputJson: { issueRefs: parsed.data.reviewIssueRefs, sessionId: parsed.data.sessionId ?? null },
    }).returning()

    void promptToolsEngine.runErrorFix(job.id, { ...resolved.billing, projectId: id }, resolved.target, {
      issues, projectName: project.name, software: project.software, language: project.language,
    }).catch((err) => app.log.error({ err, jobId: job.id }, 'error-fix job crashed'))

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: job.id })
  })

  // ── In-Built Prompt Maker: register a ready dispatch job (no LLM call) ──
  // Mirrors the AI flow's persistence: the prompt lives in a prompt_tool_job so the
  // subsequent agent send is refresh-proof + idempotent (completed atomically
  // by the /messages handler via promptToolJobId).
  app.post('/api/projects/:id/prompt-tools/dispatch', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    const parsed = dispatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [job] = await db.insert(promptToolJobs).values({
      userId: request.user!.id, projectId: id, kind: 'error_fix', status: 'ready',
      toolModel: 'in-built', agentModel: parsed.data.agentModel,
      resultJson: { prompt: parsed.data.prompt },
    }).returning()

    void pruneJobs(id, request.user!.id)
    return reply.status(202).send({ jobId: job.id })
  })

  // ── Error Prompt Maker: mark completed (client dispatched the prompt to the Agent) ──
  app.post('/api/projects/:id/prompt-tools/error-fix/:jobId/complete', { preHandler: [authMiddleware] }, async (request) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    await db.update(promptToolJobs).set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(promptToolJobs.id, jobId), eq(promptToolJobs.projectId, id), eq(promptToolJobs.userId, request.user!.id)))
    return { status: 'completed' }
  })
}
