import { useState, useEffect, useCallback } from 'react'
import {
  File,
  FilePenLine,
  Folder,
  FolderOpen,
  FilePlus2,
  FolderPlus,
  ChevronRight,
  RefreshCw,
  Pencil,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  Network,
  X,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { cn } from '@/lib/utils'
import type { AxiosError } from 'axios'
import type { FileTreeEntry } from '@/types'
import { useFileContent, useFileOperations } from '@/hooks/use-agent'
import { GlassyPromptModal, GlassyConfirmModal } from '@/components/ui/glassy'

/**
 * Self-contained file tree + Monaco editor panels, shared by the user workspace's
 * inline copies and the admin workspace page. They are fully prop-driven (no page
 * coupling) and talk to the standard `/api/projects/:id/files*` endpoints via the
 * `use-agent` hooks — which the backend allows admins to call on any project.
 */

/** Sentinel `selectedFile` value that renders the Graphify web view instead of Monaco. */
const GRAPH_VIEW_PATH = '__graphify_graph_view__'

function getErrorMessage(err: unknown): string {
  const axErr = err as AxiosError<{ message?: string }>
  return axErr?.response?.data?.message ?? 'An unexpected error occurred'
}

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

export function FileTreePanel({ files, filesLoading, refetchFiles, onFileSelect, selectedFile, fileOps, disabled }: {
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

export function EditorPanel({ projectId, selectedFile, fileOps, disabled, onExitGraphView }: { projectId: string; selectedFile: string | null; fileOps: ReturnType<typeof useFileOperations>; disabled?: boolean; onExitGraphView?: () => void }) {
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
            Select a file from the file tree to view or edit its contents.
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
