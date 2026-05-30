import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { Search, Globe, Filter, User, Heart, Eye } from 'lucide-react'
import { useCommunityProjects } from '@/hooks/use-community'
import { SOFTWARE_LABELS } from '@/lib/software-options'
import type { CommunityProject } from '@/types'

import { SOFTWARE_CATEGORIES } from '@/lib/software-options'

const softwareOptions: { value: string; label: string; disabled?: boolean }[] = [
  { value: '', label: 'All Software' },
  ...SOFTWARE_CATEGORIES.flatMap((cat) => [
    { value: `__cat_${cat.id}`, label: `— ${cat.label}`, disabled: true as const },
    ...cat.options.map((o) => ({ value: o.value, label: `  ${o.label}` })),
  ]),
]

const languageOptions = [
  { value: '', label: 'All Languages' },
  { value: 'java', label: 'Java' },
  { value: 'kotlin', label: 'Kotlin' },
]

const sortOptions = [
  { value: 'smart', label: 'Smart Mix' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'likes', label: 'Most Liked' },
  { value: 'views', label: 'Most Viewed' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function ProjectCard({ project }: { project: CommunityProject }) {
  return (
    <Link
      to={`/community/${project.id}`}
      className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-border-bright hover:bg-surface-hover hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="flex items-start gap-3">
        {project.logo && (
          <img 
            src={project.logo} 
            alt={`${project.name} logo`} 
            className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-text group-hover:text-primary transition-colors">
            {project.name}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-text-dim">
            <User className="h-3 w-3" />
            <span>@{project.ownerUsername}</span>
          </div>
        </div>
      </div>

      {project.description && (
        <p className="mt-2.5 line-clamp-2 text-xs text-text-dim leading-relaxed">
          {project.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
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
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-text-dim">
        <span className="inline-flex items-center gap-1">
          <Heart className="h-3 w-3" />
          {project.likes ?? 0}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {project.views ?? 0}
        </span>
        <span className="ml-auto">{formatDate(project.createdAt)}</span>
      </div>
    </Link>
  )
}

export default function CommunityPage() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [software, setSoftware] = useState('')
  const [language, setLanguage] = useState('')
  const [sort, setSort] = useState<'smart' | 'popular' | 'likes' | 'views' | 'newest' | 'oldest'>('smart')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { projects, isLoading } = useCommunityProjects({
    search: debouncedSearch || undefined,
    software: software || undefined,
    language: language || undefined,
    sort,
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {/* Hero */}
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">Community</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Community{' '}
          <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            Creations
          </span>
        </h1>
        <p className="mt-3 text-text-muted">
          Discover and fork Minecraft plugins built by the AuroraCraft community
        </p>
      </div>

      {/* Filters */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-text-dim hidden sm:block" />
          <select
            value={software}
            onChange={(e) => setSoftware(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {softwareOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-5">
              <div className="h-5 w-32 rounded bg-border" />
              <div className="mt-2 h-3 w-20 rounded bg-border" />
              <div className="mt-3 h-3 w-full rounded bg-border" />
              <div className="mt-1.5 h-3 w-2/3 rounded bg-border" />
              <div className="mt-4 flex gap-2">
                <div className="h-5 w-14 rounded bg-border" />
                <div className="h-5 w-14 rounded bg-border" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length > 0 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="mt-20 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-primary/10 p-4">
            <Globe className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-text">
            {debouncedSearch || software || language
              ? 'No projects match your filters'
              : 'No community projects yet'}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            {debouncedSearch || software || language
              ? 'Try adjusting your search or filters to find what you\'re looking for.'
              : 'Be the first! Make your project public from Project Settings to share it with the community.'}
          </p>
          {(debouncedSearch || software || language) && (
            <button
              onClick={() => { setSearchInput(''); setSoftware(''); setLanguage('') }}
              className="mt-4 text-sm font-medium text-primary hover:text-primary-hover"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
