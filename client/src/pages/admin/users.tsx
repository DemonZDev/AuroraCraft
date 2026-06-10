import { useState } from 'react'
import { Loader2, Shield, Coins, User as UserIcon, KeyRound, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useAdminUsers } from '@/hooks/use-admin'
import { useUserKeys, useUserKeyMutations, type UserProviderKeyRow, type UserProviderKey } from '@/hooks/use-ai-admin'
import { GlassyConfirmModal, GlassyPromptModal } from '@/components/ui/glassy'

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
  const [tokenDeductOpen, setTokenDeductOpen] = useState(false)
  const [tokenDeductUser, setTokenDeductUser] = useState<{ id: string; username: string; tokens: number } | null>(null)
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
  const [tokenDeductError, setTokenDeductError] = useState('')
  const [tierUpdateError, setTierUpdateError] = useState('')
  const [providerKeysOpen, setProviderKeysOpen] = useState(false)
  const [providerKeysUser, setProviderKeysUser] = useState<{ id: string; username: string } | null>(null)

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

  const handleDeductTokens = (value: string) => {
    if (!tokenDeductUser) return
    const amount = parseInt(value, 10)
    if (!value.trim() || isNaN(amount) || amount <= 0) {
      setTokenDeductError('Must be a positive number')
      return
    }
    if (amount > tokenDeductUser.tokens) {
      setTokenDeductError(`Cannot deduct ${amount} tokens — user only has ${tokenDeductUser.tokens.toLocaleString()}`)
      return
    }
    setTokenDeductError('')
    fetch(`/api/admin/users/${tokenDeductUser.id}/tokens/deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, description: 'Admin deduction' }),
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Failed to deduct tokens (HTTP ${res.status})`)
      }
      setTokenDeductOpen(false)
      setTokenDeductUser(null)
      refetch()
    }).catch((err: any) => {
      setTokenDeductError(err.message || 'Failed to deduct tokens')
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
                        <button
                          onClick={() => {
                            setTokenDeductUser({ id: user.id, username: user.username, tokens: user.aiTokens ?? 0 })
                            setTokenDeductOpen(true)
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          -Deduct
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
                  <p className="text-sm font-medium text-text mb-2">Step 1: Open this URL in your browser and sign in</p>
                  <a
                    href={loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline break-all block mb-3"
                  >
                    {loginUrl}
                  </a>
                  <p className="text-sm font-medium text-text mb-2">Step 2: Paste the callback string here</p>
                  <p className="text-xs text-text-muted mb-2">
                    After signing in, CodeRabbit shows a callback string starting with <code className="rounded bg-surface px-1">coderabbit-cli://</code>. Copy it and paste it below.
                  </p>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="coderabbit-cli://auth-callback?..."
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

      <GlassyPromptModal
        isOpen={tokenDeductOpen}
        onClose={() => {
          setTokenDeductOpen(false)
          setTokenDeductUser(null)
          setTokenDeductError('')
        }}
        onConfirm={handleDeductTokens}
        title={`Deduct Tokens — ${tokenDeductUser?.username}`}
        description={`Current balance: ${tokenDeductUser?.tokens.toLocaleString() ?? 0} tokens. Enter the number of tokens to deduct.`}
        icon={Coins}
        confirmText="Deduct"
        placeholder="e.g. 1000"
        errorText={tokenDeductError || undefined}
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
        <UserKeysModal
          userId={providerKeysUser.id}
          username={providerKeysUser.username}
          onClose={() => {
            setProviderKeysOpen(false)
            setProviderKeysUser(null)
          }}
        />
      )}
    </div>
  )
}

function KeyRow({ label, badge, hasKey, masked, locked, lockedReason, onSet, onRemove }: {
  label: string
  badge?: React.ReactNode
  hasKey: boolean
  masked: string | null
  locked?: boolean
  lockedReason?: string
  onSet: (apiKey: string) => Promise<unknown>
  onRemove: () => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!val.trim()) return
    setBusy(true); setErr('')
    try { await onSet(val.trim()); setEditing(false); setVal('') }
    catch (e: any) { setErr(e?.message || 'Failed to save key') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true); setErr('')
    try { await onRemove() }
    catch (e: any) { setErr(e?.message || 'Failed to remove key') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text shrink-0">{label}</span>
          {badge}
          {!editing && (hasKey
            ? <code className="text-xs text-text-muted font-mono truncate">{masked}</code>
            : <span className="text-xs text-text-dim">no key set</span>)}
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { setEditing(true); setErr('') }} disabled={locked}
              className="text-text-dim hover:text-primary p-1 disabled:opacity-30" title={locked ? lockedReason : (hasKey ? 'Edit key' : 'Set key')}>
              {hasKey ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
            {hasKey && (
              <button onClick={remove} disabled={busy} className="text-red-500 hover:text-red-400 p-1" title="Remove key">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {locked && !editing && <p className="mt-1 text-[10px] text-warning">{lockedReason}</p>}
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input type="password" value={val} autoFocus onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(''); setErr('') } }}
            placeholder="Paste API key…"
            className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
          <button onClick={save} disabled={!val.trim() || busy} className="text-success hover:text-success/80 p-1 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setEditing(false); setVal(''); setErr('') }} className="text-text-dim hover:text-text-muted p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {err && <p className="mt-1.5 text-[11px] text-destructive">{err}</p>}
    </div>
  )
}

// A paid provider's key list: the ordered routing chain (weight asc) with per-key
// dollar limit + live usage, plus an add form. Free providers use KeyRow instead.
function PaidProviderKeys({ provider, onAdd, onUpdate, onReset, onRemove }: {
  provider: UserProviderKeyRow
  onAdd: (body: { apiKey: string; label?: string; weight?: number; limitUsd?: number | null }) => Promise<unknown>
  onUpdate: (keyId: string, body: { label?: string | null; weight?: number; limitUsd?: number | null; isActive?: boolean }) => Promise<unknown>
  onReset: (keyId: string) => Promise<unknown>
  onRemove: (keyId: string) => Promise<unknown>
}) {
  const [adding, setAdding] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [weight, setWeight] = useState('100')
  const [limit, setLimit] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const add = async () => {
    if (!apiKey.trim()) return
    setBusy(true); setErr('')
    try {
      await onAdd({
        apiKey: apiKey.trim(),
        label: label.trim() || undefined,
        weight: weight.trim() ? Number(weight) : undefined,
        limitUsd: limit.trim() ? Number(limit) : null,
      })
      setApiKey(''); setLabel(''); setWeight('100'); setLimit(''); setAdding(false)
    } catch (e: any) { setErr(e?.message || 'Failed to add key') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{provider.name}</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">paid</span>
          <span className="text-[10px] text-text-dim">{provider.keys.length} key{provider.keys.length === 1 ? '' : 's'}</span>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setErr('') }} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">
            <Plus className="h-3 w-3" /> Add key
          </button>
        )}
      </div>

      {provider.keys.length === 0 && !adding && (
        <p className="text-xs text-text-dim py-1">No keys — the user can't use this provider until one is added.</p>
      )}

      <div className="space-y-1.5">
        {provider.keys.map((k) => (
          <PaidKeyItem key={k.id}
            k={k}
            onUpdate={(body) => onUpdate(k.id, body)}
            onReset={() => onReset(k.id)}
            onRemove={() => onRemove(k.id)} />
        ))}
      </div>

      {adding && (
        <div className="mt-2 space-y-2 rounded border border-border bg-surface p-2">
          <input type="password" value={apiKey} autoFocus onChange={(e) => setApiKey(e.target.value)} placeholder="Paste API key…"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
          <div className="flex gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)"
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
            <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight" type="number" title="Lower = higher priority"
              className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
            <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Limit $" type="number" step="0.01" title="Provider-dollar budget (blank = unlimited)"
              className="w-24 rounded border border-border bg-background px-2 py-1 text-xs text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
          </div>
          <div className="flex items-center justify-end gap-2">
            {err && <span className="mr-auto text-[11px] text-destructive">{err}</span>}
            <button onClick={() => { setAdding(false); setApiKey(''); setErr('') }} className="text-xs text-text-dim hover:text-text-muted px-2 py-1">Cancel</button>
            <button onClick={add} disabled={!apiKey.trim() || busy} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// One paid key row: shows used/limit, weight, enabled state + inline edit / reset / remove.
function PaidKeyItem({ k, onUpdate, onReset, onRemove }: {
  k: UserProviderKey
  onUpdate: (body: { label?: string | null; weight?: number; limitUsd?: number | null; isActive?: boolean }) => Promise<unknown>
  onReset: () => Promise<unknown>
  onRemove: () => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(k.label ?? '')
  const [weight, setWeight] = useState(String(k.weight ?? 100))
  const [limit, setLimit] = useState(k.limitUsd != null ? String(k.limitUsd) : '')
  const [busy, setBusy] = useState(false)

  const exhausted = !!k.exhaustedAt
  const used = k.usedUsd ?? 0
  const limitNum = k.limitUsd
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const save = () => run(async () => {
    await onUpdate({ label: label.trim() || null, weight: Number(weight), limitUsd: limit.trim() ? Number(limit) : null })
    setEditing(false)
  })

  return (
    <div className={`rounded border px-2 py-1.5 ${exhausted ? 'border-warning/40 bg-warning/5' : k.isActive ? 'border-border bg-surface' : 'border-border bg-background opacity-60'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded bg-background px-1 py-0.5 text-[10px] font-mono text-text-dim" title="weight (lower = higher priority)">w{k.weight ?? 100}</span>
          <code className="text-[11px] font-mono text-text-muted truncate">{k.maskedKey}</code>
          {k.label && <span className="text-[10px] text-text-dim truncate">· {k.label}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-text-dim">${used.toFixed(2)}{limitNum != null ? ` / $${limitNum.toFixed(2)}` : ' / ∞'}</span>
          {exhausted
            ? <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] text-warning">exhausted</span>
            : !k.isActive && <span className="rounded-full bg-text-dim/15 px-1.5 py-0.5 text-[9px] text-text-dim">disabled</span>}
          <button onClick={() => setEditing(v => !v)} disabled={busy} className="text-text-dim hover:text-primary p-0.5" title="Edit"><Pencil className="h-3 w-3" /></button>
          {(used > 0 || exhausted || !k.isActive) && (
            <button onClick={() => run(onReset)} disabled={busy} className="text-text-dim hover:text-success p-0.5 text-xs" title="Reset usage & re-enable">↺</button>
          )}
          <button onClick={() => run(onRemove)} disabled={busy} className="text-red-500 hover:text-red-400 p-0.5" title="Remove key"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {editing && (
        <div className="mt-1.5 flex items-center gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label"
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
          <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" title="Weight"
            className="w-16 rounded border border-border bg-background px-2 py-1 text-[11px] text-text focus:border-primary focus:outline-none" />
          <input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" step="0.01" placeholder="$ limit"
            className="w-20 rounded border border-border bg-background px-2 py-1 text-[11px] text-text placeholder:text-text-dim focus:border-primary focus:outline-none" />
          <button onClick={save} disabled={busy} className="text-success hover:text-success/80 p-0.5">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
          <button onClick={() => setEditing(false)} className="text-text-dim hover:text-text-muted p-0.5"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  )
}

function UserKeysModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const { keys, isLoading } = useUserKeys(userId)
  const { setKey, updateKey, resetUsage, removeKey } = useUserKeyMutations(userId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text mb-1">API Keys — {username}</h2>
        <p className="text-sm text-text-muted mb-4">Keys are stored on the backend and never shown in full. Paid providers support multiple keys with weight (lower = higher priority) and a per-key dollar limit; free providers allow one key.</p>

        {isLoading || !keys ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-text-dim" /></div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2">AI Model Providers</h3>
              {keys.providers.length === 0 ? (
                <p className="text-sm text-text-dim py-2">No providers configured. Add some in AI Runtime.</p>
              ) : (
                <div className="space-y-2">
                  {keys.providers.map((p) => p.isFree ? (
                    <KeyRow
                      key={p.providerId}
                      label={p.name}
                      badge={<span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] text-success">free</span>}
                      hasKey={p.keys.length > 0}
                      masked={p.keys[0]?.maskedKey ?? null}
                      onSet={(apiKey) => setKey.mutateAsync({ providerId: p.providerId, apiKey })}
                      onRemove={() => removeKey.mutateAsync({ providerId: p.providerId })}
                    />
                  ) : (
                    <PaidProviderKeys
                      key={p.providerId}
                      provider={p}
                      onAdd={(body) => setKey.mutateAsync({ providerId: p.providerId, ...body })}
                      onUpdate={(keyId, body) => updateKey.mutateAsync({ keyId, ...body })}
                      onReset={(keyId) => resetUsage.mutateAsync(keyId)}
                      onRemove={(keyId) => removeKey.mutateAsync({ keyId })}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2">MCPs</h3>
              {keys.mcps.length === 0 ? (
                <p className="text-sm text-text-dim py-2">No API-type MCPs configured.</p>
              ) : (
                <div className="space-y-2">
                  {keys.mcps.map((m) => (
                    <KeyRow
                      key={m.mcpId}
                      label={m.name}
                      hasKey={m.hasKey}
                      masked={m.maskedKey}
                      onSet={(apiKey) => setKey.mutateAsync({ mcpId: m.mcpId, apiKey })}
                      onRemove={() => removeKey.mutateAsync({ mcpId: m.mcpId })}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover">Close</button>
        </div>
      </div>
    </div>
  )
}
