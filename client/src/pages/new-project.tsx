import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Square, CheckSquare, Globe, Lock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/use-projects'
import { useUserTokens } from '@/hooks/use-user-tokens'

const steps = ['Project Info', 'Platform', 'Build Config', 'AI Tool', 'Source']

import { SOFTWARE_CATEGORIES } from '@/lib/software-options'

const javaVersions = ['21', '17', '11', '8']
const compilers = [
  { value: 'gradle', label: 'Gradle', description: 'Modern build tool (recommended)' },
  { value: 'maven', label: 'Maven', description: 'Traditional build tool' },
]

function VisibilitySelector({
  form,
  setForm,
}: {
  form: { visibility: 'public' | 'private' }
  setForm: React.Dispatch<React.SetStateAction<any>>
}) {
  const { tokens } = useUserTokens()
  const isPaid = tokens?.tier === 'paid'

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text">Visibility</label>
      <div className="space-y-2">
        <button
          onClick={() => setForm((prev: any) => ({ ...prev, visibility: 'public' }))}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
            form.visibility === 'public'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-border-bright hover:bg-surface-hover'
          )}
        >
          <Globe className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Public</p>
            <p className="text-xs text-text-muted">Anyone can discover and view this project</p>
          </div>
          {form.visibility === 'public' && (
            <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
          )}
        </button>

        <button
          onClick={() => isPaid && setForm((prev: any) => ({ ...prev, visibility: 'private' }))}
          disabled={!isPaid}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
            form.visibility === 'private'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-border-bright hover:bg-surface-hover',
            !isPaid && 'cursor-not-allowed opacity-60'
          )}
        >
          <Lock className="h-4 w-4 shrink-0 text-text-dim" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Private</p>
            <p className="text-xs text-text-muted">Only you can access this project</p>
          </div>
          {!isPaid ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary shrink-0">
              <Zap className="h-3 w-3" />
              Paid
            </span>
          ) : form.visibility === 'private' ? (
            <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
          ) : null}
        </button>
      </div>
    </div>
  )
}

export default function NewProjectPage() {
  const navigate = useNavigate()
  const { createProject, isCreating } = useProjects()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [isPrivateRepo, setIsPrivateRepo] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    logo: '',
    versions: [] as string[],
    software: 'paper',
    language: 'java' as 'java' | 'kotlin',
    javaVersion: '21',
    compilers: ['gradle'] as string[],
    bridge: 'opencode' as 'opencode' | 'kiro',
    source: 'blank' as 'blank' | 'zip' | 'github',
    branch: '',
    commit: '',
    visibility: 'public' as 'public' | 'private',
  })

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file')
      return
    }
    
    if (file.size > 2 * 1024 * 1024) {
      setError('Image size must be less than 2MB')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setForm(prev => ({ ...prev, logo: base64 }))
      setLogoPreview(base64)
      setError(null)
    }
    reader.onerror = () => {
      setError('Failed to read image file')
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setForm({ ...form, logo: '' })
    setLogoPreview(null)
  }

  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!file.name.endsWith('.zip')) {
      setError('Please select a valid ZIP file')
      return
    }
    
    if (file.size > 50 * 1024 * 1024) {
      setError('ZIP file size must be less than 50MB')
      return
    }
    
    setZipFile(file)
    setError(null)
  }

  const removeZip = () => {
    setZipFile(null)
  }

  useEffect(() => {
    fetch('/api/auth/github/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setGithubConnected(data.connected)
        setGithubUsername(data.username)
      })
      .catch(() => {})

    // Restore form state from sessionStorage
    const savedState = sessionStorage.getItem('projectFormState')
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        setForm(parsed.form)
        setStep(parsed.step)
        setLogoPreview(parsed.logoPreview)
        setGithubRepoUrl(parsed.githubRepoUrl)
        setIsPrivateRepo(parsed.isPrivateRepo)
        sessionStorage.removeItem('projectFormState')
      } catch {}
    }
  }, [])

  const addVersion = (version: string) => {
    if (!version.trim()) return
    if (form.versions.includes(version.trim())) return
    setForm({ ...form, versions: [...form.versions, version.trim()] })
  }

  const removeVersion = (version: string) => {
    setForm({ ...form, versions: form.versions.filter(v => v !== version) })
  }

  const canProceed = () => {
    switch (step) {
      case 0: return form.name.trim().length >= 2
      case 1: return !!form.software
      case 2: return form.compilers.length > 0 && !!form.javaVersion
      case 3: return !!form.bridge
      case 4: {
        if (form.source === 'blank') return true
        if (form.source === 'zip') return !!zipFile
        if (form.source === 'github') {
          if (!githubRepoUrl.trim()) return false
          if (isPrivateRepo && !githubConnected) return false
          return true
        }
        return false
      }
      default: return false
    }
  }

  const handleCreate = async () => {
    setError(null)
    try {
      const compilerValue = form.compilers.length === 2 ? 'both' : form.compilers[0] as 'maven' | 'gradle'
      
      if (form.source === 'github' && githubRepoUrl) {
        const response = await fetch('/api/projects/clone', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            logo: form.logo || undefined,
            versions: form.versions.length > 0 ? form.versions.join(',') : undefined,
            software: form.software,
            language: form.language,
            javaVersion: form.javaVersion,
            compiler: compilerValue,
            bridge: form.bridge,
            repoUrl: githubRepoUrl.trim(),
            branch: form.branch.trim() || undefined,
            commit: form.commit.trim() || undefined,
            isPrivate: isPrivateRepo,
            visibility: form.visibility,
          }),
        })
        
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to clone repository')
        }
        
        const project = await response.json()
        navigate(`/workspace/${project.id}`)
      } else if (form.source === 'zip' && zipFile) {
        const formData = new FormData()
        formData.append('name', form.name.trim())
        if (form.description.trim()) formData.append('description', form.description.trim())
        if (form.logo) formData.append('logo', form.logo)
        if (form.versions.length > 0) formData.append('versions', form.versions.join(','))
        formData.append('software', form.software)
        formData.append('language', form.language)
        formData.append('javaVersion', form.javaVersion)
        formData.append('compiler', compilerValue)
        formData.append('bridge', form.bridge)
        formData.append('visibility', form.visibility)
        formData.append('zipFile', zipFile)
        
        const response = await fetch('/api/projects/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to create project')
        }
        
        const project = await response.json()
        navigate(`/workspace/${project.id}`)
      } else {
        const project = await createProject({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          logo: form.logo || undefined,
          versions: form.versions.length > 0 ? form.versions.join(',') : undefined,
          software: form.software,
          language: form.language,
          javaVersion: form.javaVersion,
          compiler: compilerValue,
          bridge: form.bridge,
          visibility: form.visibility,
        })
        navigate(`/workspace/${project.id}`)
      }
    } catch (err: unknown) {
      const message = err !== null && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'Failed to create project'
      setError(message)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <button
        onClick={() => navigate('/dashboard')}
        className="mb-6 inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </button>

      <h1 className="text-2xl font-bold tracking-tight text-text">Create New Project</h1>
      <p className="mt-1 text-sm text-text-muted">Set up your Minecraft plugin project</p>

      {/* Step indicators */}
      <div className="mt-8 flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                i < step
                  ? 'bg-primary text-primary-foreground'
                  : i === step
                    ? 'border-2 border-primary text-primary'
                    : 'border border-border text-text-dim'
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              'hidden text-xs sm:block',
              i === step ? 'text-text' : 'text-text-dim'
            )}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn(
                'h-px flex-1',
                i < step ? 'bg-primary' : 'bg-border'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Project Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="MyAwesomePlugin"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Description (Optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="A brief description of your plugin..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Project Logo (Optional)</label>
              {logoPreview ? (
                <div className="flex items-center gap-4">
                  <img src={logoPreview} alt="Logo preview" className="h-20 w-20 rounded-lg border border-border object-cover" />
                  <button
                    onClick={removeLogo}
                    className="text-sm text-destructive hover:text-destructive/80"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface px-4 py-8 text-sm text-text-muted transition-colors hover:border-primary hover:bg-surface-hover"
                  >
                    <div className="text-center">
                      <p>Click to upload image</p>
                      <p className="mt-1 text-xs text-text-dim">PNG, JPG, GIF up to 2MB</p>
                    </div>
                  </label>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Project Type</label>
              <div className="rounded-lg border border-primary bg-primary/5 px-4 py-3">
                <p className="text-sm font-medium text-text">Minecraft Plugin</p>
                <p className="text-xs text-text-muted">Server-side plugin for Minecraft Java Edition</p>
              </div>
            </div>

            {/* Visibility */}
            <VisibilitySelector form={form} setForm={setForm} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="mb-3 block text-sm font-medium text-text">Server Software</label>
              <p className="mb-3 text-xs text-text-muted">Choose the platform your plugin targets — organized by server type</p>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {SOFTWARE_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="space-y-2">
                    <div className={cn('rounded-lg border px-3 py-2', cat.color)}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-text">{cat.label}</p>
                      <p className="text-[10px] text-text-muted">{cat.description}</p>
                    </div>
                    <div className="space-y-1.5">
                      {cat.options.map((sw) => (
                        <button
                          key={sw.value}
                          onClick={() => setForm({ ...form, software: sw.value })}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                            form.software === sw.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-border-bright hover:bg-surface-hover'
                          )}
                        >
                          <div className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                            form.software === sw.value
                              ? 'border-primary bg-primary'
                              : 'border-border'
                          )}>
                            {form.software === sw.value && <div className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text">{sw.label}</p>
                            <p className="text-xs text-text-muted">{sw.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Minecraft Versions (Optional)</label>
              <p className="mb-2 text-xs text-text-muted">Add supported versions (1.8 - 1.21.x)</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g., 1.20.1"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addVersion(e.currentTarget.value)
                      e.currentTarget.value = ''
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement
                    addVersion(input.value)
                    input.value = ''
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover"
                >
                  Add
                </button>
              </div>
              {form.versions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.versions.map((v) => (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
                    >
                      {v}
                      <button
                        onClick={() => removeVersion(v)}
                        className="text-text-dim hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="mb-3 block text-sm font-medium text-text">Language</label>
              <div className="flex gap-3">
                {(['java', 'kotlin'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setForm({ ...form, language: lang })}
                    className={cn(
                      'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                      form.language === lang
                        ? 'border-primary bg-primary/5 text-text'
                        : 'border-border text-text-muted hover:border-border-bright'
                    )}
                  >
                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Java Version</label>
              <select
                value={form.javaVersion}
                onChange={(e) => setForm({ ...form, javaVersion: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {javaVersions.map((v) => (
                  <option key={v} value={v}>Java {v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-3 block text-sm font-medium text-text">Build Tool(s)</label>
              <p className="mb-2 text-xs text-text-muted">Select one or both build tools</p>
              <div className="space-y-2">
                {compilers.map((c) => {
                  const isSelected = form.compilers.includes(c.value)
                  return (
                    <button
                      key={c.value}
                      onClick={() => {
                        const next = isSelected
                          ? form.compilers.filter(v => v !== c.value)
                          : [...form.compilers, c.value]
                        if (next.length > 0) setForm({ ...form, compilers: next })
                      }}
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
                      <div>
                        <p className="text-sm font-medium text-text">{c.label}</p>
                        <p className="text-xs text-text-muted">{c.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="mb-3 block text-sm font-medium text-text">AI Coding Tool</label>
              <p className="mb-4 text-xs text-text-muted">Choose the AI tool for this project. This cannot be changed later as each tool maintains separate conversation memory.</p>
              <div className="space-y-3">
                <button
                  onClick={() => setForm({ ...form, bridge: 'opencode' })}
                  className={cn(
                    'flex w-full flex-col gap-2 rounded-lg border px-4 py-4 text-left transition-colors',
                    form.bridge === 'opencode'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border-bright hover:bg-surface-hover'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      form.bridge === 'opencode'
                        ? 'border-primary bg-primary'
                        : 'border-border'
                    )}>
                      {form.bridge === 'opencode' && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">OpenCode</p>
                      <p className="text-xs text-text-muted">Free AI coding assistant</p>
                    </div>
                  </div>
                  <div className="ml-7 space-y-1">
                    <p className="text-xs font-medium text-text-muted">Available Models:</p>
                    <div className="space-y-1.5">
                      <div className="rounded-md bg-surface px-3 py-1.5">
                        <p className="text-xs font-medium text-text">DeepSeek V4 Flash</p>
                        <p className="text-[10px] text-text-dim">Free — fast coding with strong reasoning</p>
                      </div>
                      <div className="rounded-md bg-surface px-3 py-1.5">
                        <p className="text-xs font-medium text-text">Nemotron 3 Super</p>
                        <p className="text-[10px] text-text-dim">Free — NVIDIA optimized for coding</p>
                      </div>
                      <div className="rounded-md bg-surface px-3 py-1.5">
                        <p className="text-xs font-medium text-text">Big Pickle</p>
                        <p className="text-[10px] text-text-dim">Free — general-purpose AI model</p>
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setForm({ ...form, bridge: 'kiro' })}
                  className={cn(
                    'flex w-full flex-col gap-2 rounded-lg border px-4 py-4 text-left transition-colors',
                    form.bridge === 'kiro'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border-bright hover:bg-surface-hover'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      form.bridge === 'kiro'
                        ? 'border-primary bg-primary'
                        : 'border-border'
                    )}>
                      {form.bridge === 'kiro' && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">Kiro CLI</p>
                      <p className="text-xs text-text-muted">Advanced AI with Claude Sonnet</p>
                    </div>
                  </div>
                  <div className="ml-7 space-y-1">
                    <p className="text-xs font-medium text-text-muted">Available Model:</p>
                    <div className="rounded-md bg-surface px-3 py-2">
                      <p className="text-xs font-medium text-text">Claude Sonnet 4.5</p>
                      <p className="text-[10px] text-text-dim">Strong agentic coding with extended autonomous operation</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <label className="mb-3 block text-sm font-medium text-text">Project Source</label>
            <div className="space-y-2">
              {[
                { value: 'blank' as const, label: 'Blank Project', description: 'Start from scratch with a clean template' },
                { value: 'zip' as const, label: 'Upload ZIP', description: 'Import from a ZIP archive' },
                { value: 'github' as const, label: 'GitHub Repository', description: 'Clone from a GitHub repository' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm({ ...form, source: opt.value })}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                    form.source === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border-bright hover:bg-surface-hover'
                  )}
                >
                  <div className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    form.source === opt.value
                      ? 'border-primary bg-primary'
                      : 'border-border'
                  )}>
                    {form.source === opt.value && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">{opt.label}</p>
                    <p className="text-xs text-text-muted">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
            
            {form.source === 'zip' && (
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-text">Upload ZIP File</label>
                {zipFile ? (
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text">{zipFile.name}</p>
                      <p className="text-xs text-text-muted">{(zipFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      onClick={removeZip}
                      className="text-sm text-destructive hover:text-destructive/80"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-background px-4 py-8 transition-colors hover:border-primary hover:bg-surface">
                    <div className="text-sm text-text-muted">Click to upload or drag and drop</div>
                    <div className="text-xs text-text-dim">ZIP file (max 50MB)</div>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleZipUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}

            {form.source === 'github' && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Repository URL</label>
                  <input
                    type="text"
                    value={githubRepoUrl}
                    onChange={(e) => setGithubRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Branch</label>
                  <input
                    type="text"
                    value={form.branch || ''}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="main"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-text-muted">Leave empty to use default branch</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Commit Hash (Optional)</label>
                  <input
                    type="text"
                    value={form.commit || ''}
                    onChange={(e) => setForm({ ...form, commit: e.target.value })}
                    placeholder="abc123def456..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-text-muted">Clone specific commit instead of latest</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivateRepo(!isPrivateRepo)}
                    className="flex items-center gap-2"
                  >
                    {isPrivateRepo ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-border" />
                    )}
                    <span className="text-sm text-text">This is a private repository</span>
                  </button>
                </div>

                {isPrivateRepo && (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    {githubConnected ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-text">Connected as @{githubUsername}</p>
                          <p className="text-xs text-text-muted">You can clone private repositories</p>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch('/api/auth/github/disconnect', { method: 'POST', credentials: 'include' })
                            setGithubConnected(false)
                            setGithubUsername(null)
                          }}
                          className="text-sm text-destructive hover:text-destructive/80"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-text mb-2">Connect GitHub Account</p>
                        <p className="text-xs text-text-muted mb-3">To clone private repositories, you need to connect your GitHub account</p>
                        <button
                          onClick={() => {
                            // Save form state before OAuth
                            sessionStorage.setItem('projectFormState', JSON.stringify({
                              form,
                              step,
                              logoPreview,
                              githubRepoUrl,
                              isPrivateRepo,
                            }))

                            const width = 600
                            const height = 700
                            const left = window.screen.width / 2 - width / 2
                            const top = window.screen.height / 2 - height / 2
                            const returnTo = encodeURIComponent('/projects/new')
                            window.open(
                              `/api/auth/github/connect?returnTo=${returnTo}`,
                              'github-oauth',
                              `width=${width},height=${height},left=${left},top=${top}`
                            )
                            const checkConnection = setInterval(async () => {
                              const res = await fetch('/api/auth/github/status', { credentials: 'include' })
                              const data = await res.json()
                              if (data.connected) {
                                setGithubConnected(true)
                                setGithubUsername(data.username)
                                clearInterval(checkConnection)
                              }
                            }, 1000)
                          }}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Connect GitHub
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={!canProceed() || isCreating}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </button>
        )}
      </div>
    </div>
  )
}
