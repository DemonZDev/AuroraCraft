import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, X } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  description?: string
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: (SelectOption | SelectGroup)[]
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  fullWidth?: boolean
  size?: 'sm' | 'md'
  id?: string
  title?: string
}

// ── Helpers ────────────────────────────────────────────────────────────

function isGroup(item: SelectOption | SelectGroup): item is SelectGroup {
  return 'options' in item && Array.isArray(item.options)
}

function flattenOptions(items: (SelectOption | SelectGroup)[]): SelectOption[] {
  const result: SelectOption[] = []
  for (const item of items) {
    if (isGroup(item)) {
      result.push(...item.options)
    } else {
      result.push(item)
    }
  }
  return result
}

function findLabel(items: (SelectOption | SelectGroup)[], value: string): string {
  for (const item of items) {
    if (isGroup(item)) {
      const found = item.options.find((o) => o.value === value)
      if (found) return found.label
    } else if (item.value === value) {
      return item.label
    }
  }
  return value
}

// ── Component ──────────────────────────────────────────────────────────

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  label,
  fullWidth = true,
  size = 'md',
  id,
  title,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const flatOptions = flattenOptions(options)

  const selectedLabel = value ? findLabel(options, value) : placeholder
  const selectedIndex = flatOptions.findIndex((o) => o.value === value)

  // Open animation
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setMounted(true), 20)
      return () => clearTimeout(t)
    } else {
      setMounted(false)
    }
  }, [open])

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setHighlightedIndex((prev) => {
            const start = prev < 0 ? selectedIndex : prev
            let next = (start + 1) % flatOptions.length
            while (flatOptions[next]?.disabled && next !== start) {
              next = (next + 1) % flatOptions.length
            }
            return next
          })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setHighlightedIndex((prev) => {
            const start = prev < 0 ? selectedIndex : prev
            let next = (start - 1 + flatOptions.length) % flatOptions.length
            while (flatOptions[next]?.disabled && next !== start) {
              next = (next - 1 + flatOptions.length) % flatOptions.length
            }
            return next
          })
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (highlightedIndex >= 0 && !flatOptions[highlightedIndex]?.disabled) {
            onChange(flatOptions[highlightedIndex].value)
            setOpen(false)
          } else if (selectedIndex >= 0) {
            setOpen(false)
          }
          break
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, flatOptions, highlightedIndex, onChange, selectedIndex])

  const handleSelect = (opt: SelectOption) => {
    if (opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  const handleOpen = () => {
    if (!disabled) {
      setOpen(true)
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
    }
  }

  const sizeClasses = size === 'sm'
    ? 'py-1.5 px-2.5 text-xs'
    : 'py-2 px-3 text-sm'

  // Stagger delay per item — fixed 120ms between each
  const getStaggerDelay = (index: number) => {
    return `${index * 120}ms`
  }

  let globalIndex = 0

  const renderOption = (opt: SelectOption) => {
    const index = globalIndex++
    const isSelected = opt.value === value
    const isHighlighted = index === highlightedIndex
    const isDisabled = opt.disabled

    return (
      <div
        key={opt.value}
        role="option"
        aria-selected={isSelected}
        onClick={() => handleSelect(opt)}
        onMouseEnter={() => setHighlightedIndex(index)}
        style={{ animationDelay: getStaggerDelay(index) }}
        className={cn(
          'group relative flex items-start gap-3.5 rounded-xl border px-4 py-3.5 cursor-pointer transition-all duration-150 select-none animate-stagger-in',
          // Base state
          isDisabled && 'opacity-40 cursor-not-allowed border-transparent bg-transparent',
          !isDisabled && 'border-border/40 bg-background/50 hover:border-primary/30 hover:bg-primary/[0.03]',
          // Selected state
          isSelected && !isDisabled && 'border-primary/30 bg-primary/[0.06] shadow-[0_0_0_1px_rgba(59,130,246,0.08)]',
          // Highlighted (keyboard nav)
          !isDisabled && isHighlighted && !isSelected && 'border-primary/20 bg-primary/[0.04]',
          // Active press
          !isDisabled && 'active:scale-[0.99]'
        )}
      >
        {/* Left accent bar for selected */}
        {isSelected && !isDisabled && (
          <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary" />
        )}

        {/* Radio indicator */}
        <div className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
          isSelected && !isDisabled
            ? 'border-primary bg-primary'
            : 'border-border-bright group-hover:border-primary/40',
          isDisabled && 'border-border/50'
        )}>
          {isSelected && !isDisabled && (
            <div className="h-2 w-2 rounded-full bg-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'text-sm font-medium transition-colors',
              isSelected && !isDisabled ? 'text-primary' : 'text-text',
              isDisabled && 'text-text-dim'
            )}>
              {opt.label}
            </span>
            {isSelected && !isDisabled && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
              </div>
            )}
          </div>
          {opt.description && (
            <p className={cn(
              'mt-1 text-[12px] leading-relaxed transition-colors',
              isSelected && !isDisabled ? 'text-primary/60' : 'text-text-dim'
            )}>
              {opt.description}
            </p>
          )}
        </div>
      </div>
    )
  }

  const modalContent = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          mounted ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Modal Card */}
      <div
        className={cn(
          'relative w-full max-w-lg mx-4 rounded-2xl border border-border/40 bg-surface shadow-2xl transition-all duration-300 ease-out overflow-hidden',
          mounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-[0.94] translate-y-4'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h3 className="text-base font-semibold text-text tracking-tight">
              {title || label || 'Select an option'}
            </h3>
            <p className="mt-1 text-[13px] text-text-dim">
              {selectedLabel !== placeholder ? (
                <span>
                  Currently selected: <span className="text-text-muted font-medium">{selectedLabel}</span>
                </span>
              ) : (
                'Choose from the available options below'
              )}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 bg-background/60 text-text-dim hover:bg-surface-hover hover:text-text hover:border-border-bright transition-all duration-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Separator */}
        <div className="mx-6 h-px bg-border/40" />

        {/* Scrollable options */}
        <div className="max-h-[min(65vh,480px)] overflow-auto px-5 py-4 space-y-2">
          {options.map((item, groupIdx) => {
            if (isGroup(item)) {
              return (
                <div key={`group-${groupIdx}`} className="space-y-2">
                  <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                    <div className="h-px flex-1 bg-border/30" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">
                      {item.label}
                    </span>
                    <div className="h-px flex-1 bg-border/30" />
                  </div>
                  {item.options.map((opt) => renderOption(opt))}
                </div>
              )
            } else {
              return renderOption(item)
            }
          })}
        </div>

        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
      </div>
    </div>
  )

  return (
    <div className={cn(fullWidth ? 'w-full' : '', className)} ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-text"
        >
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={cn(
          'relative flex items-center justify-between gap-2 rounded-lg border bg-background text-text transition-all',
          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          'hover:border-border-bright',
          sizeClasses,
          disabled && 'opacity-50 cursor-not-allowed',
          open && 'border-primary ring-1 ring-primary',
          !value && 'text-text-dim',
          fullWidth ? 'w-full' : ''
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-dim transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Centered Modal via Portal */}
      {open && createPortal(modalContent, document.body)}
    </div>
  )
}
