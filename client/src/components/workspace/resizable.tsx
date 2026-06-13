import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// VS Code-style resizable panel support for the desktop workspace.
// Sizes are pixel widths for the chat + file-tree panels; the editor takes the rest.

export const PANEL_DEFAULTS = { chat: 460, tree: 230 }
export const MIN_EDITOR_WIDTH = 380

const PANEL_LIMITS = {
  chat: { min: 340, max: 760 },
  tree: { min: 170, max: 440 },
} as const

export type PanelKey = keyof typeof PANEL_LIMITS
export type PanelSizes = { chat: number; tree: number }

const STORAGE_KEY = 'auroracraft:workspace:panels:v1'

export function clampPanel(panel: PanelKey, value: number): number {
  const { min, max } = PANEL_LIMITS[panel]
  return Math.round(Math.min(max, Math.max(min, value)))
}

export function loadPanelSizes(): PanelSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.chat === 'number' && typeof parsed?.tree === 'number') {
        return { chat: clampPanel('chat', parsed.chat), tree: clampPanel('tree', parsed.tree) }
      }
    }
  } catch { /* ignore corrupt localStorage */ }
  return { ...PANEL_DEFAULTS }
}

export function savePanelSizes(sizes: PanelSizes): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes))
  } catch { /* ignore localStorage errors (e.g. quota exceeded) */ }
}

/**
 * Draggable vertical divider between panels. Renders as the 1px panel border,
 * widening into a primary-tinted grab bar on hover/drag. Double-click resets.
 * Pointer capture + a full-screen shield keep the drag alive over the Monaco iframe.
 */
export function PanelDivider({ label, onDragStart, onDelta, onDragEnd, onReset }: {
  label: string
  onDragStart: () => void
  onDelta: (dx: number) => void
  onDragEnd: () => void
  onReset?: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        title="Drag to resize · double-click to reset"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          startXRef.current = e.clientX
          setDragging(true)
          onDragStart()
        }}
        onPointerMove={(e) => {
          if (dragging) onDelta(e.clientX - startXRef.current)
        }}
        onPointerUp={(e) => {
          if (!dragging) return
          e.currentTarget.releasePointerCapture(e.pointerId)
          setDragging(false)
          onDragEnd()
        }}
        onPointerCancel={() => {
          if (dragging) {
            setDragging(false)
            onDragEnd()
          }
        }}
        onDoubleClick={onReset}
        className="group relative z-20 -mx-[3px] w-[7px] shrink-0 cursor-col-resize touch-none select-none"
      >
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-all duration-150',
            'group-hover:w-[3px] group-hover:bg-primary/50',
            dragging && 'w-[3px] bg-primary'
          )}
        />
      </div>
      {dragging && <div aria-hidden className="fixed inset-0 z-[70] cursor-col-resize" />}
    </>
  )
}
