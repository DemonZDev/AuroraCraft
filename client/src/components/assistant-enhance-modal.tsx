import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Square, Check, Pencil, X, AlertTriangle } from 'lucide-react'
import { useAssistant, useAssistantStream, type EnhanceStyle } from '@/hooks/use-assistant'

const STYLES: { id: EnhanceStyle; label: string; desc: string }[] = [
  { id: 'optimized', label: 'Optimized Structured', desc: 'Improve and structure your prompt for the best result.' },
  { id: 'structured', label: 'Structured', desc: 'Structure your prompt as-is — no optimization, same scope.' },
  { id: 'explanatory', label: 'Explanatory Structured', desc: 'Structure it and explain how each feature should work.' },
  { id: 'feature_adding', label: 'Feature-Adding Structured', desc: 'Structure it and suggest safe extra features for your plugin.' },
]

/**
 * Feature 1 — Prompt Enhancer. A blocking, centered, non-dismissable modal:
 *   confirm → pick style → working (live) → ready (confirm / revise / cancel).
 * Driven by the server-side enhance job, so it survives refresh (the parent re-opens
 * it from the active job). While open, the full-screen overlay locks the workspace.
 */
export function AssistantEnhanceModal({
  projectId,
  open,
  originalPrompt,
  onSendFinal,
  onClose,
}: {
  projectId: string
  open: boolean
  originalPrompt: string
  onSendFinal: (prompt: string) => void
  onClose: () => void
}) {
  const { job, enhance, revise, confirm, cancel, stop, invalidateActive } = useAssistant(projectId)
  const enhanceJob = job?.kind === 'enhance' ? job : null
  const isWorking = !!enhanceJob && (enhanceJob.status === 'queued' || enhanceJob.status === 'running')
  const progress = useAssistantStream(projectId, isWorking ? enhanceJob.id : null)

  const [stage, setStage] = useState<'confirm' | 'style'>('confirm')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  // When there is no live enhance job, the pre-job flow starts at "confirm".
  useEffect(() => {
    if (!enhanceJob) {
      setStage('confirm')
      setFeedbackOpen(false)
      setFeedback('')
    }
  }, [enhanceJob?.id])

  // Snap the active-job query forward as soon as the stream completes (avoids poll lag).
  useEffect(() => {
    if (progress.done) invalidateActive()
  }, [progress.done])

  if (!open) return null

  const card = 'w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl'
  const overlay = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4'
  const header = (
    <div className="flex items-center gap-2 border-b border-border px-5 py-3">
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold text-text">AI Assistant — Prompt Enhancer</span>
    </div>
  )

  // ── Ready (awaiting_user): show the enhanced prompt ──────────────────────────
  if (enhanceJob && enhanceJob.status === 'awaiting_user') {
    const draftPrompt = enhanceJob.draft?.prompt ?? ''
    return (
      <div className={overlay}>
        <div className={card}>
          {header}
          <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
            <p className="mb-2 text-xs text-text-muted">Your enhanced prompt is ready. Review it, then confirm, request changes, or cancel.</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-bg/50 p-3 text-sm text-text">{draftPrompt}</pre>
            {feedbackOpen && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-text-muted">Describe what to change</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
                  placeholder="e.g. Make it shorter and add a permission node requirement"
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
            {!feedbackOpen ? (
              <>
                <button onClick={() => { cancel(enhanceJob.id).catch(() => {}); onClose() }} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover">
                  Cancel
                </button>
                <button onClick={() => setFeedbackOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover">
                  <Pencil className="h-3.5 w-3.5" /> Describe what to change
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const res = await confirm(enhanceJob.id)
                      onSendFinal((res as { prompt: string }).prompt)
                      onClose()
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Confirm &amp; Send
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setFeedbackOpen(false); setFeedback('') }} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover">
                  Back
                </button>
                <button
                  disabled={busy || !feedback.trim()}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await revise({ jobId: enhanceJob.id, feedback: feedback.trim() })
                      setFeedbackOpen(false)
                      setFeedback('')
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Apply changes
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Working (queued/running) ─────────────────────────────────────────────────
  if (isWorking) {
    return (
      <div className={overlay}>
        <div className={card}>
          {header}
          <div className="px-5 py-6">
            {progress.error ? (
              <div className="flex items-start gap-2 text-sm text-red-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{progress.error}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-text">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Enhancing your prompt…
                </div>
                {(progress.text || progress.lines.length > 0) && (
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-bg/50 p-3 text-xs text-text-muted">
                    {progress.text ? <pre className="whitespace-pre-wrap">{progress.text}</pre> : progress.lines.slice(-6).map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              onClick={() => { stop(enhanceJob.id).catch(() => {}); onClose() }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/60 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Pre-job: confirm + style pick ────────────────────────────────────────────
  return (
    <div className={overlay}>
      <div className={card}>
        {header}
        {stage === 'confirm' ? (
          <>
            <div className="px-5 py-5">
              <p className="text-sm text-text">Do you want to enhance your prompt before sending it to the Agent?</p>
              <p className="mt-1 text-xs text-text-muted line-clamp-3">“{originalPrompt}”</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => { onSendFinal(originalPrompt); onClose() }} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover">
                No, send as-is
              </button>
              <button onClick={() => setStage('style')} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
                <Sparkles className="h-3.5 w-3.5" /> Yes, enhance
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await enhance({ prompt: originalPrompt, style: s.id })
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  <p className="text-sm font-medium text-text">{s.label}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{s.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setStage('confirm')} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover">
                Back
              </button>
              {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              <button onClick={onClose} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-dim hover:text-text-muted" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
