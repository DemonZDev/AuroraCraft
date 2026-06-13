import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ArrowLeft, Loader2, Save, Eye, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminLegalDoc, useAdminLegalMutations } from '@/hooks/use-legal'

type Tab = 'edit' | 'preview'

export default function AdminLegalEditPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { doc, isLoading, error } = useAdminLegalDoc((slug ?? 'privacy') as 'privacy' | 'terms')
  const { update } = useAdminLegalMutations()

  const [title, setTitle] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [content, setContent] = useState('')
  const [tab, setTab] = useState<Tab>('edit')
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Seed the form once the doc arrives (or when the slug changes).
  useEffect(() => {
    if (!doc) return
    setTitle(doc.title)
    setVersion(doc.version)
    setEffectiveDate(doc.effectiveDate.slice(0, 10)) // YYYY-MM-DD for <input type="date">
    setContent(doc.content)
  }, [doc])

  if (!slug) {
    navigate('/admin/legal')
    return null
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-text">Document not found</h1>
        <Link to="/admin/legal" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to legal documents
        </Link>
      </div>
    )
  }

  const handleSave = () => {
    if (!title.trim() || !content.trim() || !version.trim() || !effectiveDate) {
      toast.error('Title, version, effective date, and content are all required.')
      return
    }
    // Compose the ISO timestamp at midnight UTC for the chosen date — matches
    // what the admin expects ("this doc is effective from this day") and is
    // timezone-independent.
    const isoEffective = new Date(`${effectiveDate}T00:00:00.000Z`).toISOString()
    update.mutate(
      { slug, body: { title: title.trim(), version: version.trim(), content, effectiveDate: isoEffective } },
      {
        onSuccess: () => {
          setSavedAt(new Date())
          toast.success(`${doc.title} saved. Live now.`)
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
      },
    )
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/admin/legal"
            className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-text"
          >
            <ArrowLeft className="h-3 w-3" />
            Legal documents
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-text">
            Edit {doc.title}
          </h1>
          <p className="mt-1 text-xs text-text-dim">
            Public URL:{' '}
            <Link to={`/${slug}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              /{slug}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              Saved {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* ── Metadata row ── */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-text-muted">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} mt-1.5`}
            placeholder="Privacy Policy"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Version</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className={`${inputClass} mt-1.5 font-mono`}
            placeholder="1.0.0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Effective date</label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className={`${inputClass} mt-1.5`}
          />
        </div>
      </div>

      {/* ── Mobile tab switcher (only visible below lg) ── */}
      <div className="mt-6 inline-flex rounded-lg border border-border p-0.5 lg:hidden">
        <button
          onClick={() => setTab('edit')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'edit' ? 'bg-surface-hover text-text' : 'text-text-dim'
          }`}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={() => setTab('preview')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'preview' ? 'bg-surface-hover text-text' : 'text-text-dim'
          }`}
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>
      </div>

      {/* ── Split editor + preview ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={tab === 'edit' ? '' : 'hidden lg:block'}>
          <label className="block text-xs font-medium text-text-muted">Markdown content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="mt-1.5 h-[68vh] w-full resize-none rounded-lg border border-border bg-background p-4 font-mono text-[13px] leading-relaxed text-text outline-none focus:border-primary"
            placeholder="# Privacy Policy&#10;&#10;Write in Markdown. Supports GFM (tables, task lists, strikethrough)."
          />
          <p className="mt-2 text-[11px] text-text-dim">
            {content.length.toLocaleString()} characters · Markdown + GFM ·{' '}
            <a
              href="https://github.github.com/gfm/"
              target="_blank"
              rel="noreferrer"
              className="text-text-muted hover:text-text"
            >
              syntax reference
            </a>
          </p>
        </div>

        <div className={tab === 'preview' ? '' : 'hidden lg:block'}>
          <label className="block text-xs font-medium text-text-muted">Live preview</label>
          <div className="markdown-content legal-prose mt-1.5 h-[68vh] overflow-y-auto rounded-lg border border-border bg-surface p-6">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ href, children }) => {
                  const isExternal = href?.startsWith('http')
                  if (isExternal) {
                    return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
                  }
                  return <a href={href}>{children}</a>
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto"><table>{children}</table></div>
                ),
              }}
            >
              {content || '*(empty — start typing to see the preview)*'}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  )
}
