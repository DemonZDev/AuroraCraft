import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Loader2, Search, Trash2, Ban, CircleCheck, FolderOpen } from 'lucide-react'
import { useAdminProjects, useAdminProjectMutations } from '@/hooks/use-admin'
import { SOFTWARE_LABELS } from '@/lib/software-options'
import { GlassyConfirmModal } from '@/components/ui/glassy'
import type { AdminProject } from '@/types'

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function AdminProjectsPage() {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const { projects, isLoading } = useAdminProjects(debounced.trim() || undefined)
  const { setSuspended, remove } = useAdminProjectMutations()

  const [deleteTarget, setDeleteTarget] = useState<AdminProject | null>(null)
  const [error, setError] = useState('')

  const toggleSuspend = (p: AdminProject) => {
    setError('')
    setSuspended.mutate(
      { id: p.id, suspended: !p.suspended },
      { onError: (e) => setError((e as { message?: string })?.message || 'Failed to update project') },
    )
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    setError('')
    remove.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (e) => setError((e as { message?: string })?.message || 'Failed to delete project'),
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text">Projects</h1>
      <p className="mt-1 text-sm text-text-muted">View, search, suspend, and delete any project on the platform</p>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project name or owner…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {isLoading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-dim" />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-6 text-center py-12">
          <p className="text-sm text-text-dim">No projects found</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-medium text-text-muted">Name</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Status</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Software</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Created</th>
                <th className="px-4 py-3 text-right font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const effectivelySuspended = project.suspended || !!project.ownerSuspended
                return (
                  <tr key={project.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-3 font-medium text-text">{project.name}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {project.ownerUsername ?? '—'}
                      {project.ownerSuspended && (
                        <span className="ml-1.5 text-xs text-warning">(suspended)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {effectivelySuspended ? (
                        <span className="rounded px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning">
                          {project.suspended ? 'suspended' : 'owner suspended'}
                        </span>
                      ) : (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          project.status === 'active' ? 'bg-success/10 text-success' : 'bg-accent text-text-muted'
                        }`}>
                          {project.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{SOFTWARE_LABELS[project.software] ?? project.software}</td>
                    <td className="px-4 py-3 text-text-dim">
                      {new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {project.linkId ? (
                          <Link
                            to={`/admin/projects/${project.id}/workspace`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <FolderOpen className="h-3.5 w-3.5" /> Workspace
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-text-dim/50" title="No workspace directory">
                            <FolderOpen className="h-3.5 w-3.5" /> Workspace
                          </span>
                        )}
                        <button
                          onClick={() => toggleSuspend(project)}
                          disabled={setSuspended.isPending}
                          className={`inline-flex items-center gap-1 text-xs hover:underline disabled:opacity-50 ${
                            project.suspended ? 'text-success' : 'text-warning'
                          }`}
                        >
                          {project.suspended ? <CircleCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          {project.suspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => { setError(''); setDeleteTarget(project) }}
                          className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <GlassyConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Project?"
        description="This permanently deletes the project, its entire workspace, and all chat history. This cannot be undone."
        icon={Trash2}
        confirmText={remove.isPending ? 'Deleting…' : 'Delete'}
        itemName={deleteTarget?.name}
        error={error || undefined}
      />
    </div>
  )
}
