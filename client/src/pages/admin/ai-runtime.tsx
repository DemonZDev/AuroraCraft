import { useState } from 'react'
import { Server, Boxes, Plug, Plus, Pencil, Trash2, X, Zap, DollarSign, Lock, Loader2, Power } from 'lucide-react'
import {
  useAiProviders, useProviderMutations,
  useAiModels, useModelMutations, type ModelInput, type ModelUsage,
  useAdminMcps, useMcpMutations,
  type AiProvider, type AiModelRow, type McpRow,
} from '@/hooks/use-ai-admin'
import { useToasts } from '@/components/ui/glassy'
import { GlassyConfirmModal } from '@/components/ui/glassy'
import { cn } from '@/lib/utils'

const USAGE_LABELS: Record<ModelUsage, string> = {
  agent: 'AI Agent',
  prompt_enhancer: 'Prompt Enhancer',
  error_prompt_maker: 'Error Prompt Maker',
}
const ALL_USAGES: ModelUsage[] = ['agent', 'prompt_enhancer', 'error_prompt_maker']

const inputCls = 'w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text placeholder:text-text-dim/40 focus:border-primary/60 focus:outline-none'
const labelCls = 'block text-[11px] font-medium text-text-dim mb-1'

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={onClose} />
      <div className={cn('relative w-full mx-4 rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto', wide ? 'max-w-2xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">{title}</h3>
            <button onClick={onClose} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function FormError({ error }: { error?: string }) {
  if (!error) return null
  return <p className="mb-3 rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2 text-[11px] text-destructive">{error}</p>
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={on ? 'Disable' : 'Enable'}
      className={cn('inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40', on ? 'bg-success/70' : 'bg-surface-hover')}>
      <span className={cn('h-4 w-4 rounded-full bg-white transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}

const tabs = [
  { id: 'providers' as const, label: 'AI Providers', icon: Server },
  { id: 'models' as const, label: 'AI Models', icon: Boxes },
  { id: 'mcps' as const, label: 'MCPs', icon: Plug },
]

export default function AdminAIRuntimePage() {
  const [tab, setTab] = useState<'providers' | 'models' | 'mcps'>('providers')
  const { addToast, ToastContainer } = useToasts()

  return (
    <div>
      <ToastContainer />
      <h1 className="text-2xl font-bold tracking-tight text-text">AI Runtime</h1>
      <p className="mt-1 text-sm text-text-muted">Manage AI providers, models, and MCPs. Everything here drives the model selectors and per-user keys.</p>

      <div className="mt-6 inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-hover hover:text-text')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'providers' && <ProvidersTab addToast={addToast} />}
        {tab === 'models' && <ModelsTab addToast={addToast} />}
        {tab === 'mcps' && <McpsTab addToast={addToast} />}
      </div>
    </div>
  )
}

// ── Providers ─────────────────────────────────────────────────────────────
function ProvidersTab({ addToast }: { addToast: (m: string, t?: 'success' | 'error') => void }) {
  const { providers, isLoading } = useAiProviders()
  const { create, update, remove } = useProviderMutations()
  const [editing, setEditing] = useState<AiProvider | null>(null)
  const [adding, setAdding] = useState(false)
  const [toDelete, setToDelete] = useState<AiProvider | null>(null)

  const toggleActive = (p: AiProvider) =>
    update.mutate({ id: p.id, isActive: !p.isActive }, { onError: (e: any) => addToast(e?.message || 'Failed', 'error') })

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">OpenAI-compatible endpoints. Disabling a provider hides all its models everywhere.</p>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Provider
        </button>
      </div>

      {isLoading ? <Loading /> : providers.length === 0 ? <Empty label="No providers yet. Add one to get started." /> : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b border-border bg-surface text-left text-text-muted">
              <Th>Name</Th><Th>Endpoint</Th><Th>Mode</Th><Th>Active</Th><Th>Actions</Th>
            </tr></thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text flex items-center gap-1.5">
                      {p.name}
                      {p.isBuiltin && <span title="Built-in" className="inline-flex items-center gap-0.5 rounded bg-accent px-1 text-[9px] text-text-dim"><Lock className="h-2.5 w-2.5" /> built-in</span>}
                    </div>
                    <div className="text-[10px] text-text-dim font-mono">{p.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-text-dim font-mono text-xs max-w-[220px] truncate">{p.kind === 'zen' ? '— (built-in Zen)' : p.baseUrl}</td>
                  <td className="px-4 py-3">
                    {p.isFree
                      ? <Badge color="success"><Zap className="h-3 w-3" /> Free</Badge>
                      : <Badge color="primary"><DollarSign className="h-3 w-3" /> Paid</Badge>}
                  </td>
                  <td className="px-4 py-3"><Toggle on={p.isActive} onClick={() => toggleActive(p)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconBtn onClick={() => setEditing(p)} title="Edit"><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      {!p.isBuiltin && <IconBtn danger onClick={() => setToDelete(p)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></IconBtn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(adding || editing) && (
        <ProviderForm
          provider={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSubmit={(body, done) => {
            const mut = editing ? update : create
            const payload = editing ? { id: editing.id, ...body } : body
            mut.mutate(payload as any, {
              onSuccess: () => { addToast(editing ? 'Provider updated' : 'Provider added', 'success'); setAdding(false); setEditing(null) },
              onError: (e: any) => done(e?.message || 'Failed to save provider'),
            })
          }}
        />
      )}

      <GlassyConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id, {
          onSuccess: () => { addToast('Provider deleted', 'success'); setToDelete(null) },
          onError: (e: any) => addToast(e?.message || 'Failed to delete', 'error'),
        })}
        title="Delete provider?"
        description="This deletes the provider, ALL its models, and every user's API key for it. This cannot be undone."
        icon={Trash2}
        itemName={toDelete?.name}
        confirmText="Delete"
      />
    </div>
  )
}

function ProviderForm({ provider, onClose, onSubmit }: {
  provider: AiProvider | null
  onClose: () => void
  onSubmit: (body: { name: string; baseUrl: string; isFree: boolean }, setError: (e: string) => void) => void
}) {
  const [name, setName] = useState(provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [isFree, setIsFree] = useState(provider?.isFree ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const builtin = provider?.isBuiltin
  // Free/paid is editable for built-ins (OpenRouter, NVIDIA NIM) — only Zen is locked to free,
  // since it bypasses LiteLLM and has no billing meter. The endpoint stays locked for all built-ins.
  const freeLocked = provider?.kind === 'zen'

  const submit = () => {
    if (!name.trim()) return setError('Name is required')
    if (!builtin && !baseUrl.trim()) return setError('Endpoint URL is required')
    setSaving(true); setError('')
    onSubmit({ name: name.trim(), baseUrl: baseUrl.trim(), isFree }, (e) => { setError(e); setSaving(false) })
  }

  return (
    <Modal title={provider ? 'Edit Provider' : 'Add AI Provider'} onClose={onClose}>
      <FormError error={error} />
      <label className={labelCls}>Provider name</label>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fireworks AI" />
      <label className={cn(labelCls, 'mt-3')}>OpenAI-compatible endpoint {builtin && <span className="text-text-dim">(locked for built-in)</span>}</label>
      <input className={cn(inputCls, builtin && 'opacity-50')} value={baseUrl} disabled={builtin} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
      <label className={cn('mt-4 flex items-center gap-2 text-sm text-text', freeLocked && 'opacity-50')}>
        <input type="checkbox" checked={isFree} disabled={freeLocked} onChange={(e) => setIsFree(e.target.checked)} className="h-4 w-4 accent-primary" />
        Free provider <span className="text-[11px] text-text-dim">(models cost 0 tokens; any user may hold its key)</span>
      </label>
      {freeLocked && <p className="mt-1 text-[11px] text-text-dim">Zen is always free — it runs natively in OpenCode and has no billing meter.</p>}
      <p className="mt-2 text-[11px] text-text-dim">Do not set a global API key — keys are added per user in the Users page.</p>
      <div className="mt-5 flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Cancel</button>
        <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Saving…' : provider ? 'Save' : 'Add Provider'}
        </button>
      </div>
    </Modal>
  )
}

// ── Models ──────────────────────────────────────────────────────────────
function ModelsTab({ addToast }: { addToast: (m: string, t?: 'success' | 'error') => void }) {
  const { models, isLoading } = useAiModels()
  const { providers } = useAiProviders()
  const { create, update, remove } = useModelMutations()
  const [editing, setEditing] = useState<AiModelRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [toDelete, setToDelete] = useState<AiModelRow | null>(null)

  const toggleActive = (m: AiModelRow) =>
    update.mutate({ id: m.id, isActive: !m.isActive }, { onError: (e: any) => addToast(e?.message || 'Failed', 'error') })

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Same show-name across providers is fine — disambiguate with a unique tag + weight per usage.</p>
        <button onClick={() => setAdding(true)} disabled={providers.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add Model
        </button>
      </div>
      {providers.length === 0 && <p className="mt-2 text-[11px] text-warning">Add a provider first.</p>}

      {isLoading ? <Loading /> : models.length === 0 ? <Empty label="No models yet." /> : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b border-border bg-surface text-left text-text-muted">
              <Th>Model</Th><Th>Provider</Th><Th>Tag</Th><Th>Usages</Th><Th>Weight</Th><Th>Price (in/out)</Th><Th>Active</Th><Th>Actions</Th>
            </tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{m.showName}</div>
                    <div className="text-[10px] text-text-dim font-mono truncate max-w-[160px]">{m.realName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-muted">{m.providerName}</span>
                    {m.providerIsFree ? <span className="ml-1 text-[10px] text-success">free</span> : <span className="ml-1 text-[10px] text-primary">paid</span>}
                  </td>
                  <td className="px-4 py-3">{m.typeTag ? <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-text-dim">{m.typeTag}</span> : <span className="text-text-dim">—</span>}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{m.usages.map((u) => <span key={u} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">{USAGE_LABELS[u]}</span>)}</div></td>
                  <td className="px-4 py-3 text-text-muted">{m.weight}</td>
                  <td className="px-4 py-3 text-text-dim text-xs" title="Uncached input / Cached input / Output per 1M tokens">{m.providerIsFree ? '—' : `$${m.inputPer1m} / ${m.cachedInputPer1m != null ? '$' + m.cachedInputPer1m : '—'} / $${m.outputPer1m}`}</td>
                  <td className="px-4 py-3"><Toggle on={m.isActive} onClick={() => toggleActive(m)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconBtn onClick={() => setEditing(m)} title="Edit"><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn danger onClick={() => setToDelete(m)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(adding || editing) && (
        <ModelForm
          model={editing}
          providers={providers}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSubmit={(body, done) => {
            const mut = editing ? update : create
            const payload = editing ? { id: editing.id, ...body } : body
            mut.mutate(payload as any, {
              onSuccess: () => { addToast(editing ? 'Model updated' : 'Model added', 'success'); setAdding(false); setEditing(null) },
              onError: (e: any) => done(e?.message || 'Failed to save model'),
            })
          }}
        />
      )}

      <GlassyConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id, {
          onSuccess: () => { addToast('Model deleted', 'success'); setToDelete(null) },
          onError: (e: any) => addToast(e?.message || 'Failed to delete', 'error'),
        })}
        title="Delete model?"
        description="Removes this model from every selector."
        icon={Trash2}
        itemName={toDelete?.showName}
        confirmText="Delete"
      />
    </div>
  )
}

function ModelForm({ model, providers, onClose, onSubmit }: {
  model: AiModelRow | null
  providers: AiProvider[]
  onClose: () => void
  onSubmit: (body: ModelInput, setError: (e: string) => void) => void
}) {
  const [providerId, setProviderId] = useState(model?.providerId ?? providers[0]?.id ?? '')
  const [showName, setShowName] = useState(model?.showName ?? '')
  const [realName, setRealName] = useState(model?.realName ?? '')
  const [description, setDescription] = useState(model?.description ?? '')
  const [usages, setUsages] = useState<ModelUsage[]>(model?.usages ?? ['agent'])
  const [typeTag, setTypeTag] = useState(model?.typeTag ?? '')
  const [weight, setWeight] = useState(String(model?.weight ?? 100))
  const [inputPrice, setInputPrice] = useState(String(model?.inputPer1m ?? 0))
  const [cachedInputPrice, setCachedInputPrice] = useState(model?.cachedInputPer1m != null ? String(model.cachedInputPer1m) : '')
  const [outputPrice, setOutputPrice] = useState(String(model?.outputPer1m ?? 0))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedProvider = providers.find((p) => p.id === providerId)
  const isPaid = selectedProvider && !selectedProvider.isFree

  const toggleUsage = (u: ModelUsage) =>
    setUsages((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]))

  const submit = () => {
    if (!providerId) return setError('Select a provider')
    if (!showName.trim()) return setError('Show name is required')
    if (!realName.trim()) return setError('Real (upstream) model name is required')
    if (usages.length === 0) return setError('Select at least one usage')
    const w = parseInt(weight, 10)
    if (isNaN(w)) return setError('Weight must be a number')
    setSaving(true); setError('')
    onSubmit({
      providerId, showName: showName.trim(), realName: realName.trim(), description: description.trim(),
      usages, typeTag: typeTag.trim(), weight: w,
      inputPer1m: isPaid ? parseFloat(inputPrice) || 0 : 0,
      outputPer1m: isPaid ? parseFloat(outputPrice) || 0 : 0,
      cachedInputPer1m: isPaid && cachedInputPrice.trim() !== '' ? (parseFloat(cachedInputPrice) || 0) : null,
    }, (e) => { setError(e); setSaving(false) })
  }

  return (
    <Modal title={model ? 'Edit Model' : 'Add AI Model'} onClose={onClose} wide>
      <FormError error={error} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Provider</label>
          <select className={inputCls} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.isFree ? 'free' : 'paid'})</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Type tag (e.g. fast / slow)</label>
          <input className={inputCls} value={typeTag} onChange={(e) => setTypeTag(e.target.value)} placeholder="fast" />
        </div>
        <div>
          <label className={labelCls}>Show name</label>
          <input className={inputCls} value={showName} onChange={(e) => setShowName(e.target.value)} placeholder="GLM-5.1" />
        </div>
        <div>
          <label className={labelCls}>Real (upstream) name</label>
          <input className={inputCls} value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="accounts/fireworks/models/glm-5p1" />
        </div>
      </div>
      <label className={cn(labelCls, 'mt-3')}>Description</label>
      <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description shown to users" />

      <label className={cn(labelCls, 'mt-3')}>Usages</label>
      <div className="flex flex-wrap gap-2">
        {ALL_USAGES.map((u) => (
          <button key={u} onClick={() => toggleUsage(u)} type="button"
            className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', usages.includes(u) ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border/50 text-text-muted hover:bg-surface-hover')}>
            {USAGE_LABELS[u]}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <label className={labelCls}>Weight (lower = higher)</label>
        <input className={cn(inputCls, 'max-w-[200px]')} type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </div>
      {isPaid && (
        <>
          <label className={cn(labelCls, 'mt-4')}>Pricing — USD per 1M tokens</label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-dim">Uncached Input</label>
              <input className={inputCls} type="number" step="0.001" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} placeholder="0.30" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-dim">Cached Input</label>
              <input className={inputCls} type="number" step="0.001" value={cachedInputPrice} onChange={(e) => setCachedInputPrice(e.target.value)} placeholder="blank = same as input" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-dim">Output</label>
              <input className={inputCls} type="number" step="0.001" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} />
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-text-dim">Cached Input is the discounted rate some providers (e.g. Fireworks) charge for cache-hit prompt tokens. Leave blank if the provider has no cached tier — cached tokens are then billed at the uncached input rate (never free).</p>
        </>
      )}
      {!isPaid && <p className="mt-2 text-[11px] text-text-dim">Free provider — pricing fields hidden (models cost 0 tokens).</p>}

      <div className="mt-5 flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Cancel</button>
        <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Saving…' : model ? 'Save' : 'Add Model'}
        </button>
      </div>
    </Modal>
  )
}

// ── MCPs ────────────────────────────────────────────────────────────────
function McpsTab({ addToast }: { addToast: (m: string, t?: 'success' | 'error') => void }) {
  const { mcps, isLoading } = useAdminMcps()
  const { create, update, remove } = useMcpMutations()
  const [editing, setEditing] = useState<McpRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [toDelete, setToDelete] = useState<McpRow | null>(null)

  const toggleActive = (m: McpRow) =>
    update.mutate({ id: m.id, isActive: !m.isActive }, { onError: (e: any) => addToast(e?.message || 'Failed', 'error') })

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">MCP servers for the agent. "API" MCPs substitute <code className="text-primary">MCP-API-Key</code> with each user's key.</p>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add MCP
        </button>
      </div>

      {isLoading ? <Loading /> : mcps.length === 0 ? <Empty label="No MCPs configured." /> : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b border-border bg-surface text-left text-text-muted">
              <Th>Name</Th><Th>Type</Th><Th>Active</Th><Th>Actions</Th>
            </tr></thead>
            <tbody>
              {mcps.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium text-text">{m.name}</td>
                  <td className="px-4 py-3">{m.apiType === 'api' ? <Badge color="primary">API key</Badge> : <Badge color="success">No key</Badge>}</td>
                  <td className="px-4 py-3"><Toggle on={m.isActive} onClick={() => toggleActive(m)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconBtn onClick={() => setEditing(m)} title="Edit"><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn danger onClick={() => setToDelete(m)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(adding || editing) && (
        <McpForm
          mcp={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSubmit={(body, done) => {
            const mut = editing ? update : create
            const payload = editing ? { id: editing.id, ...body } : body
            mut.mutate(payload as any, {
              onSuccess: () => { addToast(editing ? 'MCP updated' : 'MCP added', 'success'); setAdding(false); setEditing(null) },
              onError: (e: any) => done(e?.message || 'Failed to save MCP'),
            })
          }}
        />
      )}

      <GlassyConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id, {
          onSuccess: () => { addToast('MCP deleted', 'success'); setToDelete(null) },
          onError: (e: any) => addToast(e?.message || 'Failed to delete', 'error'),
        })}
        title="Delete MCP?"
        description="Removes the MCP and every user's key for it."
        icon={Trash2}
        itemName={toDelete?.name}
        confirmText="Delete"
      />
    </div>
  )
}

function McpForm({ mcp, onClose, onSubmit }: {
  mcp: McpRow | null
  onClose: () => void
  onSubmit: (body: { name: string; config: string; apiType: 'non_api' | 'api' }, setError: (e: string) => void) => void
}) {
  const [name, setName] = useState(mcp?.name ?? '')
  const [apiType, setApiType] = useState<'non_api' | 'api'>(mcp?.apiType ?? 'non_api')
  const [config, setConfig] = useState(mcp?.config ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = () => {
    if (!name.trim()) return setError('Name is required')
    if (!config.trim()) return setError('Config is required')
    setSaving(true); setError('')
    onSubmit({ name: name.trim(), config: config.trim(), apiType }, (e) => { setError(e); setSaving(false) })
  }

  return (
    <Modal title={mcp ? 'Edit MCP' : 'Add MCP'} onClose={onClose} wide>
      <FormError error={error} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Name (admin reference)</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Firecrawl" />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={apiType} onChange={(e) => setApiType(e.target.value as 'non_api' | 'api')}>
            <option value="non_api">Non API (no key)</option>
            <option value="api">API (uses MCP-API-Key)</option>
          </select>
        </div>
      </div>
      <label className={cn(labelCls, 'mt-3')}>MCP config (JSON)</label>
      <textarea className={cn(inputCls, 'font-mono text-xs h-44 resize-y')} value={config} onChange={(e) => setConfig(e.target.value)}
        placeholder={'{\n  "type": "local",\n  "command": ["npx", "-y", "firecrawl-mcp"],\n  "environment": { "FIRECRAWL_API_KEY": "MCP-API-Key" }\n}'} />
      {apiType === 'api' && <p className="mt-2 text-[11px] text-text-dim">Put the literal <code className="text-primary">MCP-API-Key</code> where the user's key should be injected.</p>}
      <div className="mt-5 flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Cancel</button>
        <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Saving…' : mcp ? 'Save' : 'Add MCP'}
        </button>
      </div>
    </Modal>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>
}
function IconBtn({ children, onClick, danger, title }: { children: React.ReactNode; onClick: () => void; danger?: boolean; title?: string }) {
  return <button onClick={onClick} title={title} className={cn('rounded-md p-1.5 transition-colors', danger ? 'text-text-dim hover:bg-destructive/10 hover:text-destructive' : 'text-text-dim hover:bg-surface-hover hover:text-text')}>{children}</button>
}
function Badge({ children, color }: { children: React.ReactNode; color: 'success' | 'primary' }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', color === 'success' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary')}>{children}</span>
}
function Loading() {
  return <div className="mt-6 flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-text-dim" /></div>
}
function Empty({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-10 text-center">
      <Power className="mx-auto h-9 w-9 text-text-dim/40" />
      <p className="mt-3 text-sm text-text-muted">{label}</p>
    </div>
  )
}
