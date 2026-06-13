import { useState } from 'react'
import { Network, Coins, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { useGraphify } from '@/hooks/use-graphify'
import { GlassyConfirmModal } from '@/components/ui/glassy'
import { HeaderMenu, type ActionSection } from '@/components/workspace/workspace-actions'

/**
 * Paid-only "Save tokens using Graphify" control for the desktop workspace header.
 * Renders nothing for free users. Not enabled → labeled CTA button; building →
 * spinner button; ready/failed → a "Graphify" menu with a status dot. "Open
 * knowledge graph" calls `onViewGraph`, which the workspace wires to render the
 * graph as a web view inside the editor panel. (The mobile workspace surfaces the
 * same actions through its action sheet instead of this component.)
 */
export function GraphifyControls({
  projectId,
  isPaid,
  onViewGraph,
  disabled = false,
}: {
  projectId: string
  isPaid: boolean
  onViewGraph?: () => void
  disabled?: boolean
}) {
  const { graphify, enable, isEnabling, remove, isRemoving } = useGraphify(projectId, isPaid)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)

  if (!isPaid) return null

  const status = graphify?.status ?? 'none'
  const building = status === 'building' || isEnabling

  const labelBtn =
    'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-40 disabled:cursor-not-allowed'

  const menuSections: ActionSection[] = [
    {
      id: 'graphify',
      actions: [
        ...(status === 'ready'
          ? [{
              id: 'view',
              icon: Network,
              label: 'Open knowledge graph',
              description: 'Interactive map of your project code',
              onSelect: () => onViewGraph?.(),
            }]
          : []),
        ...(status === 'failed'
          ? [{
              id: 'retry',
              icon: RefreshCw,
              label: 'Retry graph build',
              description: 'The last build failed — run it again',
              onSelect: () => void enable().catch(() => {}),
            }]
          : []),
        {
          id: 'remove',
          icon: Trash2,
          label: 'Remove Graphify',
          description: 'Delete the graph & turn off token saving',
          tone: 'danger' as const,
          disabled: isRemoving,
          onSelect: () => setConfirmRemoveOpen(true),
        },
      ],
    },
  ]

  return (
    <>
      {building ? (
        <button disabled className={labelBtn} title="Building the knowledge graph — usually takes under a minute">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Building graph…
        </button>
      ) : status === 'ready' || status === 'failed' ? (
        <HeaderMenu
          icon={Network}
          label="Graphify"
          dot={status === 'ready' ? 'success' : 'danger'}
          disabled={disabled || isRemoving}
          title={status === 'ready' ? 'Graphify is active — the AI reads the graph to save tokens' : 'Graphify build failed'}
          sections={menuSections}
        />
      ) : (
        <button
          onClick={() => void enable().catch(() => {})}
          disabled={disabled || isEnabling}
          className={labelBtn}
          title="Build a local code graph the AI reads instead of full files — free, no token cost"
        >
          <Coins className="h-3.5 w-3.5" />
          Save tokens using Graphify
        </button>
      )}

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
