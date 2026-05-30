import { Loader2 } from 'lucide-react'
import { useAdminProjects } from '@/hooks/use-admin'
import { SOFTWARE_LABELS } from '@/lib/software-options'

export default function AdminProjectsPage() {
  const { projects, isLoading } = useAdminProjects()

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text">Projects</h1>
      <p className="mt-1 text-sm text-text-muted">View and manage all projects on the platform</p>

      {isLoading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-dim" />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-6 text-center py-12">
          <p className="text-sm text-text-dim">No projects found</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-medium text-text-muted">Name</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Status</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Software</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium text-text">{project.name}</td>
                  <td className="px-4 py-3 text-text-muted">{project.ownerUsername ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      project.status === 'active'
                        ? 'bg-success/10 text-success'
                        : 'bg-accent text-text-muted'
                    }`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{SOFTWARE_LABELS[project.software] ?? project.software}</td>
                  <td className="px-4 py-3 text-text-dim">
                    {new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
