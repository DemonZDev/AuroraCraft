import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { SOFTWARE_LABELS } from '@/lib/software-options'
import { CustomSelect } from '@/components/ui/custom-select'
import { Link, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import {
  ArrowLeft,
  File,
  FilePlus2,
  FilePenLine,
  FileX2,
  FileSymlink,
  FileSearch,
  Folder,
  FolderOpen,
  Play,
  Settings,
  Send,
  ArrowLeftRight,
  Download,
  Package,
  GitBranch,
  Upload,
  Square,
  MessageSquare,
  MessageCircle,
  FolderTree,
  Code2,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  HelpCircle,
  Circle,
  ListTodo,
  Cpu,
  RefreshCw,
  FolderPlus,
  Pencil,
  Trash2,
  Save,
  RotateCcw,
  Shield,
  X,
  Info,
  Coins,
  Network,
  LogOut,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { cn } from '@/lib/utils'
import type { AxiosError } from 'axios'
import { useIsMobile } from '@/hooks/use-mobile'
import { useProject } from '@/hooks/use-projects'
import { useAgentSessions, useAgentSession, useStreamingAgent, useProjectFiles, useFileContent, useFileOperations } from '@/hooks/use-agent'
import { useUserTokens } from '@/hooks/use-user-tokens'
import { api } from '@/lib/api'
import { AI_MODELS, DEFAULT_MODEL_ID } from '@/types'
import type {
  AgentMessage,
  AgentSession,
  MessageMetadata,
  MessagePart,
  TodoItem,
  FileTreeEntry,
  ThinkingBlock,
  FileOpBlock,
  StreamTodoItem,
  StreamingState,
  StreamingItem,
} from '@/types'
import { GlassyPromptModal, GlassyConfirmModal, useToasts } from '@/components/ui/glassy'
import { GraphifyControls } from '@/components/graphify-controls'

/** Sentinel `selectedFile` value that makes EditorPanel render the Graphify web view
 *  (rendered graph) instead of Monaco. Cannot collide with a real relative file path. */
const GRAPH_VIEW_PATH = '__graphify_graph_view__'

function getErrorMessage(err: unknown): string {
  const axErr = err as AxiosError<{ message?: string }>
  return axErr?.response?.data?.message ?? 'An unexpected error occurred'
}

function removeLeakedBadgeText(content: string): string {
  if (!content) return ''
  const normalized = content
    // unwrap indented wrapped lines inside normal paragraphs
    .replace(/\n[ \t]{2,}(?=[A-Za-z"(])/g, ' ')
    // keep bullet lists compact and non-indented
    .replace(/^\s{2,}([-*]\s)/gm, '$1')
    .replace(/\n\s*\n(?=\s*[-*]\s)/g, '\n')
    // Strip any literal thinking/reasoning tags that leaked through
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/\n\s*?thinking[\s\S]*?<\/think>\s*\n?/gi, '\n')

  // Remove raw tool/file markers and leftover ANSI fragments.
  return normalized
    .replace(/\[(?:Created|Updated|Read|Deleted|Renamed)\][^\n]*/g, '')
    .replace(/\[Run\]\s+[^\n]*/g, '')
    .replace(/(?:^|[\s.])\[[0-9;]{1,20}m/g, ' ')
    .replace(/(\S)\s+(#{2,6}\s)/g, '$1\n\n$2')
    .replace(/(#{2,6})([A-Za-z])/g, '$1 $2')
    .replace(/Files:-/g, 'Files:\n- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Markdown renderer ────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const cleaned = removeLeakedBadgeText(content)
  if (!cleaned) return null
  return (
    <div className="markdown-content text-sm">
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeHighlight]}>
        {cleaned}
      </Markdown>
    </div>
  )
}

// ── Git Connection Modal ───────────────────────────────────────────────

function GitConnectionModal({ isOpen, onClose, projectId, githubConnected, githubUsername, repoConnected, repoUrl, repoBranch, onConnect, onGithubConnect, onDisconnectRepo, onDisconnectGithub }: {
  isOpen: boolean
  onClose: () => void
  projectId: string
  githubConnected: boolean
  githubUsername: string | null
  repoConnected: boolean
  repoUrl: string | null
  repoBranch: string | null
  onConnect: () => void
  onGithubConnect: () => void
  onDisconnectRepo: () => void
  onDisconnectGithub: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [repos, setRepos] = useState<Array<{ fullName: string; name: string; cloneUrl: string; defaultBranch: string }>>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [isEmptyRepo, setIsEmptyRepo] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoDescription, setNewRepoDescription] = useState('')
  const [isPrivateRepo, setIsPrivateRepo] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [creatingRepo, setCreatingRepo] = useState(false)
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [showCreateRepo, setShowCreateRepo] = useState(false)
  const [showCreateBranch, setShowCreateBranch] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setMounted(true), 30)
      return () => clearTimeout(t)
    }
    setMounted(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !githubConnected) return
    setLoadingRepos(true)
    setError('')
    fetch('/api/github/repos', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setRepos(data.repos || [])
      })
      .catch(() => setError('Failed to load repositories'))
      .finally(() => setLoadingRepos(false))
  }, [isOpen, githubConnected])

  useEffect(() => {
    if (!selectedRepo) { setBranches([]); setSelectedBranch(''); setIsEmptyRepo(false); return }
    setLoadingBranches(true)
    setError('')
    setIsEmptyRepo(false)
    const repo = repos.find(r => r.cloneUrl === selectedRepo)
    // Fetch branches from the selected repo via GitHub API
    fetch(`/api/github/repos/branches?repo=${encodeURIComponent(repo?.fullName || '')}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => {
        const loadedBranches = data.branches || []
        const fallbackBranch = repo?.defaultBranch || 'main'
        if (loadedBranches.length === 0) {
          // Empty repo (no commits yet) — GitHub API returns no branches
          setIsEmptyRepo(true)
        }
        const branchesToShow = loadedBranches.length > 0 ? loadedBranches : [fallbackBranch]
        setBranches(branchesToShow)
        setSelectedBranch(branchesToShow[0] || fallbackBranch)
      })
      .catch(() => {
        // Fallback: just use default branch
        const fallbackBranch = repo?.defaultBranch || 'main'
        setBranches([fallbackBranch])
        setSelectedBranch(fallbackBranch)
      })
      .finally(() => setLoadingBranches(false))
  }, [selectedRepo, repos])

  if (!isOpen) return null

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return
    setCreatingRepo(true)
    setError('')
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newRepoName.trim(), description: newRepoDescription, isPrivate: isPrivateRepo }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create repository'); return }
      setRepos(prev => [...prev, { fullName: data.fullName, name: newRepoName.trim(), cloneUrl: data.cloneUrl, defaultBranch: data.defaultBranch }])
      setSelectedRepo(data.cloneUrl)
      setShowCreateRepo(false)
      setNewRepoName('')
      setNewRepoDescription('')
    } catch {
      setError('Failed to create repository')
    } finally {
      setCreatingRepo(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!newBranchName.trim() || !selectedRepo) return
    setCreatingBranch(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/git/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branchName: newBranchName.trim() }),
      })
      if (!res.ok) { setError('Failed to create branch'); return }
      setBranches(prev => [...prev, newBranchName.trim()])
      setSelectedBranch(newBranchName.trim())
      setShowCreateBranch(false)
      setNewBranchName('')
    } catch {
      setError('Failed to create branch')
    } finally {
      setCreatingBranch(false)
    }
  }

  const handleConnect = async () => {
    if (!selectedRepo || !selectedBranch) return
    setConnecting(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/git/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repoUrl: selectedRepo, branch: selectedBranch }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to connect repository'); return }
      onConnect()
      onClose()
    } catch {
      setError('Failed to connect repository')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className={cn("absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-300", mounted ? "opacity-100" : "opacity-0")} />
      <div
        className={cn(
          "relative w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-surface/90 backdrop-blur-2xl shadow-2xl transition-all duration-300 ease-out overflow-hidden",
          mounted ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.94] translate-y-1"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <GitBranch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text">Connect Git Repository</h3>
              <p className="text-[11px] text-text-dim">Link your project to a GitHub repository to enable push, review, and reset features.</p>
            </div>
          </div>

          {!githubConnected ? (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                <GitBranch className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-text-muted mb-4">Connect your GitHub account to access your repositories.</p>
              <button
                onClick={onGithubConnect}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20"
              >
                Connect GitHub Account
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-1.5 rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2 text-[11px] text-destructive">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Repo Selector */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">Repository</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <CustomSelect
                      value={selectedRepo}
                      onChange={(v) => setSelectedRepo(v)}
                      options={[
                        ...(loadingRepos
                          ? [{ value: '', label: 'Loading...' }]
                          : [{ value: '', label: 'Select a repository' }]),
                        ...repos.map((r) => ({ value: r.cloneUrl, label: r.fullName })),
                      ]}
                      disabled={loadingRepos}
                    />
                  </div>
                  <button
                    onClick={() => { setShowCreateRepo(!showCreateRepo); setShowCreateBranch(false); setError('') }}
                    className="rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 text-sm text-text-muted hover:bg-surface-hover hover:text-text transition-all"
                    title="Create new repository"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Create Repo Panel */}
              {showCreateRepo && (
                <div className="rounded-xl border border-border/40 bg-background/30 p-4 space-y-3">
                  <input
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="Repository name"
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-text placeholder:text-text-dim/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                  <input
                    value={newRepoDescription}
                    onChange={(e) => setNewRepoDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-text placeholder:text-text-dim/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                  <label className="flex items-center gap-2 text-xs text-text-muted">
                    <input type="checkbox" checked={isPrivateRepo} onChange={(e) => setIsPrivateRepo(e.target.checked)} className="rounded border-border" />
                    Private repository
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreateRepo(false)} className="flex-1 rounded-lg border border-border/60 px-3 py-2 text-xs text-text-muted hover:bg-surface-hover">Cancel</button>
                    <button onClick={handleCreateRepo} disabled={!newRepoName.trim() || creatingRepo} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90 disabled:opacity-50">
                      {creatingRepo ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </div>
              )}

              {/* Branch Selector */}
              {selectedRepo && (
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1.5">Branch</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <CustomSelect
                        value={selectedBranch}
                        onChange={(v) => setSelectedBranch(v)}
                        options={
                          loadingBranches
                            ? [{ value: '', label: 'Loading branches...' }]
                            : branches.map((b) => ({ value: b, label: b }))
                        }
                        disabled={loadingBranches}
                      />
                    </div>
                    <button
                      onClick={() => { setShowCreateBranch(!showCreateBranch); setShowCreateRepo(false); setError('') }}
                      className="rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 text-sm text-text-muted hover:bg-surface-hover hover:text-text transition-all"
                      title="Create new branch"
                    >
                      <GitBranch className="h-4 w-4" />
                    </button>
                  </div>
                  {isEmptyRepo && (
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-primary/5 border border-primary/10 px-2.5 py-1.5">
                      <Info className="h-3 w-3 shrink-0 text-primary/70" />
                      <span className="text-[11px] text-text-dim">Empty repository — "{selectedBranch}" will be created on first push</span>
                    </div>
                  )}
                </div>
              )}

              {/* Create Branch Panel */}
              {showCreateBranch && selectedRepo && (
                <div className="rounded-xl border border-border/40 bg-background/30 p-4 space-y-3">
                  <input
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="New branch name"
                    className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-text placeholder:text-text-dim/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreateBranch(false)} className="flex-1 rounded-lg border border-border/60 px-3 py-2 text-xs text-text-muted hover:bg-surface-hover">Cancel</button>
                    <button onClick={handleCreateBranch} disabled={!newBranchName.trim() || creatingBranch} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90 disabled:opacity-50">
                      {creatingBranch ? 'Creating...' : 'Create Branch'}
                    </button>
                  </div>
                </div>
              )}

              {/* Connected Repo Card */}
              {repoConnected && (
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-text">Currently Connected</span>
                  </div>
                  <div className="space-y-1">
                    <code className="block text-[11px] text-text-muted font-mono break-all">{repoUrl?.replace('https://github.com/', '')}</code>
                    <span className="text-[11px] text-text-dim">Branch: <span className="text-text-muted font-medium">{repoBranch}</span></span>
                  </div>
                  <button
                    onClick={() => { onDisconnectRepo(); onClose() }}
                    className="w-full rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-all"
                  >
                    Disconnect Repository
                  </button>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 bg-transparent px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text transition-all duration-200">
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={!selectedRepo || !selectedBranch || connecting}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {repoConnected ? (connecting ? 'Changing...' : 'Change Repository') : (connecting ? 'Connecting...' : 'Connect Repository')}
                </button>
              </div>

              {/* Disconnect GitHub Account */}
              <div className="pt-3 border-t border-border/30">
                <button
                  onClick={() => { onDisconnectGithub(); onClose() }}
                  className="group flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/10 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive/70 transition-all duration-200 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  <span>Disconnect GitHub Account</span>
                  {githubUsername && (
                    <span className="text-[10px] opacity-60">@{githubUsername}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── File tree ────────────────────────────────────────────────────────

function FileTreeNode({ entry, depth = 0, onFileSelect, selectedFile, fileOps }: { entry: FileTreeEntry; depth?: number; onFileSelect?: (path: string) => void; selectedFile?: string | null; fileOps?: ReturnType<typeof useFileOperations> }) {
  const [expanded, setExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const pl = depth * 12 + 8

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    document.addEventListener('contextmenu', handler)
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('contextmenu', handler)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleRename = useCallback((newName: string) => {
    if (!newName || newName === entry.name) { setRenameOpen(false); return }
    const parentDir = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/')) : ''
    const newPath = parentDir ? `${parentDir}/${newName}` : newName
    fileOps?.renameFile({ oldPath: entry.path, newPath })
      .then(() => setRenameOpen(false))
      .catch((err) => { setRenameError(getErrorMessage(err)) })
  }, [entry.path, entry.name, fileOps])

  const handleDelete = useCallback(() => {
    setDeleteError('')
    fileOps?.deleteFile({ path: entry.path })
      .then(() => setDeleteOpen(false))
      .catch((err) => { setDeleteError(getErrorMessage(err)) })
  }, [entry.path, fileOps])

  const contextMenuEl = contextMenu && (
    <div
      className="fixed z-50 min-w-[140px] rounded-lg border border-border bg-surface py-1 shadow-lg"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
        onClick={() => { setContextMenu(null); setRenameOpen(true); setRenameError('') }}
      >
        <Pencil className="h-3 w-3" /> Rename
      </button>
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-surface-hover"
        onClick={() => { setContextMenu(null); setDeleteOpen(true) }}
      >
        <Trash2 className="h-3 w-3" /> Delete
      </button>
    </div>
  )

  const modals = (
    <>
      <GlassyPromptModal
        isOpen={renameOpen}
        onClose={() => { setRenameOpen(false); setRenameError('') }}
        onConfirm={(val) => { setRenameError(''); handleRename(val) }}
        title={`Rename ${entry.type === 'directory' ? 'Folder' : 'File'}`}
        description={`Enter a new name for "${entry.name}"`}
        placeholder="New name..."
        defaultValue={entry.name}
        icon={entry.type === 'directory' ? FolderOpen : FilePenLine}
        confirmText="Rename"
        errorText={renameError}
      />
      <GlassyConfirmModal
        isOpen={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteError('') }}
        onConfirm={handleDelete}
        title={`Delete ${entry.type === 'directory' ? 'Folder' : 'File'}?`}
        description={entry.type === 'directory' ? 'This folder and all its contents will be permanently removed.' : 'This file will be permanently removed.'}
        icon={Trash2}
        confirmText="Delete"
        itemName={entry.path}
        error={deleteError}
      />
    </>
  )

  if (entry.type === 'directory') {
    const DirIcon = expanded ? FolderOpen : Folder
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          onContextMenu={handleContextMenu}
          className="flex w-full items-center gap-1.5 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
          style={{ paddingLeft: pl }}
        >
          <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-90')} />
          <DirIcon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children?.map((child) => (
          <FileTreeNode key={child.path} entry={child} depth={depth + 1} onFileSelect={onFileSelect} selectedFile={selectedFile} fileOps={fileOps} />
        ))}
        {contextMenuEl}
        {modals}
      </div>
    )
  }

  const isActive = selectedFile === entry.path

  return (
    <>
      <button
        type="button"
        onClick={() => onFileSelect?.(entry.path)}
        onContextMenu={handleContextMenu}
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
      {contextMenuEl}
      {modals}
    </>
  )
}

// ── Static badges (persisted messages) ───────────────────────────────

function FileOpBadge({ part, onFileSelect }: { part: Extract<MessagePart, { type: 'file' }>; onFileSelect?: (path: string) => void }) {
  const actionConfigs: Record<string, { icon: typeof File; label: string; color: string }> = {
    create: { icon: FilePlus2, label: 'Created', color: 'text-success bg-success/10 border-success/20' },
    update: { icon: FilePenLine, label: 'Updated', color: 'text-[#f97316] bg-[#f97316]/10 border-[#f97316]/20' },
    delete: { icon: FileX2, label: 'Deleted', color: 'text-destructive bg-destructive/10 border-destructive/20' },
    rename: { icon: FileSymlink, label: 'Renamed', color: 'text-warning bg-warning/10 border-warning/20' },
    read: { icon: FileSearch, label: 'Read', color: 'text-primary bg-primary/10 border-primary/20' },
  }
  const config = actionConfigs[part.action] ?? { icon: File, label: 'Modified', color: 'text-text-muted bg-surface-hover border-border' }
  const Icon = config.icon
  const filename = part.path.split('/').pop() ?? part.path
  const isClickable = part.action !== 'delete' && onFileSelect
  
  // Bug Fix 2: For renamed badges, use newPath for navigation
  const pathToOpen = part.action === 'rename' && part.newPath ? part.newPath : part.path
  
  const Wrapper = isClickable ? 'button' : 'div'

  return (
    <Wrapper
      {...(isClickable ? { onClick: () => onFileSelect(pathToOpen), type: 'button' as const } : {})}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
        config.color,
        isClickable && 'cursor-pointer transition-opacity hover:opacity-80'
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-medium">{config.label}</span>
      <span className="opacity-75" title={part.path}>{filename}</span>
      {part.action === 'rename' && part.newPath && (
        <span className="opacity-75">→ {part.newPath.split('/')}</span>
      )}
    </Wrapper>
  )
}

function ThinkingBadge({ content, defaultExpanded = false }: { content: string; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text"
      >
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Thinking</span>
        {expanded ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <p className="whitespace-pre-wrap text-xs text-text-dim">{content}</p>
        </div>
      )}
    </div>
  )
}

function ToolBadge({ part }: { part: Extract<MessagePart, { type: 'tool' }> }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary">
      <Cpu className="h-3 w-3" />
      <span className="font-medium">Ran</span>
      <span className="opacity-75">{part.tool}</span>
    </div>
  )
}

function TodoListBadge({ items }: { items: TodoItem[] }) {
  const allDone = items.length > 0 && items.every((i) => i.status === 'completed')
  const [expanded, setExpanded] = useState(!allDone)

  if (allDone && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-success/20 bg-success/10 px-2 py-1 text-xs text-success"
      >
        <CheckCircle2 className="h-3 w-3" />
        <span className="font-medium">{items.length} tasks completed</span>
        <ChevronRight className="ml-1 h-3 w-3" />
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text"
      >
        <ListTodo className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Tasks ({items.filter((i) => i.status === 'completed').length}/{items.length})</span>
        {expanded ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {item.status === 'completed' ? (
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
              ) : item.status === 'in-progress' ? (
                <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-warning" />
              ) : (
                <Circle className="mt-0.5 h-3 w-3 shrink-0 text-text-dim" />
              )}
              <span className={cn(
                item.status === 'completed' ? 'text-text-dim line-through' : 'text-text-muted'
              )}>{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Live streaming badges ────────────────────────────────────────────

function StreamingThinkingBadge({ block }: { block: ThinkingBlock }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (block.done) {
      const timer = setTimeout(() => setExpanded(false), 1200)
      return () => clearTimeout(timer)
    }
  }, [block.done])

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text"
      >
        <Brain className={cn('h-3.5 w-3.5', block.done ? 'text-primary' : 'text-primary animate-pulse')} />
        <span className="font-medium">{block.done ? 'Thought' : 'Thinking...'}</span>
        {!block.done && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        <span className="ml-auto">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
      </button>
      {expanded && block.content && (
        <div className="border-t border-border px-3 py-2">
          <p className="whitespace-pre-wrap text-xs text-text-dim">{block.content}</p>
        </div>
      )}
    </div>
  )
}

function StreamingFileOpBadge({ op }: { op: FileOpBlock }) {
  const isRunning = op.status === 'running'
  const filename = op.path.split('/').pop() ?? op.path

  const configs: Record<string, { icon: typeof File; runLabel: string; doneLabel: string; doneColor: string }> = {
    create: { icon: FilePlus2, runLabel: 'Creating', doneLabel: 'Created', doneColor: 'text-success bg-success/10 border-success/20' },
    update: { icon: FilePenLine, runLabel: 'Updating', doneLabel: 'Updated', doneColor: 'text-[#f97316] bg-[#f97316]/10 border-[#f97316]/20' },
    delete: { icon: FileX2, runLabel: 'Deleting', doneLabel: 'Deleted', doneColor: 'text-destructive bg-destructive/10 border-destructive/20' },
    rename: { icon: FileSymlink, runLabel: 'Renaming', doneLabel: 'Renamed', doneColor: 'text-warning bg-warning/10 border-warning/20' },
    read: { icon: FileSearch, runLabel: 'Reading', doneLabel: 'Read', doneColor: 'text-primary bg-primary/10 border-primary/20' },
    tool: { icon: Cpu, runLabel: 'Running', doneLabel: 'Ran', doneColor: 'text-primary bg-primary/10 border-primary/20' },
  }
  const config = configs[op.action] ?? { icon: File, runLabel: 'Processing', doneLabel: 'Done', doneColor: 'text-text-muted bg-surface-hover border-border' }
  const Icon = config.icon

  if (isRunning) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2 py-1 text-xs text-text-dim">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="font-medium">{config.runLabel}</span>
        <span className="opacity-75">{op.action === 'tool' ? op.tool : op.path}...</span>
      </div>
    )
  }

  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs', config.doneColor)}>
      <Icon className="h-3 w-3" />
      <span className="font-medium">{config.doneLabel}</span>
      <span className="opacity-75" title={op.path}>{op.action === 'tool' ? op.tool : filename}</span>
      {op.action === 'rename' && op.newPath && (
        <span className="opacity-75">→ {op.newPath.split('/').pop()}</span>
      )}
    </div>
  )
}

function StreamingTodoList({ items }: { items: StreamTodoItem[] }) {
  if (items.length === 0) return null
  const completed = items.filter((i) => i.status === 'completed').length

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
        <ListTodo className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Tasks ({completed}/{items.length})</span>
      </div>
      <div className="border-t border-border px-3 py-2 space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-xs">
            {item.status === 'completed' ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
            ) : item.status === 'in_progress' ? (
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-warning" />
            ) : (
              <Circle className="mt-0.5 h-3 w-3 shrink-0 text-text-dim" />
            )}
            <span className={cn(
              item.status === 'completed' ? 'text-text-dim line-through' : 'text-text-muted'
            )}>{item.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Streaming question badge ─────────────────────────────────────────

function StreamingQuestionBadge({ question, onAnswer }: { 
  question: { id: string; text: string; status: 'running' | 'completed' | 'error' }
  onAnswer?: (questionId: string, answer: string) => Promise<void>
}) {
  const [answer, setAnswer] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting || question.status !== 'running' || !onAnswer) return
    setIsSubmitting(true)
    try {
      await onAnswer(question.id, answer)
      setAnswer('')
    } catch (error) {
      console.error('Failed to submit answer:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (question.status === 'completed') {
    return (
      <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-medium">Question answered</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
      <div className="flex items-start gap-2">
        <HelpCircle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-warning">{question.text}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Type your answer..."
              disabled={isSubmitting}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!answer.trim() || isSubmitting}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type RenderBlock =
  | { kind: 'thinking'; id: string; content: string; done: boolean }
  | { kind: 'text'; id: string; content: string }
  | { kind: 'question'; id: string; questionText: string; questionStatus: 'running' | 'completed' | 'error' }
  | { kind: 'file-group'; id: string; ops: Array<{ id: string; action: string; path: string; newPath?: string; status: 'running' | 'completed' | 'error'; tool: string }> }

function buildRenderBlocksFromStreaming(items: StreamingItem[]): RenderBlock[] {
  const blocks: RenderBlock[] = []

  for (const item of items) {
    if (item.kind === 'thinking') {
      blocks.push({ kind: 'thinking', id: item.id, content: item.thinkingContent ?? '', done: item.thinkingDone ?? false })
    } else if (item.kind === 'text') {
      blocks.push({ kind: 'text', id: item.id, content: item.textContent ?? '' })
    } else if (item.kind === 'question' && item.questionText && item.questionStatus) {
      blocks.push({ kind: 'question', id: item.id, questionText: item.questionText, questionStatus: item.questionStatus })
    } else if (item.kind === 'file-op' && item.fileAction && item.filePath && item.fileStatus && item.fileTool) {
      // Don't group - keep each file-op in its original position
      blocks.push({ 
        kind: 'file-group', 
        id: `ops-${item.id}`, 
        ops: [{
          id: item.id,
          action: item.fileAction,
          path: item.filePath,
          newPath: item.fileNewPath,
          status: item.fileStatus,
          tool: item.fileTool,
        }]
      })
    }
    // Build terminal feature removed - ignore build items
  }

  return blocks
}

function buildRenderBlocksFromMetadata(metadata?: MessageMetadata | null): { blocks: RenderBlock[]; todos: TodoItem[] } {
  const blocks: RenderBlock[] = []
  let todos: TodoItem[] = []
  const parts = Array.isArray(metadata?.parts) ? metadata.parts : []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.type === 'thinking') {
      blocks.push({ kind: 'thinking', id: `thinking-${i}`, content: part.content, done: true })
    } else if (part.type === 'text') {
      blocks.push({ kind: 'text', id: `text-${i}`, content: part.content })
    } else if (part.type === 'file') {
      // Don't group - keep each file-op in its original position
      blocks.push({ 
        kind: 'file-group', 
        id: `file-${i}`, 
        ops: [{ 
          id: `file-${i}`, 
          action: part.action, 
          path: part.path, 
          newPath: part.newPath, 
          status: 'completed' as const, 
          tool: part.action 
        }] 
      })
    } else if (part.type === 'tool') {
      blocks.push({ 
        kind: 'file-group', 
        id: `tool-${i}`, 
        ops: [{ 
          id: `tool-${i}`, 
          action: 'tool', 
          path: part.path, 
          status: 'completed' as const, 
          tool: part.tool 
        }] 
      })
    } else if (part.type === 'todo-list') {
      todos = part.items
    }
    // Build terminal feature removed - ignore build parts
  }

  return { blocks, todos }
}

function RenderMessageBlocks({ blocks, todos, onAnswer, onFileSelect }: {
  blocks: RenderBlock[]
  todos?: TodoItem[] | StreamTodoItem[]
  onAnswer?: (questionId: string, answer: string) => Promise<void>
  onFileSelect?: (path: string) => void
}) {
  return (
    <div className="space-y-2">
      {blocks.map((item, idx) => {
        if (item.kind === 'text') {
          if (!removeLeakedBadgeText(item.content)) return null
          return <MarkdownContent key={item.id} content={item.content} />
        }
        if (item.kind === 'thinking') {
          return item.done
            ? <ThinkingBadge key={item.id} content={item.content} />
            : <StreamingThinkingBadge key={item.id} block={{ id: item.id, content: item.content, done: item.done, order: idx }} />
        }
        if (item.kind === 'file-group') {
          return (
            <div key={item.id} className="flex flex-wrap gap-1.5">
              {item.ops.map((op) => (
                op.status === 'completed'
                  ? (
                      op.action === 'tool'
                        ? <ToolBadge key={op.id} part={{ type: 'tool', tool: op.tool, path: op.path }} />
                        : <FileOpBadge key={op.id} part={{ type: 'file', action: op.action as 'create' | 'update' | 'delete' | 'rename' | 'read', path: op.path, newPath: op.newPath }} onFileSelect={onFileSelect} />
                    )
                  : (
                      <StreamingFileOpBadge key={op.id} op={{ id: op.id, action: op.action, path: op.path, newPath: op.newPath, status: op.status, tool: op.tool, order: idx }} />
                    )
              ))}
            </div>
          )
        }
        if (item.kind === 'question') {
          return (
            <StreamingQuestionBadge
              key={item.id}
              question={{ id: item.id, text: item.questionText, status: item.questionStatus }}
              onAnswer={onAnswer}
            />
          )
        }
        return null
      })}
      {Array.isArray(todos) && todos.length > 0 && (
        'content' in todos[0]
          ? <StreamingTodoList items={todos as StreamTodoItem[]} />
          : <TodoListBadge items={todos as TodoItem[]} />
      )}
    </div>
  )
}

// ── Streaming message (live agent response) ──────────────────────────

function StreamingMessage({ state, onAnswer }: { 
  state: StreamingState
  onAnswer?: (questionId: string, answer: string) => Promise<void>
}) {
  const renderedItems = buildRenderBlocksFromStreaming(state.items)

  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover">
        <Bot className="h-3.5 w-3.5 text-text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-muted">AI Agent</p>
        <div className="mt-1">
          {renderedItems.length > 0 || state.todos.length > 0 ? (
            <RenderMessageBlocks blocks={renderedItems} todos={state.todos} onAnswer={onAnswer} />
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-xs text-text-dim">Connecting to AI agent...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Message content (persisted messages) ─────────────────────────────

function MessageContent({ message, onFileSelect }: { message: AgentMessage; onFileSelect?: (path: string) => void }) {
  const { blocks, todos } = buildRenderBlocksFromMetadata(message.metadata)

  if (blocks.length > 0 || todos.length > 0) {
    return <RenderMessageBlocks blocks={blocks} todos={todos} onFileSelect={onFileSelect} />
  }

  return <>{message.content && <MarkdownContent content={message.content} />}</>
}

// ── Model selector ───────────────────────────────────────────────────

function ModelSelector({ selectedModel, selectedSpeed, onModelChange, onSpeedChange, availableModels, disabled }: {
  selectedModel: string
  selectedSpeed?: string
  onModelChange: (modelId: string) => void
  onSpeedChange?: (speed: string) => void
  availableModels?: typeof AI_MODELS
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setOpenUpward(spaceBelow < 400 && spaceAbove > spaceBelow)
    }
  }, [open])

  const models = availableModels ?? AI_MODELS
  const current = models.find((m) => m.id === selectedModel) ?? models[0]
  const currentProvider = current.providers.find(p => p.speed === (selectedSpeed || 'fast')) ?? current.providers[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-surface-hover/50 px-3 py-1 text-xs text-text-dim transition-all hover:bg-surface-hover hover:text-text-muted disabled:opacity-50 disabled:pointer-events-none',
          open && 'bg-surface-hover text-text-muted ring-1 ring-border-bright'
        )}
      >
        <Cpu className="h-3 w-3 shrink-0" />
        <span className="max-w-[7rem] truncate">{current.name}</span>
        {current.providers.length > 1 && (
          <span className="rounded bg-accent px-1 py-0.5 text-[10px] text-text-dim uppercase">{currentProvider?.speed}</span>
        )}
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (() => {
        const freeModels = models.filter((m) => m.minTier === 'free')
        const paidModels = models.filter((m) => m.minTier === 'paid')
        return (
          <div className={cn(
            'absolute left-0 z-50 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg',
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          )}>
            <div className="p-1">
              {freeModels.length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-success">Free Models</p>
                  {freeModels.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onModelChange(model.id)
                        const hasSpeed = model.providers.some(p => p.speed === (selectedSpeed || 'fast'))
                        if (!hasSpeed && onSpeedChange) {
                          onSpeedChange(model.providers[0]?.speed || 'fast')
                        }
                        setOpen(false)
                      }}
                      className={cn(
                        'flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-hover',
                        model.id === selectedModel && 'bg-primary/10'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs font-medium', model.id === selectedModel ? 'text-primary' : 'text-text')}>
                          {model.name}
                        </span>
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-text-dim">{model.providers[0].id}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-dim">{model.description}</p>
                    </button>
                  ))}
                </>
              )}
              {freeModels.length > 0 && paidModels.length > 0 && (
                <div className="mx-2 my-1 border-t border-border" />
              )}
              {paidModels.length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-primary/60">Premium Models</p>
                  {paidModels.map(model => (
                    <div key={model.id} className="px-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!model.disabled) {
                            onModelChange(model.id)
                            const hasSpeed = model.providers.some(p => p.speed === (selectedSpeed || 'fast'))
                            if (!hasSpeed && onSpeedChange) {
                              onSpeedChange(model.providers[0]?.speed || 'fast')
                            }
                            setOpen(false)
                          }
                        }}
                        disabled={model.disabled}
                        className={cn(
                          'flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors',
                          model.disabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-surface-hover',
                          model.id === selectedModel && !model.disabled && 'bg-primary/10'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-medium', model.id === selectedModel && !model.disabled ? 'text-primary' : 'text-text')}>
                            {model.name}
                          </span>
                          {model.disabled && (
                            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500">No Key</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-dim">{model.description}</p>
                        {model.disabledReason && (
                          <p className="mt-0.5 text-[10px] text-red-500/70">{model.disabledReason}</p>
                        )}
                      </button>
                      {model.id === selectedModel && model.providers.length > 1 && onSpeedChange && (
                        <div className="ml-2 mt-1 flex flex-wrap gap-1">
                          {model.providers.map(provider => (
                            <button
                              key={provider.speed}
                              type="button"
                              onClick={() => { onSpeedChange(provider.speed); setOpen(false) }}
                              className={cn(
                                'rounded px-2 py-0.5 text-[10px] transition-colors',
                                (selectedSpeed || 'fast') === provider.speed
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-accent text-text-dim hover:bg-surface-hover'
                              )}
                            >
                              {provider.id} ({provider.speed})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Chat components ──────────────────────────────────────────────────

function getBridgeFromModel(modelId: string): 'opencode' | 'kiro' {
  return modelId.startsWith('kiro/') ? 'kiro' : 'opencode'
}



function ChatPanel({ projectId, projectBridge, selectedModel, selectedSpeed, onModelChange, onSpeedChange, onRefreshFiles, onFileSelect, autoFixPayload, onAutoFixComplete, workspaceDisabled, onAiRunningChange, stopAiRef }: {
  projectId: string
  projectBridge?: string
  selectedModel: string
  selectedSpeed?: string
  onModelChange: (modelId: string) => void
  onSpeedChange?: (speed: string) => void
  onRefreshFiles?: () => void
  onFileSelect?: (path: string) => void
  autoFixPayload?: { prompt: string; model: string } | null
  onAutoFixComplete?: () => void
  workspaceDisabled?: boolean
  onAiRunningChange?: (running: boolean) => void
  stopAiRef?: React.MutableRefObject<(() => void) | null>
}) {
  const { sessions, isLoading: sessionsLoading, createSession } = useAgentSessions(projectId)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    // Try to restore saved session from localStorage
    const saved = loadSessionPreference(projectId)
    if (saved && sessions?.some((s: AgentSession) => s.id === saved)) {
      return saved
    }
    return null
  })
  const [pendingMessage, setPendingMessage] = useState<{ content: string; model: string } | null>(null)
  
  const availableModels = AI_MODELS.filter(() => {
    if (!projectBridge) return true
    return true
  })
  
  const resolvedSessionId = activeSessionId

  // Auto-select the most recent session when sessions load and no active session is set
  useEffect(() => {
    if (activeSessionId) return
    if (!sessions || sessions.length === 0) return
    // Prefer the saved session if it still exists in the list
    const saved = loadSessionPreference(projectId)
    const savedSession = saved ? sessions.find((s: AgentSession) => s.id === saved) : null
    if (savedSession) {
      setActiveSessionId(savedSession.id)
    } else {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId, projectId])

  // Persist active session to localStorage
  useEffect(() => {
    if (activeSessionId) {
      saveSessionPreference(projectId, activeSessionId)
    }
  }, [activeSessionId, projectId])

  const handleSessionCreated = useCallback((id: string, message: string) => {
    setActiveSessionId(id)
    setPendingMessage({ content: message, model: selectedModel })
  }, [selectedModel])

  const autoFixProcessedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!autoFixPayload) return
    const key = `${autoFixPayload.prompt}::${autoFixPayload.model}`
    if (autoFixProcessedRef.current === key) return
    autoFixProcessedRef.current = key

    if (resolvedSessionId) {
      setPendingMessage({ content: autoFixPayload.prompt, model: autoFixPayload.model })
    } else {
      const bridge = getBridgeFromModel(autoFixPayload.model)
      createSession({ bridge }).then((session) => {
        setActiveSessionId(session.id)
        setPendingMessage({ content: autoFixPayload.prompt, model: autoFixPayload.model })
      })
    }
    onAutoFixComplete?.()
  }, [autoFixPayload, resolvedSessionId, createSession, onAutoFixComplete])

  if (sessionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
      </div>
    )
  }

  if (!resolvedSessionId) {
    return <ChatEmptyState onSessionCreated={handleSessionCreated} createSession={createSession} selectedModel={selectedModel} selectedSpeed={selectedSpeed} onModelChange={onModelChange} onSpeedChange={onSpeedChange} />
  }

  return (
    <ChatSession
      projectId={projectId}
      sessionId={resolvedSessionId}
      pendingMessage={pendingMessage}
      onPendingMessageSent={() => setPendingMessage(null)}
      selectedModel={selectedModel}
      selectedSpeed={selectedSpeed}
      onModelChange={onModelChange}
      onSpeedChange={onSpeedChange}
      availableModels={availableModels}
      onRefreshFiles={onRefreshFiles}
      onFileSelect={onFileSelect}
      workspaceDisabled={workspaceDisabled}
      onAiRunningChange={onAiRunningChange}
      stopAiRef={stopAiRef}
    />
  )
}

// ── Chat input (isolated to prevent parent re-renders on keystroke) ─

const ChatInput = memo(function ChatInput({ onSend, disabled, isRunning, isCancelling, onCancel, selectedModel, selectedSpeed, onModelChange, onSpeedChange, availableModels, modelDisabled }: {
  onSend: (message: string) => void
  disabled?: boolean
  isRunning?: boolean
  isCancelling?: boolean
  onCancel?: () => void
  selectedModel: string
  selectedSpeed?: string
  onModelChange: (modelId: string) => void
  onSpeedChange?: (speed: string) => void
  availableModels?: typeof AI_MODELS
  modelDisabled?: boolean
}) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { tokens } = useUserTokens()

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    void onSend(trimmed)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, disabled, onSend])

  return (
    <div className="border-t border-border p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim/60">Model</span>
        <ModelSelector selectedModel={selectedModel} selectedSpeed={selectedSpeed} onModelChange={onModelChange} onSpeedChange={onSpeedChange} availableModels={availableModels} disabled={modelDisabled} />
        {tokens && (
          <div className="ml-auto flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 border border-border/60" title="Available AI tokens">
            <Coins className="h-3 w-3 text-primary/70" />
            <span className="text-[11px] font-medium text-text-muted">{tokens.balance?.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim/50">tkn</span>
          </div>
        )}
        <span className="text-[10px] text-text-dim/40">Ctrl+Enter</span>
      </div>
      <div className="chatbox-glow flex items-end gap-2 rounded-xl border border-border bg-background p-1.5">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }}
          placeholder="Describe your plugin idea..."
          disabled={disabled}
          className="flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none disabled:opacity-50 min-h-[44px] max-h-[200px] overflow-y-auto"
        />
        {isRunning ? (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            title="Stop AI"
            className="shrink-0 rounded-lg bg-destructive p-2.5 text-destructive-foreground transition-colors hover:bg-destructive/80 disabled:opacity-50"
          >
            {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            title="Send message (Ctrl+Enter)"
            className="shrink-0 rounded-lg bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
})

function ChatEmptyState({ onSessionCreated, createSession, selectedModel, selectedSpeed, onModelChange, onSpeedChange }: {
  onSessionCreated: (id: string, message: string) => void
  createSession: (body?: { bridge?: 'opencode' | 'kiro' }) => Promise<{ id: string }>
  selectedModel: string
  selectedSpeed?: string
  onModelChange: (modelId: string) => void
  onSpeedChange?: (speed: string) => void
}) {
  const [isCreating, setIsCreating] = useState(false)

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 rounded-xl bg-primary/10 p-3">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-text">Start a conversation</p>
          <p className="mt-1 text-xs text-text-dim">
            Describe what you want to build and the AI agent will help you create it.
          </p>
        </div>
      </div>
      <ChatInput
        onSend={(msg) => {
          setIsCreating(true)
          const bridge = getBridgeFromModel(selectedModel)
          createSession({ bridge }).then((session) => onSessionCreated(session.id, msg)).catch(() => setIsCreating(false))
        }}
        disabled={isCreating}
        selectedModel={selectedModel}
        selectedSpeed={selectedSpeed}
        onModelChange={onModelChange}
        onSpeedChange={onSpeedChange}
        modelDisabled={isCreating}
      />
    </>
  )
}

function ChatSession({ projectId, sessionId, pendingMessage, onPendingMessageSent, selectedModel, selectedSpeed, onModelChange, onSpeedChange, availableModels, onRefreshFiles, onFileSelect, workspaceDisabled, onAiRunningChange, stopAiRef }: {
  projectId: string
  sessionId: string
  pendingMessage?: { content: string; model: string } | null
  onPendingMessageSent?: () => void
  selectedModel: string
  selectedSpeed?: string
  onModelChange: (modelId: string) => void
  onSpeedChange?: (speed: string) => void
  availableModels?: typeof AI_MODELS
  onRefreshFiles?: () => void
  onFileSelect?: (path: string) => void
  workspaceDisabled?: boolean
  onAiRunningChange?: (running: boolean) => void
  stopAiRef?: React.MutableRefObject<(() => void) | null>
}) {
  const { session, messages, isLoading, sendMessage, isSending, sendError, invalidateAndRefetch, cancelSession, isCancelling } = useAgentSession(projectId, sessionId)
  const [awaitingStream, setAwaitingStream] = useState(false)
  // Wait for session snapshot so we don't open SSE against a terminal session while `session` is still undefined.
  const streamActive =
    !!projectId
    && !!sessionId
    && !isLoading
    && !!session
    && (session.status === 'idle' || session.status === 'running' || awaitingStream)
  const { streamingState, isConnected, resetStream } = useStreamingAgent(
    projectId,
    sessionId,
    streamActive,
    session?.status ?? null,
  )
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pendingSentRef = useRef(false)
  const prevFileChangesRef = useRef(0)
  const prevCompletedOpsRef = useRef(0)

  // Reset pendingSentRef when a new pendingMessage arrives
  useEffect(() => {
    if (pendingMessage) {
      pendingSentRef.current = false
    }
  }, [pendingMessage])

  useEffect(() => {
    if (pendingMessage && !pendingSentRef.current && isConnected) {
      pendingSentRef.current = true
      setAwaitingStream(true)
      resetStream()
      streamStartMessageCountRef.current = messages.length
      completionHandledRef.current = false
      void sendMessage({ content: pendingMessage.content, model: pendingMessage.model, bridge: getBridgeFromModel(pendingMessage.model), speed: selectedSpeed }).catch(() => setAwaitingStream(false))
      onPendingMessageSent?.()
    }
  }, [pendingMessage, isConnected, sendMessage, onPendingMessageSent, resetStream, messages.length, selectedSpeed])

  useEffect(() => {
    if (!pendingMessage || pendingSentRef.current) return
    const timer = setTimeout(() => {
      if (!pendingSentRef.current) {
        pendingSentRef.current = true
        setAwaitingStream(true)
        resetStream()
        streamStartMessageCountRef.current = messages.length
        completionHandledRef.current = false
        void sendMessage({ content: pendingMessage.content, model: pendingMessage.model, bridge: getBridgeFromModel(pendingMessage.model), speed: selectedSpeed }).catch(() => setAwaitingStream(false))
        onPendingMessageSent?.()
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [pendingMessage, sendMessage, onPendingMessageSent, resetStream, selectedSpeed])

  useEffect(() => {
    // Only auto-scroll for new messages, not during streaming
    if (!streamingState.isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingState.isStreaming])

  // Clear awaitingStream once real streaming content arrives
  useEffect(() => {
    if (awaitingStream && (streamingState.isStreaming || streamingState.items.length > 0)) {
      setAwaitingStream(false)
    }
  }, [awaitingStream, streamingState.isStreaming, streamingState.items.length])

  useEffect(() => {
    if (awaitingStream && session?.status && session.status !== 'idle' && session.status !== 'running') {
      setAwaitingStream(false)
    }
  }, [awaitingStream, session?.status])

  useEffect(() => {
    if (streamingState.fileChanges.length > prevFileChangesRef.current) {
      prevFileChangesRef.current = streamingState.fileChanges.length
      onRefreshFiles?.()
    }
  }, [streamingState.fileChanges.length, onRefreshFiles])

  useEffect(() => {
    const completed = streamingState.items.filter((item) => item.kind === 'file-op' && item.fileStatus === 'completed').length
    if (completed > prevCompletedOpsRef.current) {
      prevCompletedOpsRef.current = completed
      onRefreshFiles?.()
    }
  }, [streamingState.items, onRefreshFiles])

  // Track message count at stream start to detect when persisted agent message replaces streaming.
  // This avoids effect-based timing gaps where streaming hides before persisted content loads.
  const streamStartMessageCountRef = useRef(0)
  const completionHandledRef = useRef(false)
  const messagesLenRef = useRef(messages.length)
  messagesLenRef.current = messages.length

  // Initialize from loaded messages (handles page reload with existing session)
  // Set to current message count UNLESS we're actively awaiting a new stream
  useEffect(() => {
    if (messages.length > 0 && streamStartMessageCountRef.current === 0 && !awaitingStream) {
      streamStartMessageCountRef.current = messages.length
    }
  }, [messages.length, awaitingStream])

  // Refetch final messages when session completes
  useEffect(() => {
    if ((session?.status === 'completed' || session?.status === 'failed') && !completionHandledRef.current) {
      completionHandledRef.current = true
      invalidateAndRefetch()
    }
  }, [session?.status, invalidateAndRefetch])

  const isRunning = session?.status === 'running'

  useEffect(() => {
    onAiRunningChange?.(isRunning || awaitingStream)
  }, [isRunning, awaitingStream, onAiRunningChange])

  const handleSend = useCallback(async (message: string) => {
    if (!message || isSending || session?.status === 'running') return
    setAwaitingStream(true)
    resetStream()
    streamStartMessageCountRef.current = messagesLenRef.current
    completionHandledRef.current = false
    prevFileChangesRef.current = 0
    prevCompletedOpsRef.current = 0
    try {
      await sendMessage({ content: message, model: selectedModel, bridge: getBridgeFromModel(selectedModel), speed: selectedSpeed })
    } catch {
      setAwaitingStream(false)
    }
  }, [isSending, sendMessage, selectedModel, selectedSpeed, session?.status, resetStream])

  const handleCancel = useCallback(() => {
    cancelSession().catch(() => {})
  }, [cancelSession])

  useEffect(() => {
    if (stopAiRef) {
      stopAiRef.current = handleCancel
    }
  }, [handleCancel, stopAiRef])

  const handleAnswer = useCallback(async (questionId: string, answer: string) => {
    await api.post(`/projects/${projectId}/agent/sessions/${sessionId}/answer`, { questionId, answer })
  }, [projectId, sessionId])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
      </div>
    )
  }

  const streamHasContent = streamingState.items.length > 0 || streamingState.todos.length > 0
  const handoffAgentMessage =
    messages.length > streamStartMessageCountRef.current
      ? (messages.slice(streamStartMessageCountRef.current).find(m => m.role === 'agent') ?? null)
      : null

  const sessionIsTerminal =
    session?.status === 'completed' || session?.status === 'failed' || session?.status === 'cancelled'
  const showStreamingShell =
    !sessionIsTerminal &&
    !handoffAgentMessage &&
    (awaitingStream || session?.status === 'running' || streamHasContent)

  const messagesToRender =
    handoffAgentMessage ? messages.filter((m) => m.id !== handoffAgentMessage.id) : messages

  const showVirtualAgentMessage = !!handoffAgentMessage || showStreamingShell

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !showVirtualAgentMessage ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 rounded-xl bg-primary/10 p-3">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-text">Session started</p>
            <p className="mt-1 text-xs text-text-dim">Send a message to begin.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messagesToRender.map((msg, idx) => {
              const prevRole = idx > 0 ? messagesToRender[idx - 1].role : null
              const isRoleChange = prevRole && prevRole !== msg.role
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2.5',
                    msg.role === 'user' ? 'flex-row-reverse justify-start' : 'flex-row',
                    isRoleChange && 'mt-6 pt-2'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    msg.role === 'user' ? 'bg-primary/10' : 'bg-surface-hover'
                  )}>
                    {msg.role === 'user'
                      ? <User className="h-3.5 w-3.5 text-primary" />
                      : <Bot className="h-3.5 w-3.5 text-text-muted" />}
                  </div>
                  <div className={cn(
                    'min-w-0',
                    msg.role === 'user' ? 'max-w-[80%] flex flex-col items-end' : 'flex-1'
                  )}>
                    <p className="text-xs font-medium text-text-muted">
                      {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'AI Agent'}
                    </p>
                    <div className={cn(
                      'mt-1 rounded-lg',
                      msg.role === 'user'
                        ? 'bg-primary/5 px-3 py-2'
                        : ''
                    )}>
                      <MessageContent message={msg} onFileSelect={onFileSelect} />
                    </div>
                  </div>
                </div>
              )
            })}

            {handoffAgentMessage && (
              <div className="mt-6 pt-2 flex gap-2.5">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover">
                  <Bot className="h-3.5 w-3.5 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-muted">AI Agent</p>
                  <div className="mt-1">
                    <MessageContent message={handoffAgentMessage} onFileSelect={onFileSelect} />
                  </div>
                </div>
              </div>
            )}
            {!handoffAgentMessage && showStreamingShell && (
              <div className={messagesToRender.length > 0 && messagesToRender[messagesToRender.length - 1]?.role === 'user' ? 'mt-6 pt-2' : ''}>
                <StreamingMessage state={streamingState} onAnswer={handleAnswer} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <div>
        {sendError && (
          <div className="px-4 pt-3 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span>Failed to send message. Try again.</span>
          </div>
        )}
        <ChatInput
          onSend={handleSend}
          disabled={isSending || session?.status === 'running' || workspaceDisabled}
          isRunning={isRunning || awaitingStream}
          isCancelling={isCancelling}
          onCancel={handleCancel}
          selectedModel={selectedModel}
          selectedSpeed={selectedSpeed}
          onModelChange={onModelChange}
          onSpeedChange={onSpeedChange}
          availableModels={availableModels}
          modelDisabled={isSending || session?.status === 'running' || workspaceDisabled}
        />
      </div>
    </>
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

// ── File tree panel (shared between mobile & desktop) ────────────────

function FileTreePanel({ files, filesLoading, refetchFiles, onFileSelect, selectedFile, fileOps, disabled }: {
  files: FileTreeEntry[]
  filesLoading: boolean
  refetchFiles: () => void
  onFileSelect?: (path: string) => void
  selectedFile?: string | null
  fileOps: ReturnType<typeof useFileOperations>
  disabled?: boolean
}) {
  const [createFileOpen, setCreateFileOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [createError, setCreateError] = useState('')

  const handleCreateFile = (name: string) => {
    fileOps.createFile({ path: name, type: 'file' })
      .then(() => setCreateFileOpen(false))
      .catch((err) => { setCreateError(getErrorMessage(err)) })
  }

  const handleCreateFolder = (name: string) => {
    fileOps.createFile({ path: name, type: 'directory' })
      .then(() => setCreateFolderOpen(false))
      .catch((err) => { setCreateError(getErrorMessage(err)) })
  }

  return (
    <div className={cn("h-full overflow-y-auto bg-surface py-2", disabled && "pointer-events-none opacity-50")}>
      <div className="mb-2 flex items-center justify-between px-3">
        <p className="text-xs font-medium uppercase tracking-wider text-text-dim">Files</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setCreateError(''); setCreateFileOpen(true) }}
            disabled={disabled}
            className="rounded p-0.5 text-text-dim hover:text-text-muted disabled:opacity-40"
            title="New file"
          >
            <FilePlus2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => { setCreateError(''); setCreateFolderOpen(true) }}
            disabled={disabled}
            className="rounded p-0.5 text-text-dim hover:text-text-muted disabled:opacity-40"
            title="New folder"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
          <button
            onClick={() => refetchFiles()}
            disabled={disabled}
            className="rounded p-0.5 text-text-dim hover:text-text-muted disabled:opacity-40"
            title="Refresh files"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>
      <GlassyPromptModal
        isOpen={createFileOpen}
        onClose={() => { setCreateFileOpen(false); setCreateError('') }}
        onConfirm={(val) => { setCreateError(''); handleCreateFile(val) }}
        title="Create New File"
        description="Enter the relative path for the new file."
        placeholder="src/main/java/MyClass.java"
        icon={FilePlus2}
        confirmText="Create"
        errorText={createError}
      />
      <GlassyPromptModal
        isOpen={createFolderOpen}
        onClose={() => { setCreateFolderOpen(false); setCreateError('') }}
        onConfirm={(val) => { setCreateError(''); handleCreateFolder(val) }}
        title="Create New Folder"
        description="Enter the relative path for the new folder."
        placeholder="src/main/resources"
        icon={FolderPlus}
        confirmText="Create"
        errorText={createError}
      />
      {filesLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-text-dim" />
        </div>
      ) : files.length > 0 ? (
        <div>
          {files.map((entry) => (
            <FileTreeNode key={entry.path} entry={entry} onFileSelect={onFileSelect} selectedFile={selectedFile} fileOps={fileOps} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <FolderOpen className="h-8 w-8 text-text-dim/50" />
          <p className="mt-3 text-xs text-text-dim">No files yet</p>
          <p className="mt-1 text-xs text-text-dim/70">
            Use the AI assistant to generate your plugin code
          </p>
        </div>
      )}
    </div>
  )
}

// ── Editor panel (shared between mobile & desktop) ───────────────────

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

function EditorPanel({ projectId, selectedFile, fileOps, disabled, onExitGraphView }: { projectId: string; selectedFile: string | null; fileOps: ReturnType<typeof useFileOperations>; disabled?: boolean; onExitGraphView?: () => void }) {
  const isGraphView = selectedFile === GRAPH_VIEW_PATH
  const { content, isLoading, error } = useFileContent(projectId, isGraphView ? null : selectedFile)
  const [editedContent, setEditedContent] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  const hasUnsavedChanges = editedContent !== null && editedContent !== content

  useEffect(() => {
    setEditedContent(null)
    setSaveError('')
  }, [selectedFile])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (selectedFile && hasUnsavedChanges && !fileOps.isSaving) {
          fileOps.saveFile({ path: selectedFile, content: editedContent ?? content ?? '' })
            .then(() => { setEditedContent(null); setSaveError('') })
            .catch((err) => { setSaveError(getErrorMessage(err)) })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedFile, hasUnsavedChanges, fileOps, editedContent, content])

  const handleSave = useCallback(() => {
    if (!selectedFile || !hasUnsavedChanges || fileOps.isSaving) return
    fileOps.saveFile({ path: selectedFile, content: editedContent ?? content ?? '' })
      .then(() => { setEditedContent(null); setSaveError('') })
      .catch((err) => { setSaveError(getErrorMessage(err)) })
  }, [selectedFile, hasUnsavedChanges, fileOps, editedContent, content])

  // Graphify web view: render the interactive graph (not raw HTML) inside the editor panel.
  if (isGraphView) {
    return (
      <div className={cn('flex h-full flex-col', disabled && 'pointer-events-none opacity-50')}>
        <div className="flex h-9 items-center justify-between border-b border-border bg-surface px-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
            <Network className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">Project Knowledge Graph</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <a
              href={`/api/projects/${projectId}/graphify/graph.html`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-text-dim hover:text-text-muted"
            >
              Open in new tab
            </a>
            {onExitGraphView && (
              <button
                onClick={onExitGraphView}
                className="rounded p-0.5 text-text-dim hover:text-text-muted"
                title="Close graph view"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <iframe
          src={`/api/projects/${projectId}/graphify/graph.html`}
          title="Project Knowledge Graph"
          className="w-full flex-1 border-0 bg-white"
          sandbox="allow-scripts"
        />
      </div>
    )
  }

  return (
    <div className={cn("flex h-full flex-col", disabled && "pointer-events-none opacity-50")}>
      <div className="flex h-9 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex min-w-0 items-center gap-2 text-xs text-text-dim">
          <File className="h-3 w-3 shrink-0" />
          {selectedFile ? (
            <span className="truncate text-text-muted" title={selectedFile}>{selectedFile.split('/').pop()}</span>
          ) : (
            'No file selected'
          )}
          {selectedFile && (
            <span className="truncate text-[10px] text-text-dim/60" title={selectedFile}>{selectedFile}</span>
          )}
          {hasUnsavedChanges && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-warning">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              Unsaved
            </span>
          )}
        </div>
        {selectedFile && hasUnsavedChanges && (
          <button
            onClick={handleSave}
            disabled={fileOps.isSaving || disabled}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            title="Save (Ctrl+S)"
          >
            {fileOps.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        )}
      </div>
      {saveError && (
        <div className="flex items-center gap-1.5 border-b border-destructive/10 bg-destructive/5 px-4 py-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{saveError}</span>
          <button onClick={() => setSaveError('')} className="ml-auto rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-destructive/10">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {!selectedFile ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="rounded-2xl bg-primary/5 p-4">
            <File className="h-8 w-8 text-primary/40" />
          </div>
          <p className="mt-4 text-sm font-medium text-text-muted">No file selected</p>
          <p className="mt-1 max-w-xs text-xs text-text-dim">
            Select a file from the file tree or click a file badge in the chat to view its contents.
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
          <p className="mt-1 text-xs text-text-dim">The file may not exist on disk yet.</p>
        </div>
      ) : (
        <Editor
          height="100%"
          theme="vs-dark"
          language={getLanguageFromPath(selectedFile)}
          value={editedContent ?? content ?? ''}
          onChange={(value) => {
            const v = value ?? ''
            if (v !== content) setEditedContent(v)
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12 },
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      )}
    </div>
  )
}

// ── Workspace page ───────────────────────────────────────────────────

// ── Model Preference Persistence ──────────────────────────────────────

function getModelPreferenceKey(projectId: string): string {
  return `auroracraft:model:${projectId}`
}

function loadModelPreference(projectId: string | undefined): { model: string; speed: string } | null {
  if (!projectId) return null
  try {
    const raw = localStorage.getItem(getModelPreferenceKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.model === 'string' && typeof parsed.speed === 'string') {
      return parsed
    }
  } catch { /* ignore corrupt localStorage */ }
  return null
}

function saveModelPreference(projectId: string | undefined, model: string, speed: string): void {
  if (!projectId) return
  try {
    localStorage.setItem(getModelPreferenceKey(projectId), JSON.stringify({ model, speed }))
  } catch { /* ignore localStorage errors (e.g. quota exceeded) */ }
}

function getSessionPreferenceKey(projectId: string): string {
  return `auroracraft:session:${projectId}`
}

function loadSessionPreference(projectId: string | undefined): string | null {
  if (!projectId) return null
  try {
    const raw = localStorage.getItem(getSessionPreferenceKey(projectId))
    if (raw) return JSON.parse(raw)
  } catch { /* ignore corrupt localStorage */ }
  return null
}

function saveSessionPreference(projectId: string | undefined, sessionId: string): void {
  if (!projectId) return
  try {
    localStorage.setItem(getSessionPreferenceKey(projectId), JSON.stringify(sessionId))
  } catch { /* ignore localStorage errors (e.g. quota exceeded) */ }
}

function isModelAvailable(modelId: string, projectBridge: string | undefined): boolean {
  const model = AI_MODELS.find(m => m.id === modelId)
  if (!model) return false
  if (!projectBridge) return true
  const prefix = projectBridge === 'kiro' ? 'kiro/' : 'opencode/'
  return model.id.startsWith(prefix)
}

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { project, isLoading, updateProject } = useProject(projectId ?? '')
  const { files, isLoading: filesLoading, refetch: refetchFiles } = useProjectFiles(projectId ?? '')
  const { tokens } = useUserTokens()
  const isPaid = tokens?.tier === 'paid'
  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<'chat' | 'files' | 'code'>('chat')
  const [layoutMode, setLayoutMode] = useState<string>('chat-first')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [jars, setJars] = useState<{ maven: string | null; gradle: string | null }>({ maven: null, gradle: null })
  const [jarMenuOpen, setJarMenuOpen] = useState(false)
  const jarMenuRef = useRef<HTMLDivElement>(null)
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [gitStatus, setGitStatus] = useState<{ connected: boolean; repoUrl: string | null; repoBranch: string | null; githubAuth: boolean } | null>(null)
  const [gitConnectModalOpen, setGitConnectModalOpen] = useState(false)
  const [pushModalOpen, setPushModalOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [pushing, setPushing] = useState(false)
  const [forcePush, setForcePush] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetBranch, setResetBranch] = useState('')
  const [resetCommit, setResetCommit] = useState('')
  const [resetting, setResetting] = useState(false)
  const [coderabbitEnabled, setCoderabbitEnabled] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewResults, setReviewResults] = useState<any>(null)
  const [reviewHistoryOpen, setReviewHistoryOpen] = useState(false)
  const [reviewHistory, setReviewHistory] = useState<any[]>([])
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set())
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set())
  const [autoFixModalOpen, setAutoFixModalOpen] = useState(false)

  // Load persisted model preference or fall back to default
  const [selectedModel, setSelectedModel] = useState(() => {
    const saved = loadModelPreference(projectId)
    if (saved && isModelAvailable(saved.model, project?.bridge)) {
      return saved.model
    }
    return DEFAULT_MODEL_ID
  })
  const [selectedSpeed, setSelectedSpeed] = useState(() => {
    const saved = loadModelPreference(projectId)
    return saved?.speed ?? 'fast'
  })

  // Persist model/speed whenever they change
  useEffect(() => {
    saveModelPreference(projectId, selectedModel, selectedSpeed)
  }, [projectId, selectedModel, selectedSpeed])

  // When project loads, validate saved model is still valid for this project's bridge
  useEffect(() => {
    if (!project) return
    if (!isModelAvailable(selectedModel, project.bridge)) {
      // Fallback to first available model for this bridge
      const available = AI_MODELS.filter(m => {
        if (!project.bridge) return true
        return project.bridge === 'kiro' ? m.id.startsWith('kiro/') : m.id.startsWith('opencode/')
      })
      if (available.length > 0 && available[0].id !== selectedModel) {
        setSelectedModel(available[0].id)
        setSelectedSpeed('fast')
      }
    }
  }, [project?.bridge, selectedModel])

  const [selectedIssues, setSelectedIssues] = useState<Array<{ reviewId: string; issueIdx: number }>>([])
  const [autoFixPayload, setAutoFixPayload] = useState<{ prompt: string; model: string } | null>(null)
  const [fixConfirmOpen, setFixConfirmOpen] = useState(false)

  const [aiRunning, setAiRunning] = useState(false)
  const stopAiRef = useRef<(() => void) | null>(null)

  // ── Review Lock System ──────────────────────────────────────────────
  const [reviewLock, setReviewLock] = useState<{ status: 'pending' | 'error' | 'completed'; reviewId: string; error?: string } | null>(null)
  const isReviewLocked = reviewLock?.status === 'pending'
  const isWorkspaceLocked = isReviewLocked || aiRunning

  // ── Toast Notifications ─────────────────────────────────────────────
  const { addToast, ToastContainer } = useToasts()

  const toggleIssueSelection = (reviewId: string, idx: number) => {
    setSelectedIssues(prev => {
      const existing = prev.find(s => s.reviewId === reviewId && s.issueIdx === idx)
      if (existing) return prev.filter(s => !(s.reviewId === reviewId && s.issueIdx === idx))
      return [...prev, { reviewId, issueIdx: idx }]
    })
  }

const handleAutoFix = () => {
    if (!project || selectedIssues.length === 0) {
      if (selectedIssues.length === 0) addToast('Please select at least one issue to fix', 'error')
      return
    }
    const availableModelsForBridge = AI_MODELS.filter(m => {
      if (!project.bridge) return true
      return project.bridge === 'kiro' ? m.id.startsWith('kiro/') : m.id.startsWith('opencode/')
    })
    if (availableModelsForBridge.length > 0) {
      setSelectedModel(availableModelsForBridge[0].id)
    }
    setAutoFixModalOpen(true)
  }

  const confirmAutoFix = async (skipConfirmation = false) => {
    if (!skipConfirmation) {
      const hasFixed = selectedIssues.some(({ reviewId, issueIdx }) => {
        const review = reviewHistory.find(r => r.id === reviewId)
        return review?.issuesJson?.[issueIdx]?._fixed === true
      })
      if (hasFixed) {
        setFixConfirmOpen(true)
        return
      }
    }

    const issues = selectedIssues.map(({ reviewId, issueIdx }) => {
      const review = reviewHistory.find(r => r.id === reviewId) ?? null
      return review?.issuesJson?.[issueIdx] ?? null
    }).filter(Boolean)

    if (issues.length === 0) {
      return
    }

    const prompt = `Fix the following code review issues:\n\n${issues.map((issue: any, i: number) => 
      `${i + 1}. [${issue.severity}] ${issue.fileName}\n${issue.codegenInstructions}\n`
    ).join('\n')}`

    const fixesByReview: Record<string, number[]> = {}
    for (const { reviewId, issueIdx } of selectedIssues) {
      if (!fixesByReview[reviewId]) fixesByReview[reviewId] = []
      fixesByReview[reviewId].push(issueIdx)
    }

    for (const [reviewId, indices] of Object.entries(fixesByReview)) {
      try {
        await fetch(`/api/projects/${projectId}/coderabbit/reviews/${reviewId}/fix-issues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fixedIndices: indices }),
        })
      } catch {
        // Non-fatal
      }
    }

    fetchReviewHistory()

    setAutoFixModalOpen(false)
    setFixConfirmOpen(false)
    setReviewHistoryOpen(false)
    setReviewResults(null)
    setSelectedIssues([])

    if (isMobile) setMobileTab('chat')

    setAutoFixPayload({ prompt, model: selectedModel })
  }

  const fetchReviewHistory = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/coderabbit/reviews`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setReviewHistory(data.reviews || [])
      }
    } catch {}
  }

  const checkReviewStatus = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/projects/${projectId}/review-status`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data.locked && data.review?.status === 'pending') {
          setReviewLock({ status: 'pending', reviewId: data.review.id })
        } else if (data.error) {
          setReviewLock({ status: 'error', reviewId: data.error.id, error: data.error.message })
          fetchReviewHistory()
        } else {
          setReviewLock(null)
        }
      }
    } catch {}
  }, [projectId])

  useEffect(() => {
    checkReviewStatus()
    fetchReviewHistory()
    if (reviewLock?.status === 'pending') {
      const interval = setInterval(() => checkReviewStatus(), 3000)
      return () => clearInterval(interval)
    }
  }, [reviewLock?.status, checkReviewStatus])

  const dismissReviewError = async (reviewId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/coderabbit/reviews/${reviewId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch {}
    setReviewLock(null)
  }

  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)
  const [needsRemote, setNeedsRemote] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [settingRemote, setSettingRemote] = useState(false)
  const fileOps = useFileOperations(projectId ?? '')
  const initialTabSetRef = useRef(false)

  useEffect(() => {
    if (project) {
      setLayoutMode(project.layoutMode)
      if (!initialTabSetRef.current) {
        initialTabSetRef.current = true
        setMobileTab(project.layoutMode === 'code-first' ? 'code' : 'chat')
      }
    }
  }, [project])

  const toggleLayout = useCallback(async () => {
    const prevMode = layoutMode
    const newMode = prevMode === 'chat-first' ? 'code-first' : 'chat-first'
    setLayoutMode(newMode)
    if (isMobile) setMobileTab(newMode === 'code-first' ? 'code' : 'chat')
    try {
      await updateProject({ layoutMode: newMode })
    } catch {
      setLayoutMode(prevMode)
      if (isMobile) setMobileTab(prevMode === 'code-first' ? 'code' : 'chat')
    }
  }, [layoutMode, updateProject, isMobile])

  const isChatFirst = layoutMode === 'chat-first'

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath)
    if (isMobile) setMobileTab('code')
  }, [isMobile])

  // Open the Graphify web view inside the editor panel (not raw HTML).
  const handleViewGraph = useCallback(() => {
    setSelectedFile(GRAPH_VIEW_PATH)
    if (isMobile) setMobileTab('code')
  }, [isMobile])

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/projects/${projectId}/jars`, { credentials: 'include' })
      .then(r => r.json())
      .then(setJars)
      .catch(() => setJars({ maven: null, gradle: null }))
  }, [projectId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (jarMenuRef.current && !jarMenuRef.current.contains(e.target as Node)) setJarMenuOpen(false)
    }
    if (jarMenuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [jarMenuOpen])

  const downloadJar = (type: 'maven' | 'gradle') => {
    window.location.href = `/api/projects/${projectId}/jars/${type}/download`
    setJarMenuOpen(false)
  }

  const fetchGitStatus = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/projects/${projectId}/git/status`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setGitStatus(data)
        setGithubConnected(data.githubAuth)
        setGithubUsername(data.githubUsername)
      }
    } catch {}
  }, [projectId])

  useEffect(() => {
    fetchGitStatus()

    fetch(`/api/projects/${projectId}/coderabbit/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setCoderabbitEnabled(data.enabled))
      .catch(() => {})
  }, [fetchGitStatus, projectId])

  const handleGithubConnect = () => {
    const width = 600
    const height = 700
    const left = window.screen.width / 2 - width / 2
    const top = window.screen.height / 2 - height / 2
    const returnTo = encodeURIComponent(`/workspace/${projectId}`)
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
        fetchGitStatus()
        clearInterval(checkConnection)
      }
    }, 1000)
  }

  const handleGithubDisconnect = async () => {
    await fetch('/api/auth/github/disconnect', { method: 'POST', credentials: 'include' })
    setGithubConnected(false)
    setGithubUsername(null)
    fetchGitStatus()
  }

  const handleDisconnectRepo = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/git/disconnect`, { method: 'POST', credentials: 'include' })
      if (res.ok) {
        fetchGitStatus()
        addToast('Repository disconnected', 'info')
      } else {
        addToast('Failed to disconnect repository', 'error')
      }
    } catch {
      addToast('Failed to disconnect repository', 'error')
    }
  }

  const handleOpenPushModal = async () => {
    const res = await fetch(`/api/projects/${projectId}/git/branches`, { credentials: 'include' })
    const data = await res.json()
    
    if (data.needsRemote) {
      setNeedsRemote(true)
      setPushModalOpen(true)
      return
    }
    
    setBranches(data.branches || [])
    setSelectedBranch(data.currentBranch || '')
    setNeedsRemote(false)
    setPushModalOpen(true)
  }

  const handleSetRemote = async () => {
    if (!repoUrl.trim()) return
    setSettingRemote(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/git/remote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      })
      if (res.ok) {
        setNeedsRemote(false)
        setRepoUrl('')
        const branchRes = await fetch(`/api/projects/${projectId}/git/branches`, { credentials: 'include' })
        const data = await branchRes.json()
        setBranches(data.branches || [])
        setSelectedBranch(data.currentBranch || '')
        addToast('Repository connected successfully', 'success')
      } else {
        const data = await res.json()
        addToast(data.error || 'Failed to set repository', 'error')
      }
    } catch (err) {
      addToast('Failed to set repository', 'error')
    } finally {
      setSettingRemote(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/git/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          branch: resetBranch.trim() || undefined, 
          commit: resetCommit.trim() || undefined 
        }),
      })
      if (res.ok) {
        setResetModalOpen(false)
        setResetBranch('')
        setResetCommit('')
        addToast('Project reset successfully! Refreshing...', 'success')
        window.location.reload()
      } else {
        const data = await res.json()
        addToast(data.error || 'Failed to reset project', 'error')
      }
    } catch (err) {
      addToast('Failed to reset project', 'error')
    } finally {
      setResetting(false)
    }
  }

  const handleReview = async () => {
    setReviewing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/coderabbit/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope: 'uncommitted' }),
      })
      if (res.ok) {
        const data = await res.json()
        setReviewModalOpen(false)
        if (data.status === 'pending') {
          setReviewLock({ status: 'pending', reviewId: data.reviewId })
          fetchReviewHistory()
          addToast('Code review started — running in background', 'info')
        } else {
          setReviewResults(data)
          fetchReviewHistory()
          if (data.issuesCount > 0) {
            addToast(`Review completed — found ${data.issuesCount} issue${data.issuesCount !== 1 ? 's' : ''}`, 'info')
          } else {
            addToast('Review completed — no issues found!', 'success')
          }
        }
      } else {
        const data = await res.json()
        const errMsg = data.error || 'Failed to run review'
        if (errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit exceeded')) {
          setReviewLock({ status: 'error', reviewId: 'temp', error: errMsg })
        } else {
          addToast(errMsg, 'error')
        }
      }
    } catch (err) {
      addToast('Failed to run review', 'error')
    } finally {
      setReviewing(false)
    }
  }

  const handlePush = async () => {
    if (!commitMessage.trim()) return
    setPushing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: selectedBranch, message: commitMessage, force: forcePush }),
      })
      if (res.ok) {
        setPushModalOpen(false)
        setCommitMessage('')
        setForcePush(false)
        addToast('Code pushed successfully!', 'success')
      } else {
        const data = await res.json()
        addToast(data.error || 'Failed to push code', 'error')
      }
    } catch (err) {
      addToast('Failed to push code', 'error')
    } finally {
      setPushing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-text-muted">Loading workspace...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="mt-3 text-sm text-text-muted">Project not found</p>
        <Link to="/dashboard" className="mt-4 text-sm font-medium text-primary hover:text-primary-hover">
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (isMobile) {
    const mobileTabs = isChatFirst
      ? [{ id: 'chat' as const, icon: MessageCircle, label: 'Chat' }, { id: 'files' as const, icon: FolderTree, label: 'Files' }, { id: 'code' as const, icon: Code2, label: 'Code' }]
      : [{ id: 'code' as const, icon: Code2, label: 'Code' }, { id: 'files' as const, icon: FolderTree, label: 'Files' }, { id: 'chat' as const, icon: MessageCircle, label: 'Chat' }]

    return (
      <>
        <ToastContainer />
        {isWorkspaceLocked && (
          <div className="shrink-0 flex items-center justify-center gap-2 bg-primary/90 py-2 px-4 text-sm font-medium text-primary-foreground backdrop-blur animate-pulse z-50">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{isReviewLocked ? 'Review is ongoing, please wait' : 'AI is generating code, please wait'}</span>
            {aiRunning && (
              <button
                onClick={() => stopAiRef.current?.()}
                className="ml-2 flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-xs text-destructive-foreground hover:bg-destructive/80"
              >
                <Square className="h-3 w-3" /> Stop
              </button>
            )}
          </div>
        )}
        {reviewLock?.status === 'error' && (
          <div className="shrink-0 flex items-center justify-between gap-2 bg-red-500/90 py-2 px-4 text-sm font-medium text-white backdrop-blur z-50">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{reviewLock.error || 'Review failed'}</span>
            </div>
            <button onClick={() => dismissReviewError(reviewLock.reviewId)} className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">Dismiss</button>
          </div>
        )}
        <div className="flex h-[100dvh] flex-col bg-background">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface/80 backdrop-blur-sm px-3">
          <Link to="/dashboard" className="text-text-dim hover:text-text-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="truncate text-sm font-medium text-text">{project.name}</span>
          <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-text-dim">{SOFTWARE_LABELS[project.software] ?? project.software}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {isPaid && (
              <>
                {gitStatus?.connected ? (
                  <>
                    <button
                      onClick={handleOpenPushModal}
                      disabled={isWorkspaceLocked}
                      className="rounded-md p-1.5 text-text-dim hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Push to GitHub"
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setResetModalOpen(true)}
                      disabled={isWorkspaceLocked}
                      className="rounded-md p-1.5 text-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Reset from Git"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setGitConnectModalOpen(true)}
                      disabled={isWorkspaceLocked}
                      className="flex items-center gap-1 rounded-md p-1.5 text-green-500 hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={`Connected: ${gitStatus.repoUrl?.replace('https://github.com/', '') || 'repo'}`}
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setGitConnectModalOpen(true)}
                    disabled={isWorkspaceLocked}
                    className="rounded-md p-1.5 text-text-dim hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Connect Git Repository"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                  </button>
                )}
                {coderabbitEnabled && gitStatus?.connected && (
                  <>
                    <button
                      onClick={() => setReviewModalOpen(true)}
                      disabled={isWorkspaceLocked}
                      className="rounded-md p-1.5 text-blue-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Review Code"
                    >
                      <Shield className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (isWorkspaceLocked) return
                        fetchReviewHistory()
                        setReviewHistoryOpen(true)
                      }}
                      disabled={isWorkspaceLocked}
                      className="rounded-md p-1.5 text-text-dim hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Review History"
                    >
                      <ListTodo className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </>
            )}
            <button onClick={toggleLayout} disabled={isWorkspaceLocked} className="rounded-md p-1.5 text-text-dim hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed" title={isChatFirst ? 'Switch to Code First' : 'Switch to Chat First'}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
            <GraphifyControls projectId={projectId ?? ''} isPaid={isPaid} compact onViewGraph={handleViewGraph} disabled={isWorkspaceLocked} />
            {isPaid && (
              <a href={`/api/projects/${projectId}/download/zip`} download className="rounded-md p-1.5 text-text-dim hover:text-text-muted" title="Download project">
                <Download className="h-3.5 w-3.5" />
              </a>
            )}
            <div className="relative" ref={jarMenuRef}>
              <button 
                onClick={() => !isWorkspaceLocked && setJarMenuOpen(!jarMenuOpen)} 
                className={cn("rounded-md p-1.5 text-text-dim hover:text-text-muted", (!jars.maven && !jars.gradle) && "opacity-40 cursor-not-allowed", isWorkspaceLocked && "opacity-40 cursor-not-allowed")} 
                title="Download plugin JAR"
                disabled={(!jars.maven && !jars.gradle) || isWorkspaceLocked}
              >
                <Package className="h-3.5 w-3.5" />
              </button>
              {jarMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 rounded-md border border-border bg-surface shadow-lg z-50">
                  <button
                    onClick={() => downloadJar('maven')}
                    disabled={!jars.maven}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Maven
                  </button>
                  <button
                    onClick={() => downloadJar('gradle')}
                    disabled={!jars.gradle}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Gradle
                  </button>
                </div>
              )}
            </div>
            <Link to={`/project/${projectId}/settings`} className={cn("rounded-md p-1.5 text-text-dim hover:text-text-muted", isWorkspaceLocked && "opacity-40 pointer-events-none")} title="Settings">
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <div className={cn('flex h-full flex-col', mobileTab !== 'chat' && 'hidden')}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-text">AI Assistant</span>
            </div>
            <ChatPanel
              projectId={project.id}
              projectBridge={project.bridge}
              selectedModel={selectedModel}
              selectedSpeed={selectedSpeed}
              onModelChange={setSelectedModel}
              onSpeedChange={setSelectedSpeed}
              onRefreshFiles={refetchFiles}
              onFileSelect={handleFileSelect}
              autoFixPayload={autoFixPayload}
              onAutoFixComplete={() => setAutoFixPayload(null)}
              workspaceDisabled={isWorkspaceLocked}
              onAiRunningChange={setAiRunning}
              stopAiRef={stopAiRef}
            />
          </div>
          <div className={cn('h-full', mobileTab !== 'files' && 'hidden')}>
            <FileTreePanel files={files} filesLoading={filesLoading} refetchFiles={refetchFiles} onFileSelect={handleFileSelect} selectedFile={selectedFile} fileOps={fileOps} disabled={isWorkspaceLocked} />
          </div>
          <div className={cn('h-full', mobileTab !== 'code' && 'hidden')}>
            <EditorPanel projectId={project.id} selectedFile={selectedFile} fileOps={fileOps} disabled={isWorkspaceLocked} onExitGraphView={() => setSelectedFile(null)} />
          </div>
        </div>

        <nav className="flex h-14 shrink-0 items-center justify-around border-t border-border bg-surface" aria-label="Navigation">
          {mobileTabs.map((tab) => (
            <MobileTabButton key={tab.id} active={mobileTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => setMobileTab(tab.id)} />
          ))}
        </nav>
      </div>

        {/* Push to GitHub Modal */}
        {pushModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPushModalOpen(false)}>
            <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text mb-4">{needsRemote ? 'Set GitHub Repository' : 'Push to GitHub'}</h2>
              
              {needsRemote ? (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">Enter your GitHub repository URL to push code.</p>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text">Repository URL</label>
                    <input
                      type="text"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/username/repository.git"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPushModalOpen(false)}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetRemote}
                      disabled={!repoUrl.trim() || settingRemote}
                      className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {settingRemote ? 'Setting...' : 'Set Repository'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-text">Branch</label>
                      <div className="relative">
                        <CustomSelect
                          value={selectedBranch}
                          onChange={(v) => setSelectedBranch(v)}
                          options={branches.map((b) => ({ value: b, label: b }))}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-text">Commit Message</label>
                      <textarea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Update plugin code"
                        rows={3}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forcePush}
                        onChange={(e) => setForcePush(e.target.checked)}
                        className="rounded border-border"
                      />
                      Force push (overwrite remote changes)
                    </label>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => setPushModalOpen(false)}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePush}
                      disabled={!commitMessage.trim() || pushing}
                      className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {pushing ? 'Pushing...' : 'Push'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Review Code Modal */}
        {reviewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewModalOpen(false)}>
            <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text mb-2">Review Uncommitted Code</h2>
              <p className="text-sm text-text-muted mb-6">
                CodeRabbit will analyze your uncommitted changes and provide feedback on potential issues, bugs, and improvements.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setReviewModalOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReview}
                  disabled={reviewing || isWorkspaceLocked}
                  className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {reviewing ? 'Reviewing...' : 'Start Review'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reviewing Overlay */}
        {reviewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="rounded-lg bg-surface p-6 shadow-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium text-text">Reviewing Code...</p>
              <p className="text-xs text-text-muted mt-1">Please wait, this may take a minute</p>
            </div>
          </div>
        )}

        {/* Review Results Modal */}
        {reviewResults && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewResults(null)}>
            <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text mb-2">
                {reviewResults.issuesCount > 0 ? 'Issues Found' : 'Review Complete - No Issues'}
              </h2>
              <p className="text-sm text-text-muted mb-4">
                {reviewResults.issuesCount > 0 
                  ? `Found ${reviewResults.issuesCount} issue${reviewResults.issuesCount !== 1 ? 's' : ''} that need attention`
                  : 'Your code looks good!'
                }
              </p>
              
              {reviewResults.issues && reviewResults.issues.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {reviewResults.issues.map((issue: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          issue.severity === 'critical' ? 'bg-red-500/10 text-red-500' :
                          issue.severity === 'major' ? 'bg-orange-500/10 text-orange-500' :
                          issue.severity === 'minor' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-blue-500/10 text-blue-500'
                        }`}>
                          {issue.severity}
                        </span>
                        <span className="text-xs text-text-muted">{issue.fileName}</span>
                      </div>
                      <p className="text-sm text-text mb-2 whitespace-pre-wrap break-words">{issue.codegenInstructions}</p>
                      {issue.suggestions && issue.suggestions.length > 0 && (
                        <div className="text-xs text-text-dim">
                          Suggestions: {issue.suggestions.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-success mb-6">✓ No issues found! Code looks good.</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setReviewResults(null)
                    setSelectedIssues([])
                  }}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                >
                  Close
                </button>
                {reviewResults.status === 'passed' && reviewResults.issuesCount === 0 && (
                  <button
                    onClick={async () => {
                      setReviewResults(null)
                      handleOpenPushModal()
                      // Mark as pushed
                      if (reviewResults.reviewId) {
                        await fetch(`/api/projects/${projectId}/coderabbit/reviews/${reviewResults.reviewId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ status: 'pushed' }),
                        })
                      }
                    }}
                    className="flex-1 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90"
                  >
                    Push to GitHub
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Review History Modal */}
        {reviewHistoryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewHistoryOpen(false)}>
            <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text mb-4">Review History</h2>
              
              {reviewHistory.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No reviews yet</p>
              ) : (
                <div className="space-y-3">
                  {reviewHistory.map((review: any) => {
                    const isExpanded = expandedReviews.has(review.id)
                    
                    return (
                      <div key={review.id} className="rounded-lg border border-border bg-background overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                              review.status === 'passed' ? 'bg-success/10 text-success' :
                              review.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                              review.status === 'superseded' ? 'bg-gray-500/10 text-gray-500' :
                              review.status === 'pushed' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-yellow-500/10 text-yellow-500'
                            }`}>
                              {review.status}
                            </span>
                            <span className="text-xs text-text-muted">
                              {new Date(review.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-text">
                              {(() => {
                                if (review.status === 'passed' && (!review.issuesJson || review.issuesJson.length === 0)) {
                                  return 'No issue found'
                                }
                                const findings = review.issuesJson?.filter((i: any) => i.type === 'finding') || []
                                const fixedCount = findings.filter((i: any) => i._fixed).length
                                const remaining = findings.length - fixedCount
                                if (findings.length > 0 && fixedCount === findings.length) {
                                  return 'Issues were fixed'
                                }
                                if (remaining > 0 && fixedCount > 0) {
                                  return `${remaining} error${remaining !== 1 ? 's' : ''} remaining`
                                }
                                return findings.length > 0 ? `${findings.length} issue${findings.length !== 1 ? 's' : ''} found` : 'No issues'
                              })()}
                            </p>
                            {review.issuesJson && review.issuesJson.length > 0 && (
                              <button
                                 onClick={() => {
                                  const newExpanded = new Set(expandedReviews)
                                  if (isExpanded) {
                                    newExpanded.delete(review.id)
                                  } else {
                                    newExpanded.add(review.id)
                                  }
                                  setExpandedReviews(newExpanded)
                                }}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {isExpanded ? 'Hide' : 'Show'} Issues
                                <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {isExpanded && review.issuesJson && (
<div className="border-t border-border bg-surface/50 p-4 space-y-2">
                              <div className="flex items-center justify-between mb-2">
                                <button
                                  onClick={() => {
                                    const allSelected = review.issuesJson.every((_: any, idx: number) =>
                                      selectedIssues.some(s => s.reviewId === review.id && s.issueIdx === idx)
                                    )
                                    if (allSelected) {
                                      setSelectedIssues(prev => prev.filter(s => s.reviewId !== review.id))
                                    } else {
                                      setSelectedIssues(prev => {
                                        const others = prev.filter(s => s.reviewId !== review.id)
                                        const newSelections = review.issuesJson.map((_: any, idx: number) => ({ reviewId: review.id, issueIdx: idx }))
                                        return [...others, ...newSelections]
                                      })
                                    }
                                  }}
                                  className="text-xs text-primary hover:underline"
                                >
                                  {review.issuesJson.every((_: any, idx: number) =>
                                    selectedIssues.some(s => s.reviewId === review.id && s.issueIdx === idx)
                                  ) ? 'Deselect All' : 'Select All'}
                                </button>
                              </div>
                              
                              {review.issuesJson.map((issue: any, idx: number) => {
                                const issueId = `${review.id}-${idx}`
                                const isIssueExpanded = expandedIssues.has(issueId)
                                const isSelected = selectedIssues.some(s => s.reviewId === review.id && s.issueIdx === idx)
                                
                                return (
                                  <div key={idx} className="rounded-lg border border-border bg-background overflow-hidden">
                                    <div className="p-3 flex items-center gap-3">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleIssueSelection(review.id, idx)}
                                        className="shrink-0"
                                      />
                                    <button
                                      onClick={() => {
                                        const newExpanded = new Set(expandedIssues)
                                        if (isIssueExpanded) {
                                          newExpanded.delete(issueId)
                                        } else {
                                          newExpanded.add(issueId)
                                        }
                                        setExpandedIssues(newExpanded)
                                      }}
                                      className="flex-1 flex items-center justify-between hover:bg-surface/50 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                         <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                                           issue.severity === 'critical' ? 'bg-red-500/10 text-red-500' :
                                           issue.severity === 'major' ? 'bg-orange-500/10 text-orange-500' :
                                           issue.severity === 'minor' ? 'bg-yellow-500/10 text-yellow-500' :
                                           'bg-blue-500/10 text-blue-500'
                                         }`}>
                                           {issue.severity}
                                         </span>
                                         {issue._fixed === true && (
                                           <span className="rounded px-2 py-0.5 text-xs font-medium bg-success/10 text-success">
                                             FIXED
                                           </span>
                                         )}
                                         <span className="text-xs text-text-muted truncate max-w-[200px]">{issue.fileName}</span>
                                      </div>
                                      <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${isIssueExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>
                                  
                                  {isIssueExpanded && (
                                    <div className="border-t border-border p-3 bg-surface/30">
                                      <p className="text-sm text-text whitespace-pre-wrap break-words">{issue.codegenInstructions}</p>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            
                            {selectedIssues.length > 0 && (
                              <button
                                onClick={handleAutoFix}
                                disabled={isWorkspaceLocked}
                                className="w-full mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Auto Fix ({selectedIssues.length}) Issue{selectedIssues.length !== 1 ? 's' : ''}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <button
                onClick={() => setReviewHistoryOpen(false)}
                className="mt-6 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Reset from Git Modal */}
        {resetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResetModalOpen(false)}>
            <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text mb-2">Reset from Git</h2>
              <p className="text-sm text-destructive mb-4">⚠️ This will delete all local files and clone fresh from Git!</p>
              
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Branch (Optional)</label>
                  <input
                    type="text"
                    value={resetBranch}
                    onChange={(e) => setResetBranch(e.target.value)}
                    placeholder="main"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-text-muted">Leave empty to use current branch</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Commit Hash (Optional)</label>
                  <input
                    type="text"
                    value={resetCommit}
                    onChange={(e) => setResetCommit(e.target.value)}
                    placeholder="abc123def456..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-text-muted">Leave empty to use latest commit</p>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setResetModalOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {resetting ? 'Resetting...' : 'Reset Project'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disconnect GitHub Modal */}
        {disconnectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDisconnectModalOpen(false)}>
            <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text mb-2">Disconnect GitHub</h2>
              <p className="text-sm text-text-muted mb-6">
                Are you sure you want to disconnect your GitHub account (@{githubUsername})?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setDisconnectModalOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleGithubDisconnect()
                    setDisconnectModalOpen(false)
                  }}
                  className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Auto-Fix AI Model Selection Modal */}
      {autoFixModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setAutoFixModalOpen(false)}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Select AI Model</h2>
            <p className="text-sm text-text-muted mb-4">
              Choose which AI model to use for fixing {selectedIssues.length} issue{selectedIssues.length !== 1 ? 's' : ''}
            </p>
            
            <div className="space-y-2 mb-6">
              {AI_MODELS.filter(m => { if (!project.bridge) return true; const prefix = project.bridge === 'kiro' ? 'kiro/' : 'opencode/'; return m.id.startsWith(prefix) }).map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedModel === model.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-surface'
                  }`}
                >
                  <div className="font-medium text-sm text-text">{model.name}</div>
                  <div className="text-xs text-text-muted mt-1">{model.description}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAutoFixModalOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAutoFix()}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Start Fixing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-fix Confirmation Dialog */}
      {fixConfirmOpen && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/50 p-4" onClick={() => setFixConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Re-fix Issues?</h2>
            <p className="text-sm text-text-muted mb-6">You selected fixed issue(s). Do you want to continue?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setFixConfirmOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAutoFix(true)}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Git Connection Modal */}
      <GitConnectionModal
        isOpen={gitConnectModalOpen}
        onClose={() => setGitConnectModalOpen(false)}
        projectId={projectId ?? ''}
        githubConnected={githubConnected}
        githubUsername={githubUsername}
        repoConnected={gitStatus?.connected ?? false}
        repoUrl={gitStatus?.repoUrl ?? null}
        repoBranch={gitStatus?.repoBranch ?? null}
        onConnect={() => {
          fetchGitStatus()
          addToast('Repository connected successfully', 'success')
        }}
        onGithubConnect={handleGithubConnect}
        onDisconnectRepo={handleDisconnectRepo}
        onDisconnectGithub={() => {
          setGitConnectModalOpen(false)
          setDisconnectModalOpen(true)
        }}
      />
    </>
  )
}

  return (
    <div className="flex h-screen flex-col bg-background">
      <ToastContainer />
      {isWorkspaceLocked && (
        <div className="shrink-0 flex items-center justify-center gap-2 bg-primary/90 py-2 px-4 text-sm font-medium text-primary-foreground backdrop-blur animate-pulse z-50">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isReviewLocked ? 'Review is ongoing, please wait' : 'AI is generating code, please wait'}</span>
          {aiRunning && (
            <button
              onClick={() => stopAiRef.current?.()}
              className="ml-2 flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-xs text-destructive-foreground hover:bg-destructive/80"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          )}
        </div>
      )}
      {reviewLock?.status === 'error' && (
        <div className="shrink-0 flex items-center justify-between gap-2 bg-red-500/90 py-2 px-4 text-sm font-medium text-white backdrop-blur z-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{reviewLock.error || 'Review failed'}</span>
          </div>
          <button onClick={() => dismissReviewError(reviewLock.reviewId)} className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">Dismiss</button>
        </div>
      )}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-sm px-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-text-dim hover:text-text-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-medium text-text">{project.name}</span>
          <span className="rounded bg-accent px-2 py-0.5 text-xs text-text-dim">{SOFTWARE_LABELS[project.software] ?? project.software}</span>
          <span className="rounded bg-accent px-2 py-0.5 text-xs text-text-dim">{project.language}</span>
        </div>
        <div className="flex items-center gap-2">
          {isPaid && (
            <>
              {gitStatus?.connected ? (
                <>
                  <button
                    onClick={handleOpenPushModal}
                    disabled={isWorkspaceLocked}
                    className="rounded-md border border-border p-1.5 text-text-dim hover:bg-surface-hover hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Push to GitHub"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setResetModalOpen(true)}
                    disabled={isWorkspaceLocked}
                    className="rounded-md border border-orange-500 p-1.5 text-orange-500 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Reset from Git"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setGitConnectModalOpen(true)}
                    disabled={isWorkspaceLocked}
                    className="flex items-center gap-1.5 rounded-md border border-green-500 p-1.5 text-green-500 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`Connected: ${gitStatus.repoUrl?.replace('https://github.com/', '') || 'repo'}`}
                  >
                    <GitBranch className="h-4 w-4" />
                    <span className="text-[10px] font-medium">{gitStatus.repoBranch}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setGitConnectModalOpen(true)}
                  disabled={isWorkspaceLocked}
                  className="rounded-md border border-border p-1.5 text-text-dim hover:bg-surface-hover hover:text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Connect Git Repository"
                >
                  <GitBranch className="h-4 w-4" />
                </button>
              )}
              {coderabbitEnabled && gitStatus?.connected && (
                <>
                  <button
                    onClick={() => setReviewModalOpen(true)}
                    disabled={isWorkspaceLocked}
                    className="rounded-md border border-blue-500 p-1.5 text-blue-500 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Review Code"
                  >
                    <Shield className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (isWorkspaceLocked) return
                      fetchReviewHistory()
                      setReviewHistoryOpen(true)
                    }}
                    disabled={isWorkspaceLocked}
                    className="rounded-md border border-border p-1.5 text-text-dim hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Review History"
                  >
                    <ListTodo className="h-4 w-4" />
                  </button>
                </>
              )}
            </>
          )}
          <button
            onClick={toggleLayout}
            disabled={isWorkspaceLocked}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
            title={isChatFirst ? 'Switch to Code First' : 'Switch to Code First'}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {isChatFirst ? 'Chat First' : 'Code First'}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-1.5 text-xs font-medium text-success opacity-50"
            disabled
          >
            <Play className="h-3 w-3" />
            Compile
          </button>
          <GraphifyControls projectId={projectId ?? ''} isPaid={isPaid} onViewGraph={handleViewGraph} disabled={isWorkspaceLocked} />
          {isPaid && (
            <a
              href={`/api/projects/${projectId}/download/zip`}
              download
              className="rounded-md border border-border p-1.5 text-text-dim transition-colors hover:bg-surface-hover hover:text-text-muted"
              title="Download project as ZIP"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <Link
            to={`/project/${projectId}/settings`}
            className="rounded-md border border-border p-1.5 text-text-dim transition-colors hover:bg-surface-hover hover:text-text-muted"
            title="Project Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {isChatFirst ? (
          <>
            <aside className="flex w-[400px] shrink-0 flex-col border-r border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-text">AI Assistant</span>
              </div>
              <ChatPanel
              projectId={project.id}
              projectBridge={project.bridge}
              selectedModel={selectedModel}
              selectedSpeed={selectedSpeed}
              onModelChange={setSelectedModel}
              onSpeedChange={setSelectedSpeed}
              onRefreshFiles={refetchFiles}
              onFileSelect={handleFileSelect}
              autoFixPayload={autoFixPayload}
              onAutoFixComplete={() => setAutoFixPayload(null)}
              workspaceDisabled={isWorkspaceLocked}
              onAiRunningChange={setAiRunning}
              stopAiRef={stopAiRef}
            />
            </aside>

            <aside className="w-56 shrink-0 overflow-hidden border-r border-border">
              <FileTreePanel files={files} filesLoading={filesLoading} refetchFiles={refetchFiles} onFileSelect={handleFileSelect} selectedFile={selectedFile} fileOps={fileOps} disabled={isWorkspaceLocked} />
            </aside>

            <main className="flex-1 overflow-hidden">
              <EditorPanel projectId={project.id} selectedFile={selectedFile} fileOps={fileOps} disabled={isWorkspaceLocked} onExitGraphView={() => setSelectedFile(null)} />
            </main>
          </>
        ) : (
          <>
            <aside className="w-56 shrink-0 overflow-hidden border-r border-border">
              <FileTreePanel files={files} filesLoading={filesLoading} refetchFiles={refetchFiles} onFileSelect={handleFileSelect} selectedFile={selectedFile} fileOps={fileOps} disabled={isWorkspaceLocked} />
            </aside>

            <main className="flex-1 overflow-hidden">
              <EditorPanel projectId={project.id} selectedFile={selectedFile} fileOps={fileOps} disabled={isWorkspaceLocked} onExitGraphView={() => setSelectedFile(null)} />
            </main>

            <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-text">AI Assistant</span>
              </div>
              <ChatPanel
              projectId={project.id}
              projectBridge={project.bridge}
              selectedModel={selectedModel}
              selectedSpeed={selectedSpeed}
              onModelChange={setSelectedModel}
              onSpeedChange={setSelectedSpeed}
              onRefreshFiles={refetchFiles}
              onFileSelect={handleFileSelect}
              autoFixPayload={autoFixPayload}
              onAutoFixComplete={() => setAutoFixPayload(null)}
              workspaceDisabled={isWorkspaceLocked}
              onAiRunningChange={setAiRunning}
              stopAiRef={stopAiRef}
            />
            </aside>
          </>
        )}
      </div>

      {/* Push to GitHub Modal */}
      {pushModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPushModalOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-4">{needsRemote ? 'Set GitHub Repository' : 'Push to GitHub'}</h2>
            
            {needsRemote ? (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">Enter your GitHub repository URL to push code.</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">Repository URL</label>
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository.git"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPushModalOpen(false)}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSetRemote}
                    disabled={!repoUrl.trim() || settingRemote}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {settingRemote ? 'Setting...' : 'Set Repository'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text">Branch</label>
                    <div className="relative">
                      <CustomSelect
                        value={selectedBranch}
                        onChange={(v) => setSelectedBranch(v)}
                        options={branches.map((b) => ({ value: b, label: b }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text">Commit Message</label>
                    <textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Update plugin code"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forcePush}
                      onChange={(e) => setForcePush(e.target.checked)}
                      className="rounded border-border"
                    />
                    Force push (overwrite remote changes)
                  </label>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setPushModalOpen(false)}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePush}
                    disabled={!commitMessage.trim() || pushing}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pushing ? 'Pushing...' : 'Push'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Review Code Modal */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReviewModalOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Review Uncommitted Code</h2>
            <p className="text-sm text-text-muted mb-6">
              CodeRabbit will analyze your uncommitted changes and provide feedback on potential issues, bugs, and improvements.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setReviewModalOpen(false)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover">
                Cancel
              </button>
              <button onClick={handleReview} disabled={reviewing || isWorkspaceLocked} className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                {reviewing ? 'Reviewing...' : 'Start Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviewing Overlay */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-lg bg-surface p-6 shadow-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm font-medium text-text">Reviewing Code...</p>
            <p className="text-xs text-text-muted mt-1">Please wait, this may take a minute</p>
          </div>
        </div>
      )}

      {/* Review Results Modal */}
      {reviewResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReviewResults(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">
              {reviewResults.issuesCount > 0 ? 'Issues Found' : 'Review Complete - No Issues'}
            </h2>
            <p className="text-sm text-text-muted mb-4">
              {reviewResults.issuesCount > 0 
                ? `Found ${reviewResults.issuesCount} issue${reviewResults.issuesCount !== 1 ? 's' : ''} that need attention`
                : 'Your code looks good!'
              }
            </p>
            
            {reviewResults.issues && reviewResults.issues.length > 0 ? (
              <div className="space-y-3 mb-6">
                {reviewResults.issues.map((issue: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        issue.severity === 'critical' ? 'bg-red-500/10 text-red-500' :
                        issue.severity === 'major' ? 'bg-orange-500/10 text-orange-500' :
                        issue.severity === 'minor' ? 'bg-yellow-500/10 text-yellow-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {issue.severity}
                      </span>
                      <span className="text-xs text-text-muted">{issue.fileName}</span>
                    </div>
                    <p className="text-sm text-text mb-2 whitespace-pre-wrap break-words">{issue.codegenInstructions}</p>
                    {issue.suggestions && issue.suggestions.length > 0 && (
                      <div className="text-xs text-text-dim">
                        Suggestions: {issue.suggestions.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-success mb-6">✓ No issues found! Code looks good.</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setReviewResults(null); setSelectedIssues([]); }} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover">
                Close
              </button>
              {reviewResults.status === 'passed' && reviewResults.issuesCount === 0 && (
                <button
                  onClick={async () => {
                    setReviewResults(null)
                    handleOpenPushModal()
                    if (reviewResults.reviewId) {
                      await fetch(`/api/projects/${projectId}/coderabbit/reviews/${reviewResults.reviewId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ status: 'pushed' }),
                      })
                    }
                  }}
                  className="flex-1 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90"
                >
                  Push to GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review History Modal */}
      {reviewHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReviewHistoryOpen(false)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-4">Review History</h2>
            
            {reviewHistory.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No reviews yet</p>
            ) : (
              <div className="space-y-3">
                {reviewHistory.map((review: any) => {
                  const isExpanded = expandedReviews.has(review.id)
                  
                  return (
                    <div key={review.id} className="rounded-lg border border-border bg-background overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                            review.status === 'passed' ? 'bg-success/10 text-success' :
                            review.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                            review.status === 'superseded' ? 'bg-gray-500/10 text-gray-500' :
                            review.status === 'pushed' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {review.status}
                          </span>
                          <span className="text-xs text-text-muted">
                            {new Date(review.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                           <p className="text-sm text-text">
                             {(() => {
                               if (review.status === 'passed' && (!review.issuesJson || review.issuesJson.length === 0)) {
                                 return 'No issue found'
                               }
                               const findings = review.issuesJson?.filter((i: any) => i.type === 'finding') || []
                               const fixedCount = findings.filter((i: any) => i._fixed).length
                               const remaining = findings.length - fixedCount
                               if (findings.length > 0 && fixedCount === findings.length) {
                                 return 'Issues were fixed'
                               }
                               if (remaining > 0 && fixedCount > 0) {
                                 return `${remaining} error${remaining !== 1 ? 's' : ''} remaining`
                               }
                               return findings.length > 0 ? `${findings.length} issue${findings.length !== 1 ? 's' : ''} found` : 'No issues'
                             })()}
                           </p>
                           {review.issuesJson && review.issuesJson.length > 0 && (
                             <button
                               onClick={() => {
                                const newExpanded = new Set(expandedReviews)
                                if (isExpanded) {
                                  newExpanded.delete(review.id)
                                } else {
                                  newExpanded.add(review.id)
                                }
                                setExpandedReviews(newExpanded)
                              }}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              {isExpanded ? 'Hide' : 'Show'} Issues
                              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {isExpanded && review.issuesJson && (
                        <div className="border-t border-border bg-surface/50 p-4 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <button
                              onClick={() => {
                                const allSelected = review.issuesJson.every((_: any, idx: number) =>
                                  selectedIssues.some(s => s.reviewId === review.id && s.issueIdx === idx)
                                )
                                if (allSelected) {
                                  setSelectedIssues(prev => prev.filter(s => s.reviewId !== review.id))
                                } else {
                                  setSelectedIssues(prev => {
                                    const others = prev.filter(s => s.reviewId !== review.id)
                                    const newSelections = review.issuesJson.map((_: any, idx: number) => ({ reviewId: review.id, issueIdx: idx }))
                                    return [...others, ...newSelections]
                                  })
                                }
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              {review.issuesJson.every((_: any, idx: number) =>
                                selectedIssues.some(s => s.reviewId === review.id && s.issueIdx === idx)
                              ) ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                          
                          {review.issuesJson.map((issue: any, idx: number) => {
                            const issueId = `${review.id}-${idx}`
                            const isIssueExpanded = expandedIssues.has(issueId)
                            const isSelected = selectedIssues.some(s => s.reviewId === review.id && s.issueIdx === idx)
                            
                            return (
                              <div key={idx} className="rounded-lg border border-border bg-background overflow-hidden">
                                <div className="p-3 flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleIssueSelection(review.id, idx)}
                                    className="shrink-0"
                                  />
                                  <button
                                    onClick={() => {
                                      const newExpanded = new Set(expandedIssues)
                                      if (isIssueExpanded) {
                                        newExpanded.delete(issueId)
                                      } else {
                                        newExpanded.add(issueId)
                                      }
                                      setExpandedIssues(newExpanded)
                                    }}
                                    className="flex-1 flex items-center justify-between hover:bg-surface/50 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                       <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                                         issue.severity === 'critical' ? 'bg-red-500/10 text-red-500' :
                                         issue.severity === 'major' ? 'bg-orange-500/10 text-orange-500' :
                                         issue.severity === 'minor' ? 'bg-yellow-500/10 text-yellow-500' :
                                         'bg-blue-500/10 text-blue-500'
                                       }`}>
                                         {issue.severity}
                                       </span>
                                       {issue._fixed === true && (
                                         <span className="rounded px-2 py-0.5 text-xs font-medium bg-success/10 text-success">
                                           FIXED
                                         </span>
                                       )}
                                       <span className="text-xs text-text-muted truncate max-w-[200px]">{issue.fileName}</span>
                                    </div>
                                    <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${isIssueExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                </div>
                                
                                {isIssueExpanded && (
                                  <div className="border-t border-border p-3 bg-surface/30">
                                    <p className="text-sm text-text whitespace-pre-wrap break-words">{issue.codegenInstructions}</p>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          
                          {selectedIssues.length > 0 && (
                            <button
                              onClick={handleAutoFix}
                              disabled={isWorkspaceLocked}
                              className="w-full mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Auto Fix ({selectedIssues.length}) Issue{selectedIssues.length !== 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <button onClick={() => setReviewHistoryOpen(false)} className="mt-6 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Reset from Git Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setResetModalOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Reset from Git</h2>
            <p className="text-sm text-destructive mb-4">⚠️ This will delete all local files and clone fresh from Git!</p>
            
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text">Branch (Optional)</label>
                <input
                  type="text"
                  value={resetBranch}
                  onChange={(e) => setResetBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-text-muted">Leave empty to use current branch</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text">Commit Hash (Optional)</label>
                <input
                  type="text"
                  value={resetCommit}
                  onChange={(e) => setResetCommit(e.target.value)}
                  placeholder="abc123def456..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-text-muted">Leave empty to use latest commit</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setResetModalOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect GitHub Modal */}
      {disconnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDisconnectModalOpen(false)}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Disconnect GitHub</h2>
            <p className="text-sm text-text-muted mb-6">
              Are you sure you want to disconnect your GitHub account (@{githubUsername})?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDisconnectModalOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleGithubDisconnect()
                  setDisconnectModalOpen(false)
                }}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Fix AI Model Selection Modal */}
      {autoFixModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setAutoFixModalOpen(false)}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Select AI Model</h2>
            <p className="text-sm text-text-muted mb-4">
              Choose which AI model to use for fixing {selectedIssues.length} issue{selectedIssues.length !== 1 ? 's' : ''}
            </p>
            
            <div className="space-y-2 mb-6">
              {AI_MODELS.filter(m => { if (!project.bridge) return true; const prefix = project.bridge === 'kiro' ? 'kiro/' : 'opencode/'; return m.id.startsWith(prefix) }).map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedModel === model.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-surface'
                  }`}
                >
                  <div className="font-medium text-sm text-text">{model.name}</div>
                  <div className="text-xs text-text-muted mt-1">{model.description}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAutoFixModalOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAutoFix()}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Start Fixing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-fix Confirmation Dialog */}
      {fixConfirmOpen && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/50 p-4" onClick={() => setFixConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text mb-2">Re-fix Issues?</h2>
            <p className="text-sm text-text-muted mb-6">
              You selected fixed issue(s). Do you want to continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setFixConfirmOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAutoFix(true)}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Git Connection Modal - Desktop */}
      <GitConnectionModal
        isOpen={gitConnectModalOpen}
        onClose={() => setGitConnectModalOpen(false)}
        projectId={projectId ?? ''}
        githubConnected={githubConnected}
        githubUsername={githubUsername}
        repoConnected={gitStatus?.connected ?? false}
        repoUrl={gitStatus?.repoUrl ?? null}
        repoBranch={gitStatus?.repoBranch ?? null}
        onConnect={() => {
          fetchGitStatus()
          addToast('Repository connected successfully', 'success')
        }}
        onGithubConnect={handleGithubConnect}
        onDisconnectRepo={handleDisconnectRepo}
        onDisconnectGithub={() => {
          setGitConnectModalOpen(false)
          setDisconnectModalOpen(true)
        }}
      />
    </div>
  )
}
