import { Sparkles, KeyRound } from 'lucide-react'
import { useAssistant } from '@/hooks/use-assistant'
import { cn } from '@/lib/utils'

/**
 * Project-settings controls for the AI Assistant (paid-only):
 *  - enable/disable toggle
 *  - model selector (the ONLY place the assistant model can be changed, per spec)
 */
export function AssistantControls({ projectId, isPaid }: { projectId: string; isPaid: boolean }) {
  const { config, setEnabled, setModel, isPatching } = useAssistant(projectId, isPaid)

  if (!isPaid) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-text-muted">
        <Sparkles className="h-4 w-4 text-text-dim" />
        AI Assistant is available on the paid tier.
      </div>
    )
  }

  if (!config) return null

  const enabled = config.enabled
  const hasKey = config.hasKey

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-text">AI Assistant</p>
            <p className="text-xs text-text-muted">Reads your project, enhances prompts, and recommends next steps.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!hasKey || isPatching}
          onClick={() => setEnabled(!enabled)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            enabled ? 'bg-primary' : 'bg-border',
          )}
          title={!hasKey ? 'No NVIDIA NIM API key set for your account' : enabled ? 'Disable Assistant' : 'Enable Assistant'}
        >
          <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </div>

      {!hasKey && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600">
          <KeyRound className="h-3.5 w-3.5" />
          Ask an admin to set your NVIDIA NIM API key to use the Assistant.
        </div>
      )}

      {enabled && hasKey && (
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Assistant model
          <select
            value={config.model}
            disabled={isPatching}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-40"
          >
            {config.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
