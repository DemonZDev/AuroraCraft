import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Loader2, ShieldAlert, FolderTree } from 'lucide-react'
import { useAdminProject } from '@/hooks/use-admin'
import { useProjectFiles, useFileOperations } from '@/hooks/use-agent'
import { FileTreePanel, EditorPanel } from '@/components/workspace/file-panels'

export default function AdminWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const id = projectId ?? ''
  const { project, isLoading } = useAdminProject(id)
  const { files, isLoading: filesLoading, refetch } = useProjectFiles(id)
  const fileOps = useFileOperations(id)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/admin/projects" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-text">
            <FolderTree className="h-5 w-5 text-primary" />
            {isLoading && !project ? 'Loading…' : project?.name ?? 'Project'}
            {project?.suspended && (
              <span className="rounded bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">suspended</span>
            )}
          </h1>
          {project && (
            <p className="mt-0.5 text-sm text-text-muted">
              Owned by <span className="font-medium text-text">{project.ownerUsername ?? '—'}</span>
              {project.ownerSuspended && <span className="ml-2 text-warning">(owner suspended)</span>}
              <span className="ml-2 text-text-dim">· {project.software} · {project.language} · {project.compiler}</span>
            </p>
          )}
        </div>
        <div className="hidden items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 sm:flex">
          <ShieldAlert className="h-3.5 w-3.5" />
          Admin edit — changes write directly to the user's workspace
        </div>
      </div>

      {!id ? null : isLoading && !project ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-text-dim" />
        </div>
      ) : !project?.linkId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-dim">
          This project has no workspace directory.
        </div>
      ) : (
        <div className="flex h-[calc(100vh-14rem)] min-h-[420px] overflow-hidden rounded-xl border border-border">
          <aside className="w-56 shrink-0 border-r border-border">
            <FileTreePanel
              files={files}
              filesLoading={filesLoading}
              refetchFiles={refetch}
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              fileOps={fileOps}
            />
          </aside>
          <main className="min-w-0 flex-1">
            <EditorPanel
              projectId={id}
              selectedFile={selectedFile}
              fileOps={fileOps}
              onExitGraphView={() => setSelectedFile(null)}
            />
          </main>
        </div>
      )}
    </div>
  )
}
