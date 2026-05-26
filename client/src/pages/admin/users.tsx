import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Terminal, Shield, AlertCircle } from 'lucide-react'
import { useAdminUsers } from '@/hooks/use-admin'
import { api } from '@/lib/api'
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

      {/* Revoke Confirm Modal */}
      {revokeConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setRevokeConfirmOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-destructive/20 bg-surface/90 backdrop-blur-2xl shadow-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-destructive/30 to-transparent" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
              <Shield className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="text-sm font-semibold text-text">Revoke CodeRabbit Access?</h3>
            <p className="mt-1.5 text-[11px] text-text-dim leading-relaxed">This user will lose access to CodeRabbit code reviews.</p>
            {revokeError && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>{revokeError}</span>
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setRevokeConfirmOpen(false)} className="flex-1 rounded-xl border border-border/60 bg-transparent px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition-all duration-200">
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-white hover:bg-destructive/90 transition-all duration-200 hover:shadow-lg hover:shadow-destructive/20"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
