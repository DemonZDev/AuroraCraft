import { Sparkles, Loader2, Square } from 'lucide-react'
import { useAssistant } from '@/hooks/use-assistant'

/**
 * Compact workspace-toolbar indicator for the AI Assistant.
 * - working (queued/running): spinner + Stop (force-stop)
 * - awaiting_user: "Assistant ready" chip → onOpen() (opens the relevant blocking modal)
 * - idle: nothing (keeps the toolbar clean)
 * Renders nothing unless the Assistant is available (paid + enabled + key).
 */
export function AssistantStatusBadge({ projectId, onOpen }: { projectId: string; onOpen?: () => void }) {
  const { available, job, stop } = useAssistant(projectId)
  if (!available || !job) return null

  if (job.status === 'queued' || job.status === 'running') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Assistant working…
        <button
          onClick={() => stop(job.id)}
          className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-500 hover:bg-red-500/10"
          title="Force-stop the Assistant"
        >
          <Square className="h-3 w-3" />
          Stop
        </button>
      </div>
    )
  }

  if (job.status === 'awaiting_user') {
    return (
      <button
        onClick={() => onOpen?.()}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
        title="The Assistant is waiting for you"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Assistant ready
      </button>
    )
  }

  return null
}
