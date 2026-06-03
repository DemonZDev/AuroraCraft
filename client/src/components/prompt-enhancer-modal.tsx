import { useState } from 'react'
import { Sparkles, Loader2, X, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NimJobView, NimModelOption } from '@/hooks/use-nim'

export type EnhancerPhase = 'confirm' | 'options' | 'working' | 'result'

const STYLES = [
  { id: 'optimized', label: 'Optimized Structured', desc: 'Optimize the prompt and give it a clean structure.' },
  { id: 'structured', label: 'Structured', desc: 'Structure your prompt only — no optimization.' },
  { id: 'explanatory', label: 'Explanatory Structured', desc: 'Structure + explain how each feature works.' },
  { id: 'feature_adding', label: 'Feature-Adding Structured', desc: 'Add safe complementary features, then structure.' },
] as const

function Shell({ children, maxW = 'max-w-lg' }: { children: React.ReactNode; maxW?: string }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
      <div className={cn('relative w-full mx-4 rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-2xl shadow-2xl overflow-hidden', maxW)}>
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function PromptEnhancerModal(props: {
  phase: EnhancerPhase
  job: NimJobView | null
  models: NimModelOption[]
  defaultModelId: string
  onSendAsIs: () => void
  onEnhanceClicked: () => void
  onStart: (style: string, nimModel: string) => void
  onConfirmSend: () => void
  onRefine: (changeRequest: string) => void
  onCancel: () => void
}) {
  const { phase, job, models, defaultModelId } = props
  const [style, setStyle] = useState<string>('optimized')
  const [model, setModel] = useState<string>(defaultModelId)
  const [refineText, setRefineText] = useState('')
  const [showRefine, setShowRefine] = useState(false)

  if (phase === 'confirm') {
    return (
      <Shell maxW="max-w-md">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20"><Sparkles className="h-5 w-5 text-primary" /></div>
          <h3 className="text-sm font-semibold text-text">Do you want to enhance your prompt?</h3>
        </div>
        <div className="flex gap-3">
          <button onClick={props.onSendAsIs} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition">Send as-is</button>
          <button onClick={props.onEnhanceClicked} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition">Enhance</button>
        </div>
      </Shell>
    )
  }

  if (phase === 'options') {
    return (
      <Shell>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Enhance your prompt</h3>
          <button onClick={props.onCancel} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
        </div>
        <label className="block text-[11px] font-medium text-text-dim mb-1">Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full mb-4 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none">
          {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div className="grid grid-cols-1 gap-2 mb-5">
          {STYLES.map((s) => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={cn('text-left rounded-xl border px-3 py-2.5 transition', style === s.id ? 'border-primary/60 bg-primary/5' : 'border-border/50 hover:bg-surface-hover')}>
              <div className="text-sm font-medium text-text">{s.label}</div>
              <div className="text-[11px] text-text-dim mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={props.onCancel} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition">Cancel</button>
          <button onClick={() => props.onStart(style, model)} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition">Start</button>
        </div>
      </Shell>
    )
  }

  if (phase === 'working') {
    const timedOut = job?.status === 'timeout'
    const failed = job?.status === 'failed'
    const ended = timedOut || failed
    return (
      <Shell maxW="max-w-md">
        <div className="flex flex-col items-center text-center gap-3 py-4">
          {ended
            ? <X className="h-8 w-8 text-destructive" />
            : <Loader2 className="h-8 w-8 text-primary animate-spin" />}
          <p className="text-sm text-text leading-relaxed px-2">
            {timedOut
              ? 'We are experiencing high traffic so the feature didn’t respond.'
              : failed
              ? (job?.error || 'Enhancement failed. Please try again.')
              : 'Enhancing your prompt… this can take a little while.'}
          </p>
          <button onClick={props.onCancel} className="mt-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition">
            {ended ? 'Close' : 'Force Stop'}
          </button>
        </div>
      </Shell>
    )
  }

  // phase === 'result'
  const prompt = job?.result?.prompt ?? ''
  return (
    <Shell maxW="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Enhanced prompt</h3>
        <button onClick={props.onCancel} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[40vh] overflow-auto rounded-xl border border-border/50 bg-background/50 p-3 text-sm text-text whitespace-pre-wrap">{prompt}</div>
      {showRefine && (
        <textarea
          value={refineText}
          onChange={(e) => setRefineText(e.target.value)}
          placeholder="Describe what to change…"
          rows={3}
          className="mt-3 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-primary/60 focus:outline-none"
        />
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={props.onConfirmSend} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition"><Send className="h-4 w-4" /> Confirm &amp; Send</button>
        {!showRefine ? (
          <button onClick={() => setShowRefine(true)} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition"><RefreshCw className="h-4 w-4" /> Describe changes</button>
        ) : (
          <button
            onClick={() => { const t = refineText.trim(); if (t) { props.onRefine(t); setRefineText(''); setShowRefine(false) } }}
            className="flex-1 min-w-[140px] rounded-xl bg-primary/80 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary transition"
          >Apply change</button>
        )}
        <button onClick={props.onCancel} className="flex-1 min-w-[120px] rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition">Cancel</button>
      </div>
    </Shell>
  )
}
