// Shared AI Assistant types. The JSON-serializable subset (AssistantJob, artifacts,
// actions, enums) is mirrored on the client in client/src/types/index.ts — keep names identical.

export type AssistantJobKind = 'enhance' | 'error_fix' | 'post_session'
export type AssistantJobStatus =
  | 'queued' | 'running' | 'awaiting_user' | 'done' | 'failed' | 'cancelled' | 'stopped'
export type EnhanceStyle = 'optimized' | 'structured' | 'explanatory' | 'feature_adding'

export interface AssistantAction {
  id: string
  type: 'send_prompt' | 'graphify' | 'code_review' | 'git_push'
  label: string
  prompt?: string // present when type === 'send_prompt'
}

// kind === 'enhance' → draft/result shape
export interface EnhanceArtifact { prompt: string }

// kind === 'error_fix' → result shape (auto-sent by client, never shown)
export interface ErrorFixArtifact { prompt: string } // guaranteed ≤ ERROR_FIX_MAX_CHARS

// kind === 'post_session' → result shape
export interface PostSessionArtifact {
  analysis: {
    completed: boolean // did the agent finish its work?
    stoppedMidway: boolean // stopped by user / error / unexpectedly?
    issues: string[] // problems the agent itself reported
    reason: string // short human explanation of the verdict
    summary: string // 1-3 sentence recap of what the agent did
  }
  recommendation: string // human-readable "what to do next"
  actions: AssistantAction[] // wired buttons (send_prompt | graphify | code_review | git_push)
}

export type AssistantArtifact = EnhanceArtifact | ErrorFixArtifact | PostSessionArtifact

export interface AssistantJob {
  id: string
  projectId: string
  sessionId: string | null
  kind: AssistantJobKind
  status: AssistantJobStatus
  model: string
  input: unknown
  draft: EnhanceArtifact | null
  result: AssistantArtifact | null
  error: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

// ── Engine-internal (server only) ────────────────────────────────────────────

export interface AssistantJobContext {
  projectId: string
  userId: string
  username: string // lower-cased
  linkId: string
  workspaceDir: string // /home/auroracraft-<user>/<linkId>
  apiKey: string
  model: string // internal id, e.g. 'step-3.7-flash'
  signal: AbortSignal
  jobId: string // for progress events
}

export interface UsageTotals { inputTokens: number; outputTokens: number }

export const ASSISTANT_TIMEOUT_MS = 30 * 60 * 1000
export const ASSISTANT_TIMEOUT_MESSAGE = "We are experiencing high traffic so Assistant didn't answer."
export const ASSISTANT_MAX_TOOL_ROUNDS = 8
export const ERROR_FIX_MAX_CHARS = 50_000
