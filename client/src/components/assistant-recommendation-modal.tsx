import { Sparkles, Send, Network, ShieldCheck, GitBranch, CheckCircle2, AlertTriangle, OctagonAlert } from 'lucide-react'
import type { AssistantAction, PostSessionArtifact, AssistantJob } from '@/hooks/use-assistant'

const ICON: Record<AssistantAction['type'], typeof Send> = {
  send_prompt: Send,
  graphify: Network,
  code_review: ShieldCheck,
  git_push: GitBranch,
}

/**
 * Feature 3 — Post-Agent Session Analyser result. A blocking, centered, non-dismissable
 * modal (the parent re-opens it from the active post_session job, so it survives refresh).
 * Presentational: the parent (WorkspacePage) owns accept/cancel + action execution, so it
 * can git-gate the `code_review`/`git_push` actions. While `gitRequired` is set, the modal
 * shows a "Git setup required" panel instead of the recommendation — the user must complete
 * Git setup (then the action auto-runs) or cancel (workspace stays locked until one happens).
 */
export function AssistantRecommendationModal({
  job,
  gitRequired,
  gitStepLabel,
  busy,
  onRunAction,
  onSetupGit,
  onDismiss,
}: {
  job: AssistantJob
  gitRequired: boolean
  gitStepLabel: string
  busy: boolean
  onRunAction: (action: AssistantAction) => void
  onSetupGit: () => void
  onDismiss: () => void
}) {
  const result = job.result as PostSessionArtifact | null
  if (!result) return null

  const overlay = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4'
  const card = 'w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl'
  const header = (
    <div className="flex items-center gap-2 border-b border-border px-5 py-3">
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold text-text">AI Assistant — Session Review</span>
    </div>
  )

  // ── Git setup required (gate for code_review / git_push) ─────────────────────
  if (gitRequired) {
    return (
      <div className={overlay}>
        <div className={card}>
          {header}
          <div className="px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
              <GitBranch className="h-4 w-4" />
              Git setup required
            </div>
            <p className="mt-2 text-sm text-text">{gitStepLabel}</p>
            <p className="mt-1 text-xs text-text-muted">
              This recommended action needs Git. Complete the setup to run it automatically, or cancel the recommendation. You can’t use the workspace until one of these happens.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button onClick={onDismiss} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover">
              Cancel recommendation
            </button>
            <button onClick={onSetupGit} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
              <GitBranch className="h-3.5 w-3.5" /> Set up Git
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal recommendation ────────────────────────────────────────────────────
  const { analysis } = result
  const verdict = analysis.stoppedMidway
    ? { icon: OctagonAlert, tone: 'text-amber-500', label: 'Agent stopped mid-work' }
    : analysis.completed
      ? { icon: CheckCircle2, tone: 'text-green-500', label: 'Agent completed its work' }
      : { icon: AlertTriangle, tone: 'text-amber-500', label: 'Work may be incomplete' }
  const VerdictIcon = verdict.icon

  return (
    <div className={overlay}>
      <div className={card}>
        {header}
        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          <div className={`flex items-center gap-2 text-sm font-medium ${verdict.tone}`}>
            <VerdictIcon className="h-4 w-4" />
            {verdict.label}
          </div>
          {analysis.summary && <p className="mt-2 text-sm text-text">{analysis.summary}</p>}
          {analysis.reason && <p className="mt-1 text-xs text-text-muted">{analysis.reason}</p>}

          {analysis.issues.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-600">Issues reported by the Agent</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-text-muted">
                {analysis.issues.map((iss, i) => (
                  <li key={i}>{iss}</li>
                ))}
              </ul>
            </div>
          )}

          {result.recommendation && (
            <div className="mt-3">
              <p className="text-xs font-medium text-text-muted">Recommended next step</p>
              <p className="mt-1 text-sm text-text">{result.recommendation}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onDismiss} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover">
            Dismiss
          </button>
          {result.actions.map((action) => {
            const Icon = ICON[action.type] ?? Send
            return (
              <button
                key={action.id}
                disabled={busy}
                onClick={() => onRunAction(action)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                <Icon className="h-3.5 w-3.5" />
                {action.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
