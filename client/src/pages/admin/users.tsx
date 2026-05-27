import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Terminal, Shield, Coins, User as UserIcon, KeyRound, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useAdminUsers, useAdminUserProviderKeys } from '@/hooks/use-admin'
import { api } from '@/lib/api'
import { GlassyConfirmModal, GlassyPromptModal } from '@/components/ui/glassy'
import type { KiroAuthStatus } from '@/types'

function KiroAuthButton({ userId }: { userId: string }) {
  const [status, setStatus] = useState<KiroAuthStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const checkStatus = async () => {
    setLoading(true)
    try {
      const result = await api.get<KiroAuthStatus>(`/admin/kiro/status/${userId}`)
      setStatus(result)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-text-dim" />
  }

  if (status) {
    return (
      <div className="flex items-center gap-1.5">
        {status.authenticated ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3 w-3" />
            Kiro Auth
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <XCircle className="h-3 w-3" />
            No Kiro
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={checkStatus}
      className="inline-flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
    >
      <Terminal className="h-3 w-3" />
      Check Kiro
    </button>
  )
}

export default function AdminUsersPage() {
  const { users, isLoading, refetch } = useAdminUsers()
  const [grantModalOpen, setGrantModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string } | null>(null)
  const [loginUrl, setLoginUrl] = useState('')
  const [token, setToken] = useState('')
  const [initiating, setInitiating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenGrantOpen, setTokenGrantOpen] = useState(false)
  const [tokenGrantUser, setTokenGrantUser] = useState<{ id: string; username: string } | null>(null)
  const [tierUpdateOpen, setTierUpdateOpen] = useState(false)
  const [tierUpdateUser, setTierUpdateUser] = useState<{ id: string; username: string; tier: string } | null>(null)

  const handleInitiate = async () => {
    if (!selectedUser) return
    setInitiating(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/coderabbit/initiate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setLoginUrl(data.loginUrl)
        setError(null)
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }))
        setError(data.error || 'Failed to initiate login')
      }
    } catch (err) {
      setError('Network error: unable to reach server. Please check your connection.')
    } finally {
      setInitiating(false)
    }
  }

  const handleComplete = async () => {
    if (!selectedUser || !token.trim()) return
    setCompleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/coderabbit/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: token.trim() }),
      })
      if (res.ok) {
        setGrantModalOpen(false)
        setLoginUrl('')
        setToken('')
        setSelectedUser(null)
        setError(null)
        refetch()
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }))
        setError(data.error || 'Failed to complete login')
      }
    } catch (err) {
      setError('Network error: unable to reach server. Please check your connection.')
    } finally {
      setCompleting(false)
    }
  }

  const closeModal = () => {
    setGrantModalOpen(false)
    setLoginUrl('')
    setToken('')
    setSelectedUser(null)
    setError(null)
  }

  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false)
  const [revokeUserId, setRevokeUserId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState('')

  const openRevokeConfirm = (userId: string) => {
    setRevokeUserId(userId)
    setRevokeError('')
    setRevokeConfirmOpen(true)
  }

  const handleRevoke = async () => {
    if (!revokeUserId) return
    setRevokeError('')
    try {
      const res = await fetch(`/api/admin/users/${revokeUserId}/coderabbit/revoke`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setRevokeError(data.error || 'Failed to revoke access')
        return
      }
      setRevokeConfirmOpen(false)
      setRevokeUserId(null)
      refetch()
    } catch (err) {
      setRevokeError('Failed to revoke access')
    }
  }

  const [tokenGrantError, setTokenGrantError] = useState('')
  const [tierUpdateError, setTierUpdateError] = useState('')
  const [providerKeysOpen, setProviderKeysOpen] = useState(false)
  const [providerKeysUser, setProviderKeysUser] = useState<{ id: string; username: string } | null>(null)
  const [newProviderKey, setNewProviderKey] = useState('')
  const [addingProviderKey, setAddingProviderKey] = useState(false)
  const [providerKeyError, setProviderKeyError] = useState('')

  const handleUpdateProviderKey = async (provider: string, newApiKey: string) => {
    if (!providerKeysUser || !newApiKey.trim()) return
    try {
      const res = await fetch(`/api/admin/users/${providerKeysUser.id}/provider-keys/${provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: newApiKey.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to update key')
      }
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update key')
    }
  }

  const handleAddProviderKey = async () => {
    if (!providerKeysUser || !newProviderKey.trim()) return
    const [provider, ...rest] = newProviderKey.split(':')
    const apiKey = rest.join(':').trim()
    if (!provider || !apiKey) {
      setProviderKeyError('Format: provider:api_key')
      return
    }
    setAddingProviderKey(true)
    setProviderKeyError('')
    try {
      const res = await fetch(`/api/admin/users/${providerKeysUser.id}/provider-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: provider.trim().toLowerCase(), apiKey }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to add key')
      }
      setNewProviderKey('')
    } catch (err: any) {
      setProviderKeyError(err.message)
    } finally {
      setAddingProviderKey(false)
    }
  }

  const handleDeleteProviderKey = async (userId: string, provider: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/provider-keys/${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete key')
    } catch {
      // non-fatal
    }
  }

  const handleGrantTokens = (value: string) => {
    if (!tokenGrantUser) return
    const amount = parseInt(value, 10)
    if (!value.trim() || isNaN(amount) || amount <= 0) {
      setTokenGrantError('Must be a positive number')
      return
    }
    setTokenGrantError('')
    fetch(`/api/admin/users/${tokenGrantUser.id}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, description: 'Admin grant' }),
    }).then(res => {
      if (!res.ok) throw new Error('Failed to grant tokens')
      setTokenGrantOpen(false)
      setTokenGrantUser(null)
      refetch()
    }).catch(() => {
      setTokenGrantError('Failed to grant tokens')
    })
  }

  const handleUpdateTier = async (tier: string) => {
    if (!tierUpdateUser) return
    setTierUpdateError('')
    try {
      const res = await fetch(`/api/admin/users/${tierUpdateUser.id}/tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier }),
      })
      if (res.status === 409) {
        const data = await res.json()
        setTierUpdateError(data.message || 'Cannot downgrade: API keys must be removed first')
        return
      }
      if (!res.ok) throw new Error('Failed to update tier')
      setTierUpdateOpen(false)
      setTierUpdateUser(null)
      refetch()
    } catch {
      setTierUpdateError('Failed to update tier')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text">Users</h1>
      <p className="mt-1 text-sm text-text-muted">Manage user accounts and roles</p>

      {isLoading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-dim" />
        </div>
      ) : users.length === 0 ? (
        <div className="mt-6 text-center py-12">
          <p className="text-sm text-text-dim">No users found</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-medium text-text-muted">Username</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Email</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Role</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Tier</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Tokens</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">CodeRabbit</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Joined</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium text-text">{user.username}</td>
                  <td className="px-4 py-3 text-text-muted">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-accent text-text-muted'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setTierUpdateUser({ id: user.id, username: user.username, tier: user.tier || 'free' })
                        setTierUpdateOpen(true)
                      }}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        user.tier === 'paid'
                          ? 'bg-success/10 text-success'
                          : 'bg-accent text-text-muted'
                      }`}
                    >
                      {user.tier || 'free'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{user.aiTokens?.toLocaleString() || 0}</span>
                        <button
                          onClick={() => {
                            setTokenGrantUser({ id: user.id, username: user.username })
                            setTokenGrantOpen(true)
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          +Grant
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setProviderKeysUser({ id: user.id, username: user.username })
                          setProviderKeysOpen(true)
                        }}
                        className="inline-flex items-center gap-1 text-[10px] text-text-dim hover:text-text-muted"
                      >
                        <KeyRound className="h-3 w-3" />
                        Provider Keys
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.coderabbitEnabled ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Shield className="h-3 w-3" />
                          Enabled
                        </span>
                        <button
                          onClick={() => openRevokeConfirm(user.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Revoke
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedUser({ id: user.id, username: user.username })
                          setLoginUrl('')
                          setToken('')
                          setError(null)
                          setGrantModalOpen(true)
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Grant Access
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <KiroAuthButton userId={user.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grant CodeRabbit Modal */}
      {grantModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text">Grant CodeRabbit Access</h2>
            <p className="mt-2 text-sm text-text-muted">
              Enable code reviews for <strong>{selectedUser.username}</strong>
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Error</p>
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error}</p>
              </div>
            )}

            {!loginUrl ? (
              <>
                <p className="mt-4 text-sm text-text-muted">
                  Click below to generate a browser login URL for CodeRabbit authentication.
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInitiate}
                    disabled={initiating}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {initiating ? 'Generating...' : 'Generate Login URL'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-lg border border-border bg-background p-4">
                  <p className="text-sm font-medium text-text mb-2">Step 1: Open this URL in your browser</p>
                  <a
                    href={loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline break-all block mb-3"
                  >
                    {loginUrl}
                  </a>
                  <p className="text-sm font-medium text-text mb-2">Step 2: After login, paste the token here</p>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste token here"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={!token.trim() || completing}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {completing ? 'Completing...' : 'Complete Login'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <GlassyConfirmModal
        isOpen={revokeConfirmOpen}
        onClose={() => setRevokeConfirmOpen(false)}
        onConfirm={handleRevoke}
        title="Revoke CodeRabbit Access?"
        description="This user will lose access to CodeRabbit code reviews."
        icon={Shield}
        confirmText="Revoke"
        error={revokeError || undefined}
      />

      <GlassyPromptModal
        isOpen={tokenGrantOpen}
        onClose={() => {
          setTokenGrantOpen(false)
          setTokenGrantUser(null)
          setTokenGrantError('')
        }}
        onConfirm={handleGrantTokens}
        title={`Grant Tokens — ${tokenGrantUser?.username}`}
        description="Enter the number of tokens to grant. 1 USD = 1000 tokens."
        icon={Coins}
        confirmText="Grant"
        placeholder="e.g. 5000"
        errorText={tokenGrantError || undefined}
      />

      <GlassyConfirmModal
        isOpen={tierUpdateOpen}
        onClose={() => {
          setTierUpdateOpen(false)
          setTierUpdateUser(null)
          setTierUpdateError('')
        }}
        onConfirm={() => {
          const nextTier = tierUpdateUser?.tier === 'free' ? 'paid' : 'free'
          handleUpdateTier(nextTier)
        }}
        title={`Change Tier — ${tierUpdateUser?.username}`}
        description={`Current: ${tierUpdateUser?.tier || 'free'}. Click to toggle.`}
        icon={UserIcon}
        confirmText={`Set to ${tierUpdateUser?.tier === 'free' ? 'paid' : 'free'}`}
        error={tierUpdateError || undefined}
      />

      {providerKeysOpen && providerKeysUser && (
        <ProviderKeysModal
          userId={providerKeysUser.id}
          username={providerKeysUser.username}
          onClose={() => {
            setProviderKeysOpen(false)
            setProviderKeysUser(null)
            setNewProviderKey('')
            setProviderKeyError('')
          }}
          onAdd={handleAddProviderKey}
          onDelete={handleDeleteProviderKey}
          onEdit={handleUpdateProviderKey}
          newKey={newProviderKey}
          setNewKey={setNewProviderKey}
          adding={addingProviderKey}
          error={providerKeyError}
        />
      )}
    </div>
  )
}

function ProviderKeysModal({
  userId,
  username,
  onClose,
  onAdd,
  onDelete,
  onEdit,
  newKey,
  setNewKey,
  adding,
  error,
}: {
  userId: string
  username: string
  onClose: () => void
  onAdd: () => void
  onDelete: (userId: string, provider: string) => void
  onEdit: (provider: string, apiKey: string) => Promise<void>
  newKey: string
  setNewKey: (value: string) => void
  adding: boolean
  error: string
}) {
  const { keys, isLoading, refetch } = useAdminUserProviderKeys(userId)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const handleAdd = async () => {
    await onAdd()
    refetch()
  }

  const handleDelete = async (provider: string) => {
    await onDelete(userId, provider)
    refetch()
  }

  const startEdit = (provider: string) => {
    setEditingKey(provider)
    setEditValue('')
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const saveEdit = async (provider: string) => {
    if (!editValue.trim()) return
    setSavingEdit(true)
    try {
      await onEdit(provider, editValue.trim())
      setEditingKey(null)
      setEditValue('')
      refetch()
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text mb-1">Provider API Keys — {username}</h2>
        <p className="text-sm text-text-muted mb-4">Configure API keys for this user. Format: provider:api_key</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
            <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="fireworks:sk-xxx..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleAdd}
            disabled={!newKey.trim() || adding}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-center text-sm text-text-dim py-4">No API keys configured for this user</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {keys.map((key) => (
              <div key={key.id} className="rounded-lg border border-border bg-background p-3">
                {editingKey === key.provider ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text capitalize shrink-0">{key.provider}</span>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Enter new API key..."
                      autoFocus
                      className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-dim focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={() => saveEdit(key.provider)}
                      disabled={!editValue.trim() || savingEdit}
                      className="text-success hover:text-success/80 p-1 disabled:opacity-50"
                    >
                      {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-text-dim hover:text-text-muted p-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-text capitalize shrink-0">{key.provider}</span>
                      <code className="text-xs text-text-muted font-mono truncate">{key.apiKey}</code>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(key.provider)}
                        className="text-text-dim hover:text-primary p-1"
                        title="Edit API key"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(key.provider)}
                        className="text-red-500 hover:text-red-400 p-1"
                        title="Delete API key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
