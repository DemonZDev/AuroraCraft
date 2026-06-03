import { useState } from 'react'
import { Wand2, Hammer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NimModelOption } from '@/hooks/use-nim'
import type { AIModel } from '@/types'

export function ErrorPromptMakerModal(props: {
  nimModels: NimModelOption[]
  nimDefault: string
  agentModels: AIModel[]
  defaultAgentModel: string
  onPickInBuilt: () => void
  onStartAI: (nimModel: string, agentModel: string) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'choose' | 'ai-models'>('choose')
  const [nimModel, setNimModel] = useState(props.nimDefault)
  const [agentModel, setAgentModel] = useState(props.defaultAgentModel)
  const usableAgentModels = props.agentModels.filter((m) => !m.disabled)

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={props.onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Auto Fix</h3>
            <button onClick={props.onClose} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
          </div>

          {step === 'choose' ? (
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => setStep('ai-models')} className="text-left rounded-xl border border-border/50 hover:bg-surface-hover px-4 py-3 flex gap-3 transition">
                <Wand2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-text">AI Prompt Maker</div>
                  <div className="text-[11px] text-text-dim mt-0.5">NVIDIA NIM reads your files and builds an optimized fix prompt, then sends it to the Agent automatically.</div>
                </div>
              </button>
              <button onClick={props.onPickInBuilt} className="text-left rounded-xl border border-border/50 hover:bg-surface-hover px-4 py-3 flex gap-3 transition">
                <Hammer className="h-5 w-5 text-text-muted shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-text">In-Built Prompt Maker</div>
                  <div className="text-[11px] text-text-dim mt-0.5">Use the existing template-based fix prompt. No AI model involved.</div>
                </div>
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-text-dim mb-1">Prompt-maker model (NVIDIA NIM)</label>
              <select value={nimModel} onChange={(e) => setNimModel(e.target.value)} className="w-full mb-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none">
                {props.nimModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <label className="block text-[11px] font-medium text-text-dim mb-1">Agent model (executes the fix)</label>
              <select value={agentModel} onChange={(e) => setAgentModel(e.target.value)} className="w-full mb-4 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none">
                {usableAgentModels.length === 0
                  ? <option value={agentModel}>{agentModel}</option>
                  : usableAgentModels.map((m) => <option key={m.id} value={m.id}>{m.name}{m.minTier === 'paid' ? ' (premium)' : ''}</option>)}
              </select>
              <div className="flex gap-3">
                <button onClick={() => setStep('choose')} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition">Back</button>
                <button onClick={() => props.onStartAI(nimModel, agentModel)} className={cn('flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition')}>Start</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
