import { Link } from 'react-router'
import { Loader2, FileText, ArrowRight, Pencil } from 'lucide-react'
import { useAdminLegalDocs } from '@/hooks/use-legal'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AdminLegalListPage() {
  const { docs, isLoading } = useAdminLegalDocs()

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-text-dim">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">Legal documents</h1>
        <p className="mt-2 text-sm text-text-muted">
          Edit the Privacy Policy and Terms of Service published at{' '}
          <Link to="/privacy" className="text-primary hover:underline">/privacy</Link> and{' '}
          <Link to="/terms" className="text-primary hover:underline">/terms</Link>.
          Changes go live the moment you save.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Link
              key={doc.slug}
              to={`/admin/legal/${doc.slug}`}
              className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-border-bright hover:bg-surface-hover"
            >
              <div className="flex min-w-0 items-start gap-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-medium text-text">{doc.title}</h2>
                    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
                      {doc.slug}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Version {doc.version} · Effective {formatDate(doc.effectiveDate)} · Updated {formatDate(doc.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm text-text-dim group-hover:text-text">
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
