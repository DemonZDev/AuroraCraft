import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import {
  ArrowLeft,
  LayoutDashboard,
  BarChart3,
  Settings,
  Loader2,
  Save,
  MessageSquare,
  Bot,
  FileCode,
  Zap,
  Calendar,
  Globe,
  Lock,
  Trash2,
  Blocks,
  ExternalLink,
  Square,
  CheckSquare,
} from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProject, useProjectStats } from '@/hooks/use-projects'
import { useUserTokens } from '@/hooks/use-user-tokens'
import { CustomSelect } from '@/components/ui/custom-select'
import type { UpdateProjectInput } from '@/types'

type TabId = 'overview' | 'stats' | 'compiler' | 'settings'

const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'compiler', label: 'Compiler', icon: Blocks },
  { id: 'settings', label: 'Settings', icon: Settings },
]

import { SOFTWARE_CATEGORIES, getSoftwareCategory } from '@/lib/software-options'

const javaVersions = [
  { value: '21', label: 'Java 21', description: 'Latest LTS — Virtual threads, pattern matching, sequenced collections' },
  { value: '17', label: 'Java 17', description: 'Previous LTS — Sealed classes, pattern matching for switch' },
  { value: '11', label: 'Java 11', description: 'Older LTS — HTTP client, var keyword, new String methods' },
  { value: '8', label: 'Java 8', description: 'Legacy — Lambda expressions, streams API, Optional' },
]

interface OverviewForm {
  name: string
  description: string
  logo: string
  versions: string
  software: string
}

export default function ProjectMenuPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { project, isLoading, updateProject, isUpdating, deleteProject, isDeleting } = useProject(projectId ?? '')
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-text-muted">Project not found</p>
        <Link to="/dashboard" className="text-sm font-medium text-primary hover:text-primary-hover">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-text">{project.name}</span>
          </div>
        </div>
        <Link
          to={`/workspace/${projectId}`}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          Open Workspace
          <ExternalLink className="h-3 w-3" />
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (desktop) */}
        {!isMobile && (
          <aside className="w-56 shrink-0 border-r border-border bg-surface">
            <nav className="flex flex-col gap-1 p-3">
              <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                Project Menu
              </p>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text'
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Horizontal tab bar (mobile) */}
          {isMobile && (
            <div className="flex shrink-0 overflow-x-auto border-b border-border bg-surface px-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 px-4 py-3 text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-text-muted hover:text-text'
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
          <div className={cn('mx-auto max-w-3xl', isMobile ? 'px-4 py-6' : 'px-6 py-8')}>
            {activeTab === 'overview' && (
              <OverviewTab
                project={project}
                updateProject={updateProject}
                isUpdating={isUpdating}
              />
            )}
            {activeTab === 'stats' && (
              <StatsTab projectId={projectId ?? ''} />
            )}
            {activeTab === 'compiler' && (
              <CompilerTab
                project={project}
                updateProject={updateProject}
                isUpdating={isUpdating}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsTab
                project={project}
                updateProject={updateProject}
                isUpdating={isUpdating}
                deleteProject={deleteProject}
                isDeleting={isDeleting}
                onDeleted={() => navigate('/dashboard')}
              />
            )}
          </div>
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Overview Tab ────────────────────────────────────────────────────

function OverviewTab({
  project,
  updateProject,
  isUpdating,
}: {
  project: NonNullable<ReturnType<typeof useProject>['project']>
  updateProject: (data: UpdateProjectInput) => Promise<unknown>
  isUpdating: boolean
}) {
  const [form, setForm] = useState<OverviewForm>({
    name: project.name,
    description: project.description ?? '',
    logo: project.logo ?? '',
    versions: project.versions ?? '',
    software: project.software,
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(project.logo)

  const [errors, setErrors] = useState<Partial<Record<keyof OverviewForm, string>>>({})

  useEffect(() => {
    setForm({
      name: project.name,
      description: project.description ?? '',
      logo: project.logo ?? '',
      versions: project.versions ?? '',
      software: project.software,
    })
    setLogoPreview(project.logo)
  }, [project])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file')
      return
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setForm(prev => ({ ...prev, logo: base64 }))
      setLogoPreview(base64)
    }
    reader.onerror = () => {
      toast.error('Failed to read image file')
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setForm({ ...form, logo: '' })
    setLogoPreview(null)
  }

  const isFormValid = form.name.trim().length >= 2 && form.name.trim().length <= 128 && form.description.length <= 1000

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof OverviewForm, string>> = {}
    if (form.name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters'
    if (form.name.trim().length > 128) newErrors.name = 'Name must be 128 characters or fewer'
    if (form.description.length > 1000) newErrors.description = 'Description must be 1000 characters or fewer'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const hasChanges =
    form.name !== project.name ||
    form.description !== (project.description ?? '') ||
    form.logo !== (project.logo ?? '') ||
    form.versions !== (project.versions ?? '') ||
    form.software !== project.software

  const handleSave = async () => {
    if (!validate()) return
    try {
      await updateProject({
        name: form.name.trim(),
        description: form.description.trim() || null,
        logo: form.logo || null,
        versions: form.versions.trim() || null,
        software: form.software,
      })
      toast.success('Project updated successfully')
    } catch {
      toast.error('Failed to update project')
    }
  }

  const updateField = <K extends keyof OverviewForm>(key: K, value: OverviewForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Overview</h1>
          <p className="mt-1 text-sm text-text-muted">View and edit your project configuration</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || !isFormValid || isUpdating}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            hasChanges && isFormValid
              ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
              : 'bg-surface text-text-dim cursor-not-allowed'
          )}
        >
          <Save className="h-4 w-4" />
          {isUpdating ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="mt-8 space-y-6">
        {/* Project Name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Project Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className={cn(
              'w-full rounded-lg border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1',
              errors.name
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-primary'
            )}
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={3}
            className={cn(
              'w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1',
              errors.description
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-primary focus:ring-primary'
            )}
            placeholder="A short description of your project..."
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
            <p className="ml-auto text-xs text-text-dim">{form.description.length}/1000</p>
          </div>
        </div>

        {/* Logo */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Project Logo</label>
          {logoPreview ? (
            <div className="flex items-center gap-4">
              <img src={logoPreview} alt="Logo" className="h-20 w-20 rounded-lg border border-border object-cover" />
              <button
                onClick={removeLogo}
                className="text-sm text-destructive hover:text-destructive/80"
              >
                Remove Logo
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload-overview"
              />
              <label
                htmlFor="logo-upload-overview"
                className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface px-4 py-8 text-sm text-text-muted transition-colors hover:border-primary hover:bg-surface-hover"
              >
                <div className="text-center">
                  <p>Click to upload logo</p>
                  <p className="mt-1 text-xs text-text-dim">PNG, JPG, GIF up to 2MB</p>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Versions */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Supported Versions</label>
          <input
            type="text"
            value={form.versions}
            onChange={(e) => updateField('versions', e.target.value)}
            placeholder="e.g., 1.20.1, 1.19.4, 1.18.2"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-text-dim">Comma-separated list of Minecraft versions</p>
        </div>

        {/* Project Type (read-only) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Project Type</label>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <p className="text-sm font-medium text-text">Minecraft Plugin</p>
            <p className="text-xs text-text-dim">Server-side plugin for Minecraft Java Edition</p>
          </div>
        </div>

        {/* Software */}
        <div className="relative">
          <CustomSelect
            label="Server Software"
            value={form.software}
            onChange={(v) => updateField('software', v)}
            options={SOFTWARE_CATEGORIES.filter((cat) =>
              cat.options.some((opt) => opt.value === project.software)
            ).map((cat) => ({
              label: cat.label,
              options: cat.options.map((sw) => ({
                value: sw.value,
                label: sw.label,
                description: sw.description,
              })),
            }))}
            placeholder="Select server software"
          />
          <p className="mt-1 text-xs text-text-dim">
            You can only switch between servers in the same category. Created as a{' '}
            <span className="text-text-muted font-medium">
              {getSoftwareCategory(project.software)?.label ?? 'Game Server'}
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Stats Tab ───────────────────────────────────────────────────────

function StatsTab({ projectId }: { projectId: string }) {
  const { stats, isLoading } = useProjectStats(projectId)

  if (isLoading) {
    return (
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text">Stats</h1>
        <p className="mt-1 text-sm text-text-muted">Project activity and usage statistics</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-5">
              <div className="h-4 w-24 rounded bg-border" />
              <div className="mt-3 h-8 w-16 rounded bg-border" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    { label: 'User Messages', value: stats?.userMessages ?? 0, icon: MessageSquare, color: 'text-primary' },
    { label: 'AI Messages', value: stats?.aiMessages ?? 0, icon: Bot, color: 'text-emerald-400' },
    { label: 'Files', value: stats?.files ?? 0, icon: FileCode, color: 'text-amber-400' },
    { label: 'Tokens Used', value: stats?.tokensUsed ?? 0, icon: Zap, color: 'text-violet-400', placeholder: true },
    {
      label: 'Created',
      value: stats?.createdAt
        ? new Date(stats.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '—',
      icon: Calendar,
      color: 'text-text-dim',
      isDate: true,
    },
  ]

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight text-text">Stats</h1>
      <p className="mt-1 text-sm text-text-muted">Project activity and usage statistics</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">{card.label}</p>
              <card.icon className={cn('h-4 w-4', card.color)} />
            </div>
            {card.isDate ? (
              <p className="mt-2 text-lg font-semibold text-text">{card.value}</p>
            ) : (
              <div className="mt-2 flex items-baseline gap-1">
                <p className="text-2xl font-bold text-text">{card.value.toLocaleString()}</p>
                {card.placeholder && (
                  <span className="text-xs text-text-dim">(placeholder)</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Compiler Tab ────────────────────────────────────────────────────

function parseCompilers(compiler: string): string[] {
  if (compiler === 'both') return ['gradle', 'maven']
  return [compiler]
}

function compilersToValue(arr: string[]): 'gradle' | 'maven' | 'both' {
  if (arr.length === 2) return 'both'
  return arr[0] as 'gradle' | 'maven'
}

function CompilerTab({
  project,
  updateProject,
  isUpdating,
}: {
  project: NonNullable<ReturnType<typeof useProject>['project']>
  updateProject: (data: UpdateProjectInput) => Promise<unknown>
  isUpdating: boolean
}) {
  const [form, setForm] = useState({
    language: project.language,
    javaVersion: project.javaVersion,
    compilers: parseCompilers(project.compiler),
  })

  useEffect(() => {
    setForm({
      language: project.language,
      javaVersion: project.javaVersion,
      compilers: parseCompilers(project.compiler),
    })
  }, [project])

  const hasChanges =
    form.javaVersion !== project.javaVersion ||
    compilersToValue(form.compilers) !== project.compiler

  const handleSave = async () => {
    try {
      await updateProject({
        javaVersion: form.javaVersion,
        compiler: compilersToValue(form.compilers),
      })
      toast.success('Compiler settings updated')
    } catch {
      toast.error('Failed to update compiler settings')
    }
  }

  const toggleCompiler = (value: string) => {
    const next = form.compilers.includes(value)
      ? form.compilers.filter(v => v !== value)
      : [...form.compilers, value]
    if (next.length > 0) setForm({ ...form, compilers: next })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Compiler</h1>
          <p className="mt-1 text-sm text-text-muted">Configure language and build settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isUpdating}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            hasChanges
              ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
              : 'bg-surface text-text-dim cursor-not-allowed'
          )}
        >
          <Save className="h-4 w-4" />
          {isUpdating ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="mt-8 space-y-6">
        {/* Language — locked at project creation */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Language</label>
          <div className="flex gap-2">
            {(['java', 'kotlin'] as const).map((lang) => (
              <div
                key={lang}
                className={cn(
                  'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors select-none',
                  form.language === lang
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-muted opacity-50'
                )}
              >
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-text-dim">Language is locked when the project is created and cannot be changed later.</p>
        </div>

        {/* Java Version */}
        <div className="relative">
          <CustomSelect
            label="Java Version"
            value={form.javaVersion}
            onChange={(v) => setForm({ ...form, javaVersion: v })}
            options={javaVersions}
            placeholder="Select Java version"
          />
        </div>

        {/* Build Tool(s) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Build Tool(s)</label>
          <p className="mb-2 text-xs text-text-muted">Select one or both build tools</p>
          <div className="space-y-2">
            {(['gradle', 'maven'] as const).map((c) => {
              const isSelected = form.compilers.includes(c)
              return (
                <button
                  key={c}
                  onClick={() => toggleCompiler(c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border-bright hover:bg-surface-hover'
                  )}
                >
                  {isSelected ? (
                    <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 shrink-0 text-border" />
                  )}
                  <span className="text-sm font-medium text-text">
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Settings Tab ────────────────────────────────────────────────────

function SettingsTab({
  project,
  updateProject,
  isUpdating,
  deleteProject,
  isDeleting,
  onDeleted,
}: {
  project: NonNullable<ReturnType<typeof useProject>['project']>
  updateProject: (data: UpdateProjectInput) => Promise<unknown>
  isUpdating: boolean
  deleteProject: () => Promise<unknown>
  isDeleting: boolean
  onDeleted: () => void
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const { tokens } = useUserTokens()
  const isPaid = tokens?.tier === 'paid'

  const toggleVisibility = async () => {
    const newVisibility = project.visibility === 'public' ? 'private' : 'public'
    if (newVisibility === 'private' && !isPaid) {
      toast.error('Private projects require a paid subscription. Upgrade to enable private projects.')
      return
    }
    try {
      await updateProject({ visibility: newVisibility })
      toast.success(`Project is now ${newVisibility}`)
    } catch {
      toast.error('Failed to update visibility')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteProject()
      toast.success('Project deleted')
      onDeleted()
    } catch {
      toast.error('Failed to delete project')
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight text-text">Settings</h1>
      <p className="mt-1 text-sm text-text-muted">Manage project visibility and other settings</p>

      {/* Visibility */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-text">Visibility</h2>
        <p className="mt-1 text-xs text-text-muted">
          Control who can see your project. Public projects are visible to all users.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {project.visibility === 'public' ? (
              <Globe className="h-5 w-5 text-primary" />
            ) : (
              <Lock className="h-5 w-5 text-text-dim" />
            )}
            <div>
              <p className="text-sm font-medium text-text">
                {project.visibility === 'public' ? 'Public' : 'Private'}
              </p>
              <p className="text-xs text-text-dim">
                {project.visibility === 'public'
                  ? 'Anyone can view this project'
                  : 'Only you can access this project'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleVisibility}
            disabled={isUpdating}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
              project.visibility === 'public' ? 'bg-primary' : 'bg-border-bright'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                project.visibility === 'public' ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
        <p className="mt-1 text-xs text-text-muted">
          Irreversible actions that permanently affect your project.
        </p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-destructive/20 bg-background px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text">Delete this project</p>
            <p className="text-xs text-text-dim">
              Once deleted, this project and all its data cannot be recovered.
            </p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="shrink-0 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Delete Project
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-text">Delete project?</h3>
            </div>
            <p className="mt-3 text-sm text-text-muted">
              This will permanently delete{' '}
              <span className="font-medium text-text">{project.name}</span> and all associated
              data, including files, chat history, and sessions. This action cannot be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
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
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
