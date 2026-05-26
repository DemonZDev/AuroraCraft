import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Info, X, File } from 'lucide-react'

// ── Toast System ──────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info'
export interface Toast { id: string; message: string; type: ToastType }

export function GlassyToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t) }, [])
  useEffect(() => { const t = setTimeout(() => onDismiss(), 4000); return () => clearTimeout(t) }, [onDismiss])
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info
  const colors = toast.type === 'success'
    ? 'border-success/20 bg-success/10 text-success'
    : toast.type === 'error'
    ? 'border-destructive/20 bg-destructive/10 text-destructive'
    : 'border-primary/20 bg-primary/10 text-primary'
  return (
    <div className={cn(
      "pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl transition-all duration-300",
      colors,
      mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
    )}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-xs font-medium">{toast.message}</span>
      <button onClick={onDismiss} className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-black/5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    return id
  }, [])
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])
  const ToastContainer = useCallback(() => (
    <div className="fixed right-4 top-16 z-[200] flex flex-col gap-2">
      {toasts.map(t => (
        <GlassyToast key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  ), [toasts])
  return { addToast, removeToast, ToastContainer, toasts }
}

// ── Glassy Prompt Modal ───────────────────────────────────────────────

export function GlassyPromptModal({ isOpen, onClose, onConfirm, title, description, placeholder, defaultValue = '', icon: Icon, confirmText = 'Confirm', confirmVariant = 'primary', errorText }: {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: string) => void
  title: string
  description?: string
  placeholder?: string
  defaultValue?: string
  icon?: React.ComponentType<{ className?: string }>
  confirmText?: string
  confirmVariant?: 'primary' | 'danger'
  errorText?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
      setError('')
      const t = setTimeout(() => { setMounted(true); inputRef.current?.focus(); inputRef.current?.select() }, 30)
      return () => clearTimeout(t)
    } else {
      setMounted(false)
    }
  }, [isOpen, defaultValue])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!value.trim()) { setError('This field is required'); return }
    onConfirm(value.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onClose()
  }

  const displayError = errorText || error

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className={cn("absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-300", mounted ? "opacity-100" : "opacity-0")} />
      <div
        className={cn(
          "relative w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-surface/90 backdrop-blur-2xl shadow-2xl transition-all duration-300 ease-out overflow-hidden",
          mounted ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.94] translate-y-1"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text">{title}</h3>
              {description && <p className="text-[11px] text-text-dim mt-0.5 leading-relaxed">{description}</p>}
            </div>
          </div>
          <div className="relative">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); if (error) setError('') }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                "w-full rounded-xl border bg-background/50 px-4 py-3 text-sm text-text placeholder:text-text-dim/40 focus:outline-none transition-all duration-200",
                displayError
                  ? "border-destructive/50 focus:border-destructive focus:ring-2 focus:ring-destructive/10"
                  : "border-border/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
              )}
            />
            {displayError && (
              <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {displayError}
              </p>
            )}
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 bg-transparent px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition-all duration-200">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className={cn(
                "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:shadow-lg",
                confirmVariant === 'danger'
                  ? "bg-destructive hover:bg-destructive/90 hover:shadow-destructive/20"
                  : "bg-primary hover:bg-primary/90 hover:shadow-primary/20"
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Glassy Confirm Modal ──────────────────────────────────────────────

export function GlassyConfirmModal({ isOpen, onClose, onConfirm, title, description, icon: Icon, confirmText = 'Delete', itemName, error }: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  confirmText?: string
  itemName?: string
  error?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setMounted(true), 30)
      return () => clearTimeout(t)
    } else {
      setMounted(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className={cn("absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-300", mounted ? "opacity-100" : "opacity-0")} />
      <div
        className={cn(
          "relative w-full max-w-sm mx-4 rounded-2xl border border-destructive/20 bg-surface/90 backdrop-blur-2xl shadow-2xl shadow-destructive/5 transition-all duration-300 ease-out overflow-hidden text-center",
          mounted ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.94] translate-y-1"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-destructive/30 to-transparent" />
        <div className="p-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
            {Icon ? <Icon className="h-7 w-7 text-destructive" /> : <AlertCircle className="h-7 w-7 text-destructive" />}
          </div>
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          {description && <p className="mt-1.5 text-[11px] text-text-dim leading-relaxed">{description}</p>}
          {itemName && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-background/60 px-3 py-1.5 border border-border/40">
              <File className="h-3.5 w-3.5 text-text-dim" />
              <code className="text-[11px] text-text-muted font-mono truncate max-w-[200px]">{itemName}</code>
            </div>
          )}
          {error && (
            <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
          <div className="mt-5 flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 bg-transparent px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition-all duration-200">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-white hover:bg-destructive/90 transition-all duration-200 hover:shadow-lg hover:shadow-destructive/20"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
