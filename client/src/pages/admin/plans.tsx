import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Save, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  usePlanSettings,
  usePlanSettingsMutations,
  type PlanFeature,
} from '@/hooks/use-plan-settings'

export default function AdminPlansPage() {
  const { settings, isLoading } = usePlanSettings()
  const { update } = usePlanSettingsMutations()

  const [proPrice, setProPrice] = useState('5')
  const [proOriginal, setProOriginal] = useState('12.5')
  const [proTokens, setProTokens] = useState('5000')
  const [tokenPrice, setTokenPrice] = useState('1')
  const [features, setFeatures] = useState<PlanFeature[]>([])

  // Sync form state when settings arrive / refresh.
  useEffect(() => {
    if (!settings) return
    setProPrice(String(settings.proPriceUsd))
    setProOriginal(String(settings.proOriginalPriceUsd))
    setProTokens(String(settings.proMonthlyTokens))
    setTokenPrice(String(settings.tokenPricePer1kUsd))
    setFeatures(settings.features)
  }, [settings])

  const discount =
    parseFloat(proOriginal) > parseFloat(proPrice) && parseFloat(proOriginal) > 0
      ? Math.round((1 - parseFloat(proPrice) / parseFloat(proOriginal)) * 100)
      : 0

  const setFeature = (i: number, patch: Partial<PlanFeature>) => {
    setFeatures((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  const handleSave = () => {
    const price = parseFloat(proPrice)
    const original = parseFloat(proOriginal)
    const tokens = parseInt(proTokens, 10)
    const perK = parseFloat(tokenPrice)
    if ([price, original, perK].some((n) => isNaN(n) || n < 0) || isNaN(tokens) || tokens < 0) {
      toast.error('All prices and token amounts must be valid non-negative numbers.')
      return
    }
    if (features.some((f) => !f.label.trim())) {
      toast.error('Every feature needs a label.')
      return
    }
    update.mutate(
      {
        proPriceUsd: price,
        proOriginalPriceUsd: original,
        proMonthlyTokens: tokens,
        tokenPricePer1kUsd: perK,
        features: features.map((f) => ({ ...f, label: f.label.trim() })),
      },
      {
        onSuccess: () => toast.success('Plan settings saved.'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-dim" />
      </div>
    )
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary'

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Plans</h1>
          <p className="mt-1 text-sm text-text-muted">
            Pricing-page plans, token pricing, and the Free/Pro feature matrix
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      {/* Pricing */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <label className="text-sm text-text-muted">Pro Price (USD / month)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={proPrice}
            onChange={(e) => setProPrice(e.target.value)}
            className={`mt-2 ${inputClass}`}
          />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <label className="text-sm text-text-muted">Original Price (strikethrough)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={proOriginal}
            onChange={(e) => setProOriginal(e.target.value)}
            className={`mt-2 ${inputClass}`}
          />
          <p className="mt-2 text-xs text-text-dim">
            {discount > 0 ? `Shows as ${discount}% OFF` : 'No discount badge shown'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <label className="text-sm text-text-muted">Pro Monthly Tokens</label>
          <input
            type="number"
            min="0"
            step="1"
            value={proTokens}
            onChange={(e) => setProTokens(e.target.value)}
            className={`mt-2 ${inputClass}`}
          />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <label className="text-sm text-text-muted">Token Top-up (USD / 1000 tokens)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={tokenPrice}
            onChange={(e) => setTokenPrice(e.target.value)}
            className={`mt-2 ${inputClass}`}
          />
        </div>
      </div>

      {/* Feature matrix */}
      <div className="mt-6 rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text">Feature Matrix</h2>
          <button
            onClick={() => setFeatures((prev) => [...prev, { label: '', free: false, pro: true }])}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Feature
          </button>
        </div>

        <div className="grid grid-cols-[1fr_64px_64px_40px] items-center gap-2 border-b border-border px-5 py-2 text-xs font-medium text-text-dim">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
          <span />
        </div>

        {features.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-dim">No features yet — add one above.</p>
        ) : (
          <ul>
            {features.map((feature, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_64px_64px_40px] items-center gap-2 border-b border-border px-5 py-2 last:border-b-0"
              >
                <input
                  value={feature.label}
                  onChange={(e) => setFeature(i, { label: e.target.value })}
                  placeholder="Feature name"
                  className={inputClass}
                />
                <div className="flex justify-center">
                  <button
                    onClick={() => setFeature(i, { free: !feature.free })}
                    aria-label={`Toggle Free access for ${feature.label || 'feature'}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                      feature.free
                        ? 'border-success/40 bg-success/15 text-success'
                        : 'border-border bg-background text-text-dim hover:border-border-bright'
                    }`}
                  >
                    {feature.free && <Check className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => setFeature(i, { pro: !feature.pro })}
                    aria-label={`Toggle Pro access for ${feature.label || 'feature'}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                      feature.pro
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-border bg-background text-text-dim hover:border-border-bright'
                    }`}
                  >
                    {feature.pro && <Check className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={() => setFeatures((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${feature.label || 'feature'}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-dim transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
