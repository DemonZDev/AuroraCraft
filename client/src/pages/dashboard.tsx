import { useState } from 'react'
import { Link } from 'react-router'
import { Plus, Search, MoreHorizontal, Trash2, Pencil, Archive, Settings } from 'lucide-react'
import { useProjects } from '@/hooks/use-projects'
import { cn } from '@/lib/utils'
import { SOFTWARE_LABELS } from '@/lib/software-options'
import type { Project } from '@/types'

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type SortKey = 'name' | 'updatedAt'

export default function DashboardPage() {
  const { projects, isLoading, deleteProject, isDeleting } = useProjects()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('updatedAt')
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const filtered = projects
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteProject(deleteTarget.id)
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Projects</h1>
          <p className="mt-1 text-sm text-text-muted">Manage your Minecraft plugin projects</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {!isLoading && projects.length > 0 && (
        <div className="mt-6 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="updatedAt">Last updated</option>
            <option value="name">Name</option>
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-5">
              <div className="h-5 w-32 rounded bg-border" />
              <div className="mt-3 h-3 w-48 rounded bg-border" />
              <div className="mt-4 flex gap-2">
                <div className="h-5 w-14 rounded bg-border" />
                <div className="h-5 w-14 rounded bg-border" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <div key={project.id} className="group relative rounded-xl border border-border bg-surface transition-colors hover:border-border-bright hover:bg-surface-hover">
                <Link
                  to={`/workspace/${project.id}`}
                  className="block p-5"
                >
                  <div className="flex items-start gap-3">
                    {project.logo && (
                      <img 
                        src={project.logo} 
                        alt={`${project.name} logo`} 
                        className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0 pr-8">
                      <h3 className="font-medium text-text group-hover:text-primary">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-text-dim">{project.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-accent px-2 py-0.5 text-xs text-text-muted">
                          {SOFTWARE_LABELS[project.software] ?? project.software}
                        </span>
                        <span className="rounded bg-accent px-2 py-0.5 text-xs text-text-muted">
                          {project.language}
                        </span>
                        {project.versions && (
                          <span className="rounded bg-accent px-2 py-0.5 text-xs text-text-muted">
                            {project.versions.split(',')[0]}{project.versions.split(',').length > 1 ? ` +${project.versions.split(',').length - 1}` : ''}
                          </span>
                        )}
                        {project.status === 'archived' && (
                          <span className="flex items-center gap-1 rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">
                            <Archive className="h-3 w-3" />
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-text-dim">Updated {formatRelativeDate(project.updatedAt)}</p>
                </Link>

                {/* Context menu trigger */}
                <div className="absolute right-4 top-5">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenMenu(openMenu === project.id ? null : project.id)
                    }}
                    className="rounded p-1 text-text-dim hover:bg-accent hover:text-text-muted"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {openMenu === project.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-surface py-1 shadow-lg">
                        <Link
                          to={`/workspace/${project.id}`}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-muted hover:bg-surface-hover hover:text-text"
                          onClick={() => setOpenMenu(null)}
                        >
                          <Pencil className="h-3 w-3" />
                          Open Project
                        </Link>
                        <Link
                          to={`/project/${project.id}/settings`}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-muted hover:bg-surface-hover hover:text-text"
                          onClick={() => setOpenMenu(null)}
                        >
                          <Settings className="h-3 w-3" />
                          Project Settings
                        </Link>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setOpenMenu(null)
                            setDeleteTarget(project)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete Project
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && search && (
            <div className="mt-12 text-center">
              <p className="text-text-muted">No projects match "{search}"</p>
              <button
                onClick={() => setSearch('')}
                className="mt-2 text-sm font-medium text-primary hover:text-primary-hover"
              >
                Clear search
              </button>
            </div>
          )}

          {projects.length === 0 && (
            <div className="mt-16 flex flex-col items-center text-center">
              <div className="rounded-2xl bg-primary/10 p-4">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-text">No projects yet</h2>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Create your first Minecraft plugin project and let AI help you build it.
              </p>
              <Link
                to="/projects/new"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" />
                Create your first project
              </Link>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text">Delete project?</h3>
            <p className="mt-2 text-sm text-text-muted">
              Are you sure you want to delete <span className="font-medium text-text">{deleteTarget.name}</span>? This action cannot be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors',
                  isDeleting ? 'bg-destructive/70' : 'bg-destructive hover:bg-destructive/90'
                )}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
