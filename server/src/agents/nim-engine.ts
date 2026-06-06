import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { nimJobs } from '../db/schema/nim-jobs.js'
import { nimChat, NimError, type NimMessage } from '../bridges/nim-client.js'

// A resolved call target: the provider endpoint + the upstream model id (real name).
export interface NimTarget { baseUrl: string; slug: string }

const JOB_DEADLINE_MS = 30 * 60 * 1000 // 30 minutes (spec)
const ENHANCE_MAX_TOKENS = 12000
const FIX_MAX_TOKENS = 16384
const MAX_FIX_PROMPT_CHARS = 50000

export type EnhanceStyle = 'optimized' | 'structured' | 'explanatory' | 'feature_adding'

const STYLE_SYSTEM: Record<EnhanceStyle, string> = {
  optimized:
    'You are a prompt engineer for an AI agent that writes Minecraft server plugins. Rewrite the user prompt to be clearer and more effective: fix ambiguity, add only SAFE, clearly-implied technical specifics, and organize it into clean sections (Goal, Requirements, Constraints, Acceptance Criteria). Improve quality but do NOT invent unrelated features or change the core intent.',
  structured:
    'You are a formatter. Take the user prompt and ONLY restructure it into clean sections (Goal, Requirements, Constraints). Do NOT add, optimize, reword for meaning, or change anything substantive. Preserve the user intent exactly — structure only.',
  explanatory:
    'You are a prompt engineer for Minecraft plugin development. Restructure the user prompt into clean sections AND, for each requested feature, add a short explanatory note describing how it should work and behave in-game. Do not add NEW features; only explain the ones requested.',
  feature_adding:
    'You are a senior Minecraft plugin designer. Restructure the user prompt into clean sections and propose a SMALL number of SAFE, complementary features that naturally fit the described plugin. Clearly mark any additions under an "Added (safe) features" section. Never add unsafe, destructive, or scope-exploding features.',
}

const FINALIZE_SYSTEM =
  'You finalize a prompt that will be sent to a code-writing AI agent. Return ONLY the final, clean, ready-to-send prompt text — no preamble, no commentary, no surrounding quotes. Keep the same intent and structure; just ensure it is clear and well-formatted.'

export interface EnhanceInput { prompt: string; projectName?: string; software?: string; language?: string }
interface IssueRef { type?: string; severity?: string; fileName?: string; codegenInstructions?: string }
export interface ErrorFixInput {
  issues: IssueRef[]
  projectName?: string
  software?: string
  language?: string
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 }

class NimEngine {
  private jobs = new Map<string, { controller: AbortController; timer: NodeJS.Timeout }>()

  /** Register a job: returns its abort signal and arms the 30-min deadline. */
  private register(jobId: string): AbortSignal {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      if (this.jobs.has(jobId)) {
        controller.abort()
        // Only mark timeout if the job is STILL running — never clobber a job that
        // already reached awaiting_user/ready/terminal in the race before done() ran.
        void this.markTimeoutIfRunning(jobId)
      }
    }, JOB_DEADLINE_MS)
    this.jobs.set(jobId, { controller, timer })
    return controller.signal
  }

  /** Force-stop a running job (user Force-Stop). The cancel route sets status='cancelled'. */
  abort(jobId: string): void {
    const entry = this.jobs.get(jobId)
    if (entry) { clearTimeout(entry.timer); entry.controller.abort() }
    this.jobs.delete(jobId)
  }

  /** Engine finished with a job (success or failure) — clear the deadline timer. */
  private done(jobId: string): void {
    const entry = this.jobs.get(jobId)
    if (entry) clearTimeout(entry.timer)
    this.jobs.delete(jobId)
  }

  private async markTimeoutIfRunning(jobId: string): Promise<void> {
    await db.update(nimJobs)
      .set({ status: 'timeout', updatedAt: new Date() })
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.status, 'running')))
      .catch(() => {})
  }

  /** Mark failed/cancelled only if the job is still 'running' (don't clobber a finished one). */
  private async setTerminal(jobId: string, status: 'failed' | 'cancelled', error?: string): Promise<void> {
    await db.update(nimJobs)
      .set({ status, error: error?.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.status, 'running')))
      .catch(() => {})
  }

  /** Advance a running job to a non-terminal/ready status only if it is still 'running'. */
  private async setFromRunning(jobId: string, patch: Record<string, unknown>): Promise<void> {
    await db.update(nimJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.status, 'running')))
      .catch(() => {})
  }

  private async fail(jobId: string, err: unknown): Promise<void> {
    // Aborts (timeout deadline / user cancel) already set their own terminal status.
    if (err instanceof NimError && err.aborted) return
    await this.setTerminal(jobId, 'failed', (err as Error)?.message ?? 'NIM error')
  }

  // ── Prompt Enhancer ────────────────────────────────────────────────────
  async runEnhance(jobId: string, apiKey: string, style: EnhanceStyle, target: NimTarget, input: EnhanceInput): Promise<void> {
    const signal = this.register(jobId)
    try {
      const ctx = `Project: ${input.projectName ?? 'unknown'} | Platform: ${input.software ?? 'paper'} | Language: ${input.language ?? 'java'}`
      // Call 1 — draft in the chosen style.
      const draft = await nimChat({
        apiKey, baseUrl: target.baseUrl, slug: target.slug, maxTokens: ENHANCE_MAX_TOKENS, signal,
        messages: [
          { role: 'system', content: STYLE_SYSTEM[style] },
          { role: 'user', content: `${ctx}\n\nUSER PROMPT:\n${input.prompt}\n\nReturn ONLY the rewritten prompt.` },
        ],
      })
      // Call 2 — finalize / clean pass (agentic: a second call refining the first).
      const finalized = await nimChat({
        apiKey, baseUrl: target.baseUrl, slug: target.slug, maxTokens: ENHANCE_MAX_TOKENS, signal,
        messages: [
          { role: 'system', content: FINALIZE_SYSTEM },
          { role: 'user', content: draft.content || input.prompt },
        ],
      })
      const finalPrompt = (finalized.content || draft.content || input.prompt).trim()
      await this.setFromRunning(jobId, { status: 'awaiting_user', resultJson: { prompt: finalPrompt } })
    } catch (err) {
      await this.fail(jobId, err)
    } finally {
      this.done(jobId)
    }
  }

  async runRefine(jobId: string, apiKey: string, target: NimTarget, currentPrompt: string, changeRequest: string, history: unknown[]): Promise<void> {
    const signal = this.register(jobId)
    try {
      const out = await nimChat({
        apiKey, baseUrl: target.baseUrl, slug: target.slug, maxTokens: ENHANCE_MAX_TOKENS, signal,
        messages: [
          { role: 'system', content: 'You refine an existing prompt according to the user\'s change request. Keep everything good; apply the requested change. Return ONLY the updated prompt text.' },
          { role: 'user', content: `CURRENT PROMPT:\n${currentPrompt}\n\nCHANGE REQUEST:\n${changeRequest}` },
        ],
      })
      const updated = (out.content || currentPrompt).trim()
      const newHistory = [...history, { changeRequest, prompt: updated }]
      await this.setFromRunning(jobId, { status: 'awaiting_user', resultJson: { prompt: updated }, historyJson: newHistory })
    } catch (err) {
      await this.fail(jobId, err)
    } finally {
      this.done(jobId)
    }
  }

  // ── Error Prompt Maker (Option A) ──────────────────────────────────────
  // Single fast NIM call. NO file reading — the optimised fix prompt is engineered
  // purely from the selected code-review issues (max 30) for speed + accuracy.
  async runErrorFix(jobId: string, apiKey: string, target: NimTarget, input: ErrorFixInput): Promise<void> {
    const signal = this.register(jobId)
    try {
      const ordered = [...input.issues].sort(
        (a, b) => (SEVERITY_RANK[(a.severity ?? 'minor').toLowerCase()] ?? 3) - (SEVERITY_RANK[(b.severity ?? 'minor').toLowerCase()] ?? 3),
      )
      const issuesText = ordered.map((it, i) =>
        `${i + 1}. [${(it.severity ?? 'minor').toUpperCase()}] File: ${it.fileName ?? '(unknown file)'}\n   Issue: ${it.codegenInstructions ?? '(no details provided)'}`).join('\n\n')

      const system =
        `You are an elite prompt engineer. You craft a single, highly-optimised instruction prompt for a SEPARATE code-writing AI agent that edits a Minecraft ${input.software ?? 'paper'} plugin written in ${input.language ?? 'java'} (project: ${input.projectName ?? 'unknown'}).\n` +
        `You are given a list of code-review issues to fix. Produce ONE precise, unambiguous fix prompt that makes the agent fix EXACTLY these issues and nothing else.\n\n` +
        `Rules for your output:\n` +
        `- Address EVERY issue listed — never drop, merge away, or invent issues.\n` +
        `- For each issue: name the file, state the exact problem, and the precise change required to fix it.\n` +
        `- Be concrete and technical; preserve the project's intent; do not add unrelated work or new features.\n` +
        `- Group by severity (critical first, then major, then minor) and use clear numbered steps the agent can follow deterministically.\n` +
        `- End with a short "Acceptance criteria" checklist covering every fix.\n` +
        `- Output ONLY the final fix prompt: no preamble, no meta-commentary, no surrounding quotes.\n` +
        `- Keep it under ${MAX_FIX_PROMPT_CHARS} characters.`

      const messages: NimMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: `Code-review issues to fix (${ordered.length}):\n\n${issuesText}` },
      ]

      const out = await nimChat({ apiKey, baseUrl: target.baseUrl, slug: target.slug, maxTokens: FIX_MAX_TOKENS, signal, messages })
      if (out.finishReason === 'length') console.warn(`[nim] error-fix job ${jobId} hit token limit (finish_reason=length); output may be truncated`)
      const finalPrompt = (out.content || '').trim().slice(0, MAX_FIX_PROMPT_CHARS)
      if (!finalPrompt) { await this.setTerminal(jobId, 'failed', 'Empty response from model'); return }
      await this.setFromRunning(jobId, { status: 'ready', resultJson: { prompt: finalPrompt } })
    } catch (err) {
      await this.fail(jobId, err)
    } finally {
      this.done(jobId)
    }
  }
}

export const nimEngine = new NimEngine()
