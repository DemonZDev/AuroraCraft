import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { assistantJobs } from '../db/schema/assistant-jobs.js'
import { projects } from '../db/schema/projects.js'
import { users } from '../db/schema/users.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { sessionEventBus } from '../bridges/session-event-bus.js'
import type { StreamEvent } from '../bridges/types.js'
import {
  getUserProviderKeys,
  getUserTokens,
  deductTokens,
  reconcileTokens,
  estimateMessageCost,
  MIN_PREMIUM_BALANCE,
} from './token-service.js'
import { calculateTokenCost } from '../config/ai-models.js'
import { assistantModelOrDefault } from '../config/assistant-models.js'
import { runEnhance, runErrorFix, runPostSession, type ProgressFn } from '../agents/assistant-engine.js'
import {
  ASSISTANT_TIMEOUT_MS,
  ASSISTANT_TIMEOUT_MESSAGE,
  type AssistantJobContext,
  type AssistantJobKind,
  type AssistantJobStatus,
  type UsageTotals,
} from '../agents/assistant-types.js'

// In-memory registry of running jobs' abort controllers (for force-stop / timeout).
const controllers = new Map<string, AbortController>()

const evKey = (jobId: string) => `assistant:${jobId}`
function emit(jobId: string, ev: StreamEvent) {
  sessionEventBus.emit(evKey(jobId), ev)
}

async function setStatus(jobId: string, status: AssistantJobStatus, patch: Record<string, unknown> = {}) {
  await db
    .update(assistantJobs)
    .set({ status, updatedAt: new Date(), ...patch })
    .where(eq(assistantJobs.id, jobId))
}

/** Resolve the per-project assistant runtime context, or throw a user-facing reason. */
async function buildContext(jobId: string, projectId: string): Promise<AssistantJobContext> {
  const [row] = await db
    .select({
      id: projects.id,
      linkId: projects.linkId,
      userId: projects.userId,
      model: projects.assistantModel,
      enabled: projects.assistantEnabled,
      username: users.username,
      tier: users.tier,
    })
    .from(projects)
    .innerJoin(users, eq(projects.userId, users.id))
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!row) throw new Error('project not found')
  if (row.tier !== 'paid') throw new Error('Assistant requires a paid subscription.')
  if (!row.enabled) throw new Error('Assistant is disabled for this project.')
  if (!row.linkId) throw new Error('project has no workspace')
  const keys = await getUserProviderKeys(row.userId)
  const apiKey = keys['nvidia-nim']
  if (!apiKey) throw new Error('No NVIDIA NIM API key is set for your account.')
  const username = row.username.toLowerCase()
  const ctrl = controllers.get(jobId)!
  return {
    projectId,
    userId: row.userId,
    username,
    linkId: row.linkId,
    workspaceDir: `/home/auroracraft-${username}/${row.linkId}`,
    apiKey,
    model: row.model,
    jobId,
    signal: ctrl.signal,
  }
}

/** Pre-charge estimate per job kind (kept non-trivial so reconcile's 2× cap stays sane). */
function preChargeEstimate(kind: AssistantJobKind, input: any, modelDef: any): number {
  if (kind === 'enhance') return Math.max(60, estimateMessageCost(String(input?.prompt ?? ''), modelDef, 'nvidia-nim'))
  if (kind === 'error_fix') return Math.max(80, estimateMessageCost(JSON.stringify(input?.issues ?? []), modelDef, 'nvidia-nim'))
  // post_session reads a lot — baseline ~6000 in / 2000 out.
  return Math.max(120, calculateTokenCost(6000, 2000, modelDef, 'nvidia-nim'))
}

/** Create a job row (status=queued) and kick off the runner fire-and-forget. */
export async function startJob(opts: {
  projectId: string
  userId: string
  kind: AssistantJobKind
  input: unknown
  sessionId?: string | null
}): Promise<{ jobId: string }> {
  const [proj] = await db
    .select({ model: projects.assistantModel })
    .from(projects)
    .where(eq(projects.id, opts.projectId))
    .limit(1)
  const model = proj?.model ?? 'step-3.7-flash'
  const [job] = await db
    .insert(assistantJobs)
    .values({
      projectId: opts.projectId,
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      kind: opts.kind,
      status: 'queued',
      model,
      input: opts.input as any,
    })
    .returning({ id: assistantJobs.id })

  // Bound table growth (disk safety): keep only the 30 most-recent terminal jobs per project.
  void db
    .execute(
      sql`DELETE FROM assistant_jobs
          WHERE project_id = ${opts.projectId}
            AND status IN ('done','failed','cancelled','stopped')
            AND id NOT IN (
              SELECT id FROM assistant_jobs
              WHERE project_id = ${opts.projectId} AND status IN ('done','failed','cancelled','stopped')
              ORDER BY created_at DESC LIMIT 30
            )`,
    )
    .catch(() => {})

  void runJob(job.id).catch(() => {})
  return { jobId: job.id }
}

/** The actual execution: billing → engine → status. */
async function runJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(assistantJobs).where(eq(assistantJobs.id, jobId)).limit(1)
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return

  const ctrl = new AbortController()
  controllers.set(jobId, ctrl)
  const timeout = setTimeout(() => ctrl.abort('timeout'), ASSISTANT_TIMEOUT_MS)
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0 }
  const modelDef = assistantModelOrDefault(job.model)
  const estimate = preChargeEstimate(job.kind as AssistantJobKind, job.input, modelDef as any)

  const onProgress: ProgressFn = (e) => {
    if (e.type === 'text-delta') emit(jobId, { type: 'text-delta', content: e.content ?? '' })
    else if (e.type === 'thinking') emit(jobId, { type: 'thinking', id: 'a', content: e.content ?? '', done: true })
    else if (e.type === 'tool') emit(jobId, { type: 'status', status: 'running', message: `tool: ${e.tool ?? ''}` })
    else emit(jobId, { type: 'status', status: 'running', message: e.content ?? '' })
  }

  try {
    const balance = await getUserTokens(job.userId)
    if (balance < MIN_PREMIUM_BALANCE) throw new Error(`Insufficient AI tokens (need at least ${MIN_PREMIUM_BALANCE}).`)
    await deductTokens(job.userId, estimate, `Assistant ${job.kind} (pre-charge)`, job.sessionId ?? undefined)
    await setStatus(jobId, 'running', { estimatedTokens: estimate })
    emit(jobId, { type: 'status', status: 'running', message: 'running' })

    const ctx = await buildContext(jobId, job.projectId)

    if (job.kind === 'enhance') {
      const result = await runEnhance(ctx, job.input as any, usage, onProgress)
      await setStatus(jobId, 'awaiting_user', { draft: result, result: null })
    } else if (job.kind === 'error_fix') {
      const result = await runErrorFix(ctx, job.input as any, usage, onProgress)
      await setStatus(jobId, 'done', { result, completedAt: new Date() })
    } else {
      const result = await runPostSession(ctx, job.input as any, usage, onProgress)
      await setStatus(jobId, 'awaiting_user', { result })
    }

    // Reconcile actual cost against the pre-charge.
    const actual = calculateTokenCost(usage.inputTokens, usage.outputTokens, modelDef as any, 'nvidia-nim')
    await reconcileTokens(job.userId, estimate, actual, modelDef.name, 'nvidia-nim', job.sessionId ?? undefined)
    await db
      .update(assistantJobs)
      .set({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens })
      .where(eq(assistantJobs.id, jobId))
    emit(jobId, { type: 'complete' })
  } catch (err: any) {
    const aborted = ctrl.signal.aborted
    const isTimeout = ctrl.signal.reason === 'timeout'
    // Refund the pre-charge on failure/stop (actual = 0).
    try {
      await reconcileTokens(job.userId, estimate, 0, modelDef.name, 'nvidia-nim', job.sessionId ?? undefined)
    } catch {
      /* best-effort */
    }
    if (aborted && !isTimeout) {
      await setStatus(jobId, 'stopped', { error: 'Stopped by user.', completedAt: new Date() })
      emit(jobId, { type: 'error', message: 'Stopped by user.' })
    } else {
      // NIM's hosted gateway returns 504 (and undici can surface "fetch failed") when a model
      // is too slow to respond — same user-facing meaning as our 30-min timeout. Show the
      // friendly "high traffic" message for all of these; surface other errors verbatim.
      const raw = String(err?.message ?? '')
      const looksSlow = isTimeout || /\b(504|503|502|408)\b|timeout|fetch failed|UND_ERR/i.test(raw)
      const msg = looksSlow ? ASSISTANT_TIMEOUT_MESSAGE : raw || 'Assistant failed.'
      await setStatus(jobId, 'failed', { error: msg, completedAt: new Date() })
      emit(jobId, { type: 'error', message: msg })
    }
  } finally {
    clearTimeout(timeout)
    controllers.delete(jobId)
  }
}

/** Enhance "describe what to change" → re-run with feedback. */
export async function reviseJob(jobId: string, feedback: string): Promise<void> {
  const [job] = await db.select().from(assistantJobs).where(eq(assistantJobs.id, jobId)).limit(1)
  if (!job || job.kind !== 'enhance' || job.status !== 'awaiting_user') throw new Error('Job is not awaiting revision.')
  const prevDraft = (job.draft as any)?.prompt ?? ''
  await db
    .update(assistantJobs)
    .set({ status: 'queued', input: { ...(job.input as any), feedback, previousDraft: prevDraft }, updatedAt: new Date() })
    .where(eq(assistantJobs.id, jobId))
  void runJob(jobId).catch(() => {})
}

/** Force-stop a running job (aborts the NIM calls). */
export function stopJob(jobId: string): boolean {
  const c = controllers.get(jobId)
  if (c) {
    c.abort('user')
    return true
  }
  return false
}

/** The single active job (queued/running/awaiting_user) for a project, or null. */
export async function getActiveJob(projectId: string) {
  const [row] = await db
    .select()
    .from(assistantJobs)
    .where(and(eq(assistantJobs.projectId, projectId), inArray(assistantJobs.status, ['queued', 'running', 'awaiting_user'])))
    .orderBy(desc(assistantJobs.createdAt))
    .limit(1)
  return row ?? null
}

// ── Tier reconcilers (mirror graphify's hooks in admin.ts) ───────────────────

/** paid→free: snapshot which projects had assistant on, then disable them all. */
export async function onUserDemoted(userId: string): Promise<void> {
  await db.execute(sql`UPDATE projects SET assistant_enabled_snapshot = assistant_enabled WHERE user_id = ${userId}`)
  await db.execute(sql`UPDATE projects SET assistant_enabled = false, updated_at = now() WHERE user_id = ${userId}`)
}

/** free→paid: restore exactly the projects that were on before demotion. */
export async function onUserPromoted(userId: string): Promise<void> {
  await db.execute(
    sql`UPDATE projects SET assistant_enabled = COALESCE(assistant_enabled_snapshot, assistant_enabled), assistant_enabled_snapshot = NULL, updated_at = now() WHERE user_id = ${userId}`,
  )
}

// ── Feature 3 trigger (mirrors graphify.onSessionEnd) ────────────────────────

function parseWorkspaceDir(directory: string): { linkId: string } | null {
  const m = directory.match(/^\/home\/(auroracraft-[^/]+)\/(.+)$/)
  return m ? { linkId: m[2] } : null
}

/**
 * Fire-and-forget from opencode-process-manager.cleanupInstance(). Starts a
 * post_session analysis job IF the project is assistant-active (paid + enabled +
 * key present). Re-checks live state; skips if an analysis is already active.
 */
export async function assistantOnSessionEnd(directory: string): Promise<void> {
  try {
    const parsed = parseWorkspaceDir(directory)
    if (!parsed) return
    const [row] = await db
      .select({ id: projects.id, userId: projects.userId, enabled: projects.assistantEnabled, tier: users.tier })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(eq(projects.linkId, parsed.linkId))
      .limit(1)
    if (!row || !row.enabled || row.tier !== 'paid') return
    const keys = await getUserProviderKeys(row.userId)
    if (!keys['nvidia-nim']) return
    const active = await getActiveJob(row.id)
    if (active && active.kind === 'post_session') return
    const [sess] = await db
      .select({ id: agentSessions.id })
      .from(agentSessions)
      .where(eq(agentSessions.projectId, row.id))
      .orderBy(desc(agentSessions.createdAt))
      .limit(1)
    await startJob({ projectId: row.id, userId: row.userId, kind: 'post_session', input: { sessionId: sess?.id ?? null }, sessionId: sess?.id ?? null })
  } catch (err) {
    console.error('[Assistant] onSessionEnd failed:', err instanceof Error ? err.message : err)
  }
}
