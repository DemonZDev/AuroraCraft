import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Link } from 'react-router'
import { useLegalDoc } from '@/hooks/use-legal'
import { Loader2 } from 'lucide-react'

interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

// Slugify heading text into a stable URL anchor. The collision counter makes
// duplicate headings ("## Notes" twice) deterministic — first instance gets
// the bare slug, subsequent ones get `-1`, `-2`, etc.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

function extractToc(markdown: string): TocItem[] {
  const lines = markdown.split('\n')
  const items: TocItem[] = []
  const seen = new Map<string, number>()
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const level = (m[1].length === 2 ? 2 : 3) as 2 | 3
    const text = m[2].replace(/[*_`]/g, '').trim()
    const base = slugify(text)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    items.push({ id, text, level })
  }
  return items
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function LegalDocumentPage({ slug, fallbackTitle }: { slug: 'privacy' | 'terms'; fallbackTitle: string }) {
  const { doc, isLoading, error } = useLegalDoc(slug)
  const toc = useMemo(() => (doc ? extractToc(doc.content) : []), [doc])
  const [activeId, setActiveId] = useState<string | null>(null)

  // Track which heading is in view via IntersectionObserver so the right-rail
  // TOC highlights the current section. Cheap; runs after mount.
  useEffect(() => {
    if (!toc.length) return
    const elements = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)
    if (!elements.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    )
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [toc])

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-text">{fallbackTitle}</h1>
        <p className="mt-4 text-text-muted">
          We couldn’t load this document right now. Please try again in a moment.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="lg:grid lg:grid-cols-[1fr,220px] lg:gap-16">
        {/* ── Main column ── */}
        <article className="mx-auto w-full max-w-[760px]">
          <header className="border-b border-border pb-8">
            <p className="text-xs font-medium uppercase tracking-wider text-text-dim">
              <Link to="/" className="hover:text-text-muted">AuroraCraft</Link>
              <span className="mx-2 text-border">/</span>
              <span>Legal</span>
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text sm:text-4xl">
              {doc.title}
            </h1>
            <p className="mt-3 text-sm text-text-muted">
              Effective {formatDate(doc.effectiveDate)}
              <span className="mx-2 text-border">·</span>
              Version {doc.version}
            </p>
          </header>

          <div className="markdown-content legal-prose mt-10">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h1: ({ children }) => <h1 className="sr-only">{children}</h1>,
                h2: ({ children }) => {
                  const text = stringChildren(children)
                  return <h2 id={slugify(text)}>{children}</h2>
                },
                h3: ({ children }) => {
                  const text = stringChildren(children)
                  return <h3 id={slugify(text)}>{children}</h3>
                },
                a: ({ href, children }) => {
                  const isExternal = href?.startsWith('http')
                  if (isExternal) {
                    return (
                      <a href={href} target="_blank" rel="noreferrer noopener">
                        {children}
                      </a>
                    )
                  }
                  return <a href={href}>{children}</a>
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {doc.content}
            </Markdown>
          </div>

          <footer className="mt-16 border-t border-border pt-6 text-sm text-text-dim">
            <p>
              Last updated {formatDate(doc.updatedAt)}. Questions? Email{' '}
              <a href="mailto:legal@auroracraft.dev" className="text-text-muted hover:text-text">
                legal@auroracraft.dev
              </a>
              .
            </p>
            <p className="mt-3">
              <Link to="/" className="text-text-muted hover:text-text">
                ← Back to home
              </Link>
            </p>
          </footer>
        </article>

        {/* ── Sticky TOC (desktop only) ── */}
        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <nav className="sticky top-20">
              <p className="text-xs font-medium uppercase tracking-wider text-text-dim">
                On this page
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {toc.map((item) => (
                  <li key={item.id} className={item.level === 3 ? 'pl-4' : ''}>
                    <a
                      href={`#${item.id}`}
                      className={
                        activeId === item.id
                          ? 'text-text'
                          : 'text-text-muted hover:text-text'
                      }
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  )
}

// Flatten react-markdown's children to a string for slug generation. The
// children can be a string, an array, or nested elements; we only need the
// visible text.
function stringChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(stringChildren).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return stringChildren((children as { props: { children: React.ReactNode } }).props.children)
  }
  return ''
}
