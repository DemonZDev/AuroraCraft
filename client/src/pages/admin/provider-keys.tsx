import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, Trash2, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { GlassyPromptModal, GlassyConfirmModal } from '@/components/ui/glassy'

interface ProviderKey {
  id: string
  provider: string
  apiKey: string
  isActive: boolean
  createdAt: string
}

const PROVIDERS = [
  { id: 'fireworks', label: 'Fireworks AI' },
  { id: 'bluesminds', label: 'Bluesminds' },
  { id: 'modal', label: 'Modal' },
  { id: 'firecrawl', label: 'Firecrawl MCP (Search)' },
  { id: 'nvidia-nim', label: 'NVIDIA NIM (Assistant)' },
]

export default function AdminProviderKeysPage() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [deleteKey, setDeleteKey] = useState<ProviderKey | null>(null)
  const [addError, setAddError] = useState('')

  const { data: keys, isLoading } = useQuery({
    queryKey: ['admin', 'provider-keys'],
    queryFn: () => api.get<ProviderKey[]>('/admin/provider-keys'),
  })

  const addMutation = useMutation({
    mutationFn: (body: { provider: string; apiKey: string }) =>
      api.post('/admin/provider-keys', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'provider-keys'] })
      setAddOpen(false)
      setAddError('')
    },
    onError: (err: any) => {
      setAddError(err?.message || 'Failed to add key')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/provider-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'provider-keys'] })
      setDeleteKey(null)
    },
  })

  const handleAdd = (value: string) => {
    const [provider, ...rest] = value.split(':')
    const apiKey = rest.join(':').trim()
    if (!provider || !apiKey) {
      setAddError('Format: provider:api_key (e.g. fireworks:sk-xxx)')
      return
    }
    const p = PROVIDERS.find((x) => x.id === provider.trim().toLowerCase())
    if (!p) {
      setAddError(`Unknown provider. Use: ${PROVIDERS.map((x) => x.id).join(', ')}`)
      return
    }
    setAddError('')
    addMutation.mutate({ provider: p.id, apiKey })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Provider API Keys</h1>
          <p className="mt-1 text-sm text-text-dim">
            Configure API keys for AI model providers. Each provider needs its own key.
          </p>
        </div>
        <button
          onClick={() => {
            setAddOpen(true)
            setAddError('')
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Key
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-dim" />
        </div>
      ) : !keys?.length ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <KeyRound className="mx-auto h-10 w-10 text-text-dim/40" />
          <h3 className="mt-3 text-sm font-medium text-text">No API keys configured</h3>
          <p className="mt-1 text-xs text-text-dim max-w-sm mx-auto">
            Add API keys for Fireworks AI, Bluesminds, or Modal to enable premium AI models for paid users.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-medium text-text-muted">Provider</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">API Key</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Status</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Added</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium text-text capitalize">{key.provider}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-background px-2 py-1 text-xs text-text-muted font-mono">
                      {key.apiKey}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {key.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-text-dim">
                        <AlertCircle className="h-3 w-3" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {new Date(key.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteKey(key)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-medium text-text mb-2">Supported Providers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-background/50 p-3">
              <div className="text-xs font-medium text-text capitalize">{p.label}</div>
              <div className="mt-1 text-[11px] text-text-dim">
                {p.id === 'fireworks'
                  ? 'Fast tier for GLM-5.1, Kimi K2.6, Qwen3.6 Plus, MiniMax M2.7, DeepSeek V4 Pro'
                  : p.id === 'bluesminds'
                  ? 'Slow tier for GLM-5.1, Kimi K2.6, Qwen3.6 Plus, MiniMax M2.7, Gemini 3.1 Pro, Qwen3.6 Max, GPT-5.3 Chat'
                  : 'Rate-limited tier for GLM-5.1 only'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <GlassyPromptModal
        isOpen={addOpen}
        onClose={() => {
          setAddOpen(false)
          setAddError('')
        }}
        onConfirm={handleAdd}
        title="Add Provider API Key"
        description="Format: provider:api_key — e.g. fireworks:sk-xxx or bluesminds:bm-xxx"
        icon={KeyRound}
        confirmText="Save Key"
        placeholder="fireworks:sk-..."
        errorText={addError || undefined}
      />

      <GlassyConfirmModal
        isOpen={!!deleteKey}
        onClose={() => setDeleteKey(null)}
        onConfirm={() => { if (deleteKey) deleteMutation.mutate(deleteKey.id); }}
        title="Delete API Key?"
        description={`This will remove the ${deleteKey?.provider} API key. Users will no longer be able to use this provider.`}
        icon={Trash2}
        confirmText="Delete"
      />
    </div>
  )
}
