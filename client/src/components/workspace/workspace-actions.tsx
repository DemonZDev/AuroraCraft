import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shared action model for the mobile bottom sheet and the desktop header menus.
// Every action carries a text label + optional description so users always know
// what a control does — no icon-only mystery buttons.

export type ActionTone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

export interface WorkspaceAction {
  id: string
  icon: ComponentType<{ className?: string }>
  label: string
  description?: string
  tone?: ActionTone
  disabled?: boolean
  /** Small right-aligned pill, e.g. "Connected" / "Not built". */
  hint?: string
  loading?: boolean
  onSelect?: () => void
  /** Anchor actions (downloads) — used instead of onSelect when set. */
  href?: string
  download?: boolean
}

export interface ActionSection {
  id: string
  title?: string
  actions: WorkspaceAction[]
}

const TONE_TEXT: Record<ActionTone, string> = {
  default: 'text-text-dim',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
}

const TONE_CHIP: Record<ActionTone, string> = {
  default: 'border-border/60 bg-surface-hover text-text-muted',
  primary: 'border-primary/20 bg-primary/10 text-primary',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
}

// ── Mobile bottom action sheet ───────────────────────────────────────

function SheetRow({ action, onClose, divided }: { action: WorkspaceAction; onClose: () => void; divided: boolean }) {
  const Icon = action.icon
  const tone = action.tone ?? 'default'

  const content = (
    <>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', TONE_CHIP[tone])}>
        {action.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-[13px] font-medium', tone === 'danger' ? 'text-destructive' : 'text-text')}>
          {action.label}
        </span>
        {action.description && (
          <span className="block truncate text-[11px] leading-snug text-text-dim">{action.description}</span>
        )}
      </span>
      {action.hint && (
        <span className="shrink-0 rounded-md bg-surface-hover px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-dim">
          {action.hint}
        </span>
      )}
      {!action.disabled && <ChevronRight className="h-4 w-4 shrink-0 text-text-dim/50" />}
    </>
  )

  const rowClass = cn(
    'flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 transition-colors',
    divided && 'border-t border-border/40',
    action.disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-surface-hover/60 active:bg-surface-hover'
  )

  if (action.href && !action.disabled) {
    return (
      <a href={action.href} download={action.download} className={rowClass} onClick={onClose}>
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      disabled={action.disabled}
      className={rowClass}
      onClick={() => {
        if (action.disabled) return
        onClose()
        action.onSelect?.()
      }}
    >
      {content}
    </button>
  )
}

export function ActionSheet({ open, onClose, title, subtitle, sections }: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  sections: ActionSection[]
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setMounted(true), 20)
      return () => clearTimeout(t)
    }
    setMounted(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`${title} actions`} onClick={onClose}>
      <div className={cn('absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200', mounted ? 'opacity-100' : 'opacity-0')} />
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-2xl border-x border-t border-border/60 bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-2xl transition-transform duration-300 ease-out',
          mounted ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <div className="h-1 w-9 rounded-full bg-border-bright" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-0.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text">{title}</h3>
            {subtitle && <p className="truncate text-[11px] text-text-dim">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-text-dim transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-1">
          {sections.filter((s) => s.actions.length > 0).map((section) => (
            <div key={section.id} className="mt-2 first:mt-0">
              {section.title && (
                <p className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-dim/80">
                  {section.title}
                </p>
              )}
              <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40">
                {section.actions.map((action, i) => (
                  <SheetRow key={action.id} action={action} onClose={onClose} divided={i > 0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Desktop header dropdown menu ─────────────────────────────────────

function HeaderMenuRow({ action, close }: { action: WorkspaceAction; close: () => void }) {
  const Icon = action.icon
  const tone = action.tone ?? 'default'

  const content = (
    <>
      {action.loading
        ? <Loader2 className={cn('mt-0.5 h-4 w-4 shrink-0 animate-spin', TONE_TEXT[tone])} />
        : <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT[tone])} />}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-xs font-medium', tone === 'danger' ? 'text-destructive' : 'text-text')}>
          {action.label}
        </span>
        {action.description && (
          <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-text-dim">{action.description}</span>
        )}
      </span>
      {action.hint && (
        <span className="shrink-0 self-center rounded bg-surface-hover px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-dim">
          {action.hint}
        </span>
      )}
    </>
  )

  const rowClass = cn(
    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
    action.disabled
      ? 'cursor-not-allowed opacity-45'
      : tone === 'danger' ? 'hover:bg-destructive/10' : 'hover:bg-surface-hover'
  )

  if (action.href && !action.disabled) {
    return (
      <a role="menuitem" href={action.href} download={action.download} className={rowClass} onClick={close}>
        {content}
      </a>
    )
  }

  return (
    <button
      role="menuitem"
      type="button"
      disabled={action.disabled}
      className={rowClass}
      onClick={() => {
        if (action.disabled) return
        close()
        action.onSelect?.()
      }}
    >
      {content}
    </button>
  )
}

export function HeaderMenu({ icon: Icon, label, dot, sections, disabled, title, width = 'w-64' }: {
  icon: ComponentType<{ className?: string }>
  label: string
  dot?: 'success' | 'warning' | 'danger'
  sections: ActionSection[]
  disabled?: boolean
  title?: string
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const dotColor = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' } as const

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40',
          open && 'bg-surface-hover text-text'
        )}
      >
        {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor[dot])} />}
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[9rem] truncate">{label}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-[80] mt-1.5 overflow-hidden rounded-xl border border-border/70 bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl',
            width
          )}
        >
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
          <div className="p-1.5">
            {sections.filter((s) => s.actions.length > 0).map((section, si) => (
              <div key={section.id}>
                {si > 0 && <div className="mx-2 my-1.5 border-t border-border/60" />}
                {section.title && (
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-dim/70">
                    {section.title}
                  </p>
                )}
                {section.actions.map((action) => (
                  <HeaderMenuRow key={action.id} action={action} close={() => setOpen(false)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
