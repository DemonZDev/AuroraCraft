import { useState } from 'react'
import { Network, Coins, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { useGraphify } from '@/hooks/use-graphify'
import { GlassyConfirmModal } from '@/components/ui/glassy'
import { cn } from '@/lib/utils'

/**
 * Paid-only "Save tokens using Graphify" controls.
 * Renders nothing for free users. "View Graph" calls `onViewGraph`, which the
 * workspace wires to render the graph as a web view inside the editor panel
 * (opening graph.html from the file tree still shows raw HTML — that's separate).
 */
export function GraphifyControls({
  projectId,
  isPaid,
  onViewGraph,
  compact = false,
  disabled = false,
}: {
  projectId: string
  isPaid: boolean
  onViewGraph?: () => void
  compact?: boolean
  disabled?: boolean
}) {
  const { graphify, enable, isEnabling, remove, isRemoving } = useGraphify(projectId, isPaid)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)

  if (!isPaid) return null

  const status = graphify?.status ?? 'none'
  const building = status === 'building' || isEnabling
  const mutating = isEnabling || isRemoving

  const labelBtn =
    'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-40 disabled:cursor-not-allowed'
  const iconBtn =
    'rounded-md p-1.5 text-text-dim hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed'
  const dangerLabel =
    'inline-flex items-center gap-1.5 rounded-md border border-red-500/60 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed'
  const dangerIcon =
    'rounded-md p-1.5 text-red-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed'

  const renderButtons = () => {
    if (building) {
      return (
        <button disabled className={compact ? iconBtn : labelBtn} title="Building knowledge graph…">
          <Loader2 className={cn('h-3.5 w-3.5', 'animate-spin')} />
          {!compact && 'Building graph…'}
        </button>
      )
    }

    if (status === 'ready') {
      return (
        <>
          <button
            onClick={() => onViewGraph?.()}
            className={compact ? iconBtn : labelBtn}
            title="View knowledge graph"
          >
            <Network className="h-3.5 w-3.5" />
            {!compact && 'View Graph'}
          </button>
          <button
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={disabled || mutating}
            className={compact ? dangerIcon : dangerLabel}
            title="Remove Graphify"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {!compact && 'Remove Graphify'}
          </button>
        </>
      )
    }

    if (status === 'failed') {
      return (
        <>
          <button
            onClick={() => enable()}
            disabled={disabled || mutating}
            className={compact ? iconBtn : labelBtn}
            title="Graph build failed — retry"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {!compact && 'Retry graph'}
          </button>
          <button
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={disabled || mutating}
            className={compact ? dangerIcon : dangerLabel}
            title="Remove Graphify"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {!compact && 'Remove Graphify'}
          </button>
        </>
      )
    }

    // status === 'none' (not enabled, or pending lazy rebuild)
    return (
      <button
        onClick={() => enable()}
        disabled={disabled || mutating}
        className={compact ? iconBtn : labelBtn}
        title="Save tokens using Graphify — build a local code graph the AI uses (no token cost)"
      >
        <Coins className="h-3.5 w-3.5" />
        {!compact && 'Save tokens using Graphify'}
      </button>
    )
  }

  return (
    <>
      {compact ? renderButtons() : <div className="flex items-center gap-2">{renderButtons()}</div>}

      <GlassyConfirmModal
        isOpen={confirmRemoveOpen}
        onClose={() => setConfirmRemoveOpen(false)}
        onConfirm={async () => {
          await remove()
          setConfirmRemoveOpen(false)
        }}
        title="Remove Graphify"
        description="This deletes the project's knowledge graph and turns off Graphify. You can re-enable it anytime."
        icon={Trash2}
        confirmText="Remove"
      />
    </>
  )
}
