import { useState, useCallback, useEffect, useRef } from 'react'
import { SOFTWARE_LABELS } from '@/lib/software-options'
import { Link, useParams, useNavigate } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Editor from '@monaco-editor/react'
import {
  ArrowLeft,
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  Bot,
  User,
  MessageSquare,
  FolderTree,
  Code2,
  GitFork,
  Download,
  Archive,
  Blocks,
  MessageCircle,
  Heart,
  Eye,
  Lock,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  useCommunityProject,
  useCommunityProjectFiles,
  useCommunityFileContent,
  useCommunityMessages,
  useForkProject,
  useLikeProject,
  useViewProject,
  useProjectAccess,
} from '@/hooks/use-community'
import type { FileTreeEntry, AgentMessage } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────

function getLanguageFromPath(filePath: string): string {
  if (filePath.endsWith('.gradle.kts')) return 'kotlin'
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    java: 'java', kt: 'kotlin', kts: 'kotlin',
    js: 'javascript', jsx: 'javascriptreact', ts: 'typescript', tsx: 'typescriptreact',
    json: 'json', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', txt: 'plaintext',
    yaml: 'yaml', yml: 'yaml',
    gradle: 'groovy',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', graphql: 'graphql',
    properties: 'ini', toml: 'ini', cfg: 'ini',
    dockerfile: 'dockerfile',
    c: 'c', cpp: 'cpp', h: 'cpp', hpp: 'cpp',
  }
  return map[ext] ?? 'plaintext'
}

function MarkdownContent({ content }: { content: string }) {
  if (!content) return null
  return (
    <div className="markdown-content text-sm">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </Markdown>
    </div>
  )
}

// ── Read-only file tree ──────────────────────────────────────────────

function ReadOnlyFileTreeNode({ entry, depth = 0, onFileSelect, selectedFile }: {
  entry: FileTreeEntry
  depth?: number
  onFileSelect: (path: string) => void
  selectedFile: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const pl = depth * 12 + 8

  if (entry.type === 'directory') {
    const DirIcon = expanded ? FolderOpen : Folder
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
          style={{ paddingLeft: pl }}
        >
          <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-90')} />
          <DirIcon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children?.map((child) => (
          <ReadOnlyFileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    )
  }

  const isActive = selectedFile === entry.path

  return (
    <button
      type="button"
      onClick={() => onFileSelect(entry.path)}
      className={cn(
        'flex w-full items-center gap-1.5 py-1 text-xs hover:bg-surface-hover hover:text-text-muted',
        isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-dim'
      )}
      style={{ paddingLeft: pl + 15 }}
      title={entry.path}
    >
      <File className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </button>
  )
}

function FileTreePanel({ files, isLoading, onFileSelect, selectedFile }: {
  files: FileTreeEntry[]
  isLoading: boolean
  onFileSelect: (path: string) => void
  selectedFile: string | null
}) {
  return (
    <div className="h-full overflow-y-auto bg-surface py-2">
      <div className="mb-2 px-3">
        <p className="text-xs font-medium uppercase tracking-wider text-text-dim">Files</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-text-dim" />
        </div>
      ) : files.length > 0 ? (
        <div>
          {files.map((entry) => (
            <ReadOnlyFileTreeNode
              key={entry.path}
              entry={entry}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <FolderOpen className="h-8 w-8 text-text-dim/50" />
          <p className="mt-3 text-xs text-text-dim">No files</p>
        </div>
      )}
    </div>
  )
}

// ── Read-only editor panel ───────────────────────────────────────────

function ReadOnlyEditorPanel({ projectId, selectedFile, canViewEditor }: {
  projectId: string
  selectedFile: string | null
  canViewEditor: boolean
}) {
  const { content, isLoading, error } = useCommunityFileContent(projectId, selectedFile)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center border-b border-border bg-surface px-4">
        <div className="flex min-w-0 items-center gap-2 text-xs text-text-dim">
          <File className="h-3 w-3 shrink-0" />
          {selectedFile ? (
            <>
              <span className="truncate text-text-muted" title={selectedFile}>
                {selectedFile.split('/').pop()}
              </span>
              <span className="truncate text-[10px] text-text-dim/60" title={selectedFile}>
                {selectedFile}
              </span>
              <span className="ml-2 rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-dim">
                Read-only
              </span>
            </>
          ) : (
            'No file selected'
          )}
        </div>
      </div>
      {!selectedFile ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="rounded-2xl bg-primary/5 p-4">
            <File className="h-8 w-8 text-primary/40" />
          </div>
          <p className="mt-4 text-sm font-medium text-text-muted">No file selected</p>
          <p className="mt-1 max-w-xs text-xs text-text-dim">
            Select a file from the file tree to view its contents.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="mt-2 text-sm text-text-muted">Failed to load file</p>
        </div>
      ) : canViewEditor ? (
        <Editor
          height="100%"
          theme="vs-dark"
          language={getLanguageFromPath(selectedFile)}
          value={content ?? ''}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12 },
            renderLineHighlight: 'line',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            domReadOnly: true,
          }}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
          <Lock className="h-8 w-8 text-text-dim/50" />
          <p className="mt-4 text-sm font-medium text-text-muted">Editor view locked</p>
          <p className="mt-1 max-w-xs text-xs text-text-dim">
            Upgrade to a paid plan to open files in the code editor and fork this project.
          </p>
          <Link
            to="/dashboard"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
          >
            <Zap className="h-3 w-3" />
            Upgrade Plan
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Chat history panel ───────────────────────────────────────────────

function ChatMessage({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className="flex gap-2.5">
      <div className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-primary/10' : 'bg-surface-hover'
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-primary" />
          : <Bot className="h-3.5 w-3.5 text-text-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-muted">
          {isUser ? 'User' : message.role === 'system' ? 'System' : 'AI Agent'}
        </p>
        <div className="mt-0.5">
          {message.content && <MarkdownContent content={message.content} />}
        </div>
      </div>
    </div>
  )
}

function ChatHistoryPanel({ projectId }: { projectId: string }) {
  const { messages, isLoading } = useCommunityMessages(projectId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-text">Chat History</span>
        <span className="ml-auto rounded bg-accent px-1.5 py-0.5 text-[10px] text-text-dim">
          Read-only
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-6 w-6 text-text-dim/50" />
            <p className="mt-3 text-xs text-text-dim">No chat history</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Download dropdown ────────────────────────────────────────────────

function DownloadDropdown({ projectId, canDownloadSource }: { projectId: string; canDownloadSource: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Download className="h-3.5 w-3.5" />
        Download
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-surface py-1 shadow-lg">
            {canDownloadSource ? (
              <a
                href={`/api/community/projects/${projectId}/download/zip`}
                download
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
              >
                <Archive className="h-3.5 w-3.5" />
                Download Source (.zip)
              </a>
            ) : (
              <div className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-dim cursor-not-allowed opacity-50">
                <Lock className="h-3.5 w-3.5" />
                Download Source (.zip)
                <span className="ml-auto text-[10px]">Paid</span>
              </div>
            )}
            <a
              href={`/api/community/projects/${projectId}/download/jar`}
              download
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
            >
              <Download className="h-3.5 w-3.5" />
              Download Compiled (.jar)
            </a>
          </div>
        </>
      )}
    </div>
  )
}

// ── Mobile tab button ────────────────────────────────────────────────

function MobileTabButton({ active, icon: Icon, label, onClick }: {
  active: boolean
  icon: typeof MessageCircle
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
        active ? 'text-primary' : 'text-text-dim hover:text-text-muted'
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
      {active && <div className="mt-0.5 h-0.5 w-8 rounded-full bg-primary" />}
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────

export default function CommunityProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const isMobile = useIsMobile()
  const { project, isLoading } = useCommunityProject(projectId ?? '')
  const { access } = useProjectAccess(projectId ?? '')
  const { files, isLoading: filesLoading } = useCommunityProjectFiles(projectId ?? '')
  const { forkProject, isForking } = useForkProject()
  const { likeProject, unlikeProject, isLiking } = useLikeProject()
  const { viewProject } = useViewProject()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const isChatFirst = project?.layoutMode === 'chat-first'
  const [mobileTab, setMobileTab] = useState<'files' | 'code' | 'chat'>('chat')
  const initialTabSetRef = useRef(false)
  const hasViewedRef = useRef(false)

  const canFork = access?.canFork ?? false
  const canDownloadSource = access?.canDownload ?? false
  const canViewEditor = access?.canViewFiles ?? true

  // Track view on mount
  useEffect(() => {
    if (projectId && !hasViewedRef.current) {
      hasViewedRef.current = true
      viewProject(projectId).catch(() => {})
    }
  }, [projectId, viewProject])

  useEffect(() => {
    if (project && !initialTabSetRef.current) {
      initialTabSetRef.current = true
      setMobileTab(project.layoutMode === 'code-first' ? 'code' : 'chat')
    }
  }, [project])

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath)
    if (isMobile) setMobileTab('code')
  }, [isMobile])

  const handleFork = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to fork this project')
      navigate('/login')
      return
    }
    if (!projectId) return
    try {
      const newProject = await forkProject(projectId)
      toast.success('Project forked successfully!')
      navigate(`/workspace/${newProject.id}`)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Failed to fork project'
      toast.error(msg)
    }
  }

  const handleLike = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to like projects')
      navigate('/login')
      return
    }
    if (!projectId) return
    try {
      if (project?.isLiked) {
        await unlikeProject(projectId)
        toast.success('Unliked')
      } else {
        await likeProject(projectId)
        toast.success('Liked!')
      }
    } catch {
      toast.error('Failed to update like')
    }
  }

  if (isLoading || !access) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-text-muted">Loading project...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="mt-3 text-sm text-text-muted">Project not found</p>
        <p className="mt-1 text-xs text-text-dim">This project may be private or doesn't exist.</p>
        <Link to="/community" className="mt-4 text-sm font-medium text-primary hover:text-primary-hover">
          Back to Community
        </Link>
      </div>
    )
  }

  if (isMobile) {
    const mobileTabs = isChatFirst
      ? [{ id: 'chat' as const, icon: MessageCircle, label: 'Chat' }, { id: 'files' as const, icon: FolderTree, label: 'Files' }, { id: 'code' as const, icon: Code2, label: 'Code' }]
      : [{ id: 'code' as const, icon: Code2, label: 'Code' }, { id: 'files' as const, icon: FolderTree, label: 'Files' }, { id: 'chat' as const, icon: MessageCircle, label: 'Chat' }]

    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        {/* Header */}
        <header className="flex h-auto shrink-0 flex-col gap-2 border-b border-border bg-surface/80 backdrop-blur-sm px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Link to="/community" className="text-text-dim hover:text-text-muted shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="truncate text-sm font-medium text-text">{project.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleLike}
                disabled={isLiking}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                  project.isLiked
                    ? 'border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400'
                    : 'border-border text-text-dim hover:text-text-muted'
                )}
              >
                <Heart className={cn('h-3.5 w-3.5', project.isLiked && 'fill-current')} />
                {project.likes ?? 0}
              </button>
              <DownloadDropdown projectId={projectId ?? ''} canDownloadSource={canDownloadSource} />
              <button
                onClick={handleFork}
                disabled={isForking || !canFork}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {isForking ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitFork className="h-3 w-3" />}
                Fork
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <User className="h-3 w-3 text-text-dim" />
            <span className="text-text-dim">@{project.ownerUsername}</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{SOFTWARE_LABELS[project.software] ?? project.software}</span>
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-text-muted">{project.language}</span>
            <span className="inline-flex items-center gap-1 text-text-dim ml-auto">
              <Eye className="h-3 w-3" />
              {project.views ?? 0}
            </span>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          <div className={cn('h-full', mobileTab !== 'chat' && 'hidden')}>
            <ChatHistoryPanel projectId={projectId ?? ''} />
          </div>
          <div className={cn('h-full', mobileTab !== 'files' && 'hidden')}>
            <FileTreePanel files={files} isLoading={filesLoading} onFileSelect={handleFileSelect} selectedFile={selectedFile} />
          </div>
          <div className={cn('h-full', mobileTab !== 'code' && 'hidden')}>
            <ReadOnlyEditorPanel projectId={projectId ?? ''} selectedFile={selectedFile} canViewEditor={canViewEditor} />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex h-14 shrink-0 items-center justify-around border-t border-border bg-surface" aria-label="Navigation">
          {mobileTabs.map((tab) => (
            <MobileTabButton key={tab.id} active={mobileTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => setMobileTab(tab.id)} />
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-sm px-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/community" className="flex items-center gap-2 text-text-dim hover:text-text-muted shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-5 w-px bg-border" />
          <Blocks className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate text-sm font-medium text-text">{project.name}</span>
          <div className="flex items-center gap-1.5 text-xs text-text-dim shrink-0">
            <User className="h-3 w-3" />
            <span>@{project.ownerUsername}</span>
          </div>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary shrink-0">{SOFTWARE_LABELS[project.software] ?? project.software}</span>
          <span className="rounded bg-accent px-2 py-0.5 text-xs text-text-dim shrink-0">{project.language}</span>
          <span className="inline-flex items-center gap-1 rounded bg-surface-hover px-2 py-0.5 text-xs text-text-dim shrink-0">
            <Eye className="h-3 w-3" />
            {project.views ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleLike}
            disabled={isLiking}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              project.isLiked
                ? 'border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400'
                : 'border-border text-text-muted hover:text-text'
            )}
          >
            <Heart className={cn('h-3.5 w-3.5', project.isLiked && 'fill-current')} />
            {project.likes ?? 0}
          </button>
          <DownloadDropdown projectId={projectId ?? ''} canDownloadSource={canDownloadSource} />
          <button
            onClick={handleFork}
            disabled={isForking || !canFork}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isForking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
            Fork Project
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {isChatFirst ? (
          <>
            <aside className="flex w-[380px] shrink-0 flex-col border-r border-border bg-surface">
              <ChatHistoryPanel projectId={projectId ?? ''} />
            </aside>

            <aside className="w-56 shrink-0 overflow-hidden border-r border-border">
              <FileTreePanel files={files} isLoading={filesLoading} onFileSelect={handleFileSelect} selectedFile={selectedFile} />
            </aside>

            <main className="flex-1 overflow-hidden">
              <ReadOnlyEditorPanel projectId={projectId ?? ''} selectedFile={selectedFile} canViewEditor={canViewEditor} />
            </main>
          </>
        ) : (
          <>
            <aside className="w-56 shrink-0 overflow-hidden border-r border-border">
              <FileTreePanel files={files} isLoading={filesLoading} onFileSelect={handleFileSelect} selectedFile={selectedFile} />
            </aside>

            <main className="flex-1 overflow-hidden">
              <ReadOnlyEditorPanel projectId={projectId ?? ''} selectedFile={selectedFile} canViewEditor={canViewEditor} />
            </main>

            <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-surface">
              <ChatHistoryPanel projectId={projectId ?? ''} />
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
