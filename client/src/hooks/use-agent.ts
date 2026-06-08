import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiClient } from '@/lib/api'
import type {
  AgentSession,
  AgentSessionWithMessages,
  AgentMessage,
  AgentLog,
  StreamEvent,
  StreamingState,
  StreamingItem,
  FileTreeEntry,
  StreamTodoItem,
} from '@/types'

export function useAgentSessions(projectId: string) {
  const queryClient = useQueryClient()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'agent', 'sessions'],
    queryFn: () => api.get<AgentSession[]>(`/projects/${projectId}/agent/sessions`),
    enabled: !!projectId,
  })

  const createSessionMutation = useMutation({
    mutationFn: (body?: { bridge?: 'opencode' | 'kiro' }) =>
      api.post<AgentSession>(`/projects/${projectId}/agent/sessions`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'sessions'] })
    },
  })

  const cancelSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      api.post<AgentSession>(`/projects/${projectId}/agent/sessions/${sessionId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'sessions'] })
    },
  })

  return {
    sessions: sessions ?? [],
    isLoading,
    createSession: createSessionMutation.mutateAsync,
    isCreatingSession: createSessionMutation.isPending,
    cancelSession: cancelSessionMutation.mutateAsync,
    isCancellingSession: cancelSessionMutation.isPending,
  }
}

export function useAgentSession(projectId: string, sessionId: string) {
  const queryClient = useQueryClient()

  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ['projects', projectId, 'agent', 'sessions', sessionId],
    queryFn: () => api.get<AgentSessionWithMessages>(`/projects/${projectId}/agent/sessions/${sessionId}`),
    enabled: !!projectId && !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && (data.status === 'running' || data.status === 'idle')) {
        return 2000
      }
      return false
    },
  })

  const invalidateAndRefetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'sessions', sessionId] })
    void refetch()
  }, [queryClient, projectId, sessionId, refetch])

  const sendMessageMutation = useMutation({
    mutationFn: ({ content, model, bridge, speed, displayContent, promptToolJobId }: { content: string; model?: string; bridge?: 'opencode' | 'kiro'; speed?: string; displayContent?: string; promptToolJobId?: string }) =>
      api.post<AgentMessage>(`/projects/${projectId}/agent/sessions/${sessionId}/messages`, { content, model, bridge, speed, displayContent, promptToolJobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'sessions', sessionId] })
    },
  })

  const cancelSessionMutation = useMutation({
    mutationFn: () =>
      api.post<AgentSession>(`/projects/${projectId}/agent/sessions/${sessionId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'sessions', sessionId] })
    },
  })

  return {
    session: session ?? null,
    messages: session?.messages ?? [],
    isLoading,
    sendMessage: sendMessageMutation.mutateAsync,
    isSending: sendMessageMutation.isPending,
    sendError: sendMessageMutation.error,
    invalidateAndRefetch,
    cancelSession: cancelSessionMutation.mutateAsync,
    isCancelling: cancelSessionMutation.isPending,
  }
}

export function useAgentLogs(projectId: string, sessionId: string) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'agent', 'sessions', sessionId, 'logs'],
    queryFn: () => api.get<AgentLog[]>(`/projects/${projectId}/agent/sessions/${sessionId}/logs`),
    enabled: !!projectId && !!sessionId,
    refetchInterval: 3000,
  })

  return {
    logs: logs ?? [],
    isLoading,
  }
}

// ── Mutable accumulator for streaming events (not React state) ───────

interface PendingTransition {
  id: string
  status: 'completed' | 'error'
  at: number
}

interface StreamAccumulator {
  items: StreamingItem[]
  itemById: Map<string, StreamingItem>
  todos: StreamTodoItem[]
  isStreaming: boolean
  completed: boolean
  fileChanges: string[]
  nextOrder: number
  pendingTransitions: PendingTransition[]
  activeStream: boolean
  textBuffer: string
  inThinkingBlock: boolean
  // id of the live thinking item currently being filled (inline <think> parsing)
  thinkingItemId: string | null
  // tail held back from the last delta in case it is the prefix of a split tag
  carry: string
}

function createEmptyAccumulator(): StreamAccumulator {
  return {
    items: [],
    itemById: new Map(),
    todos: [],
    isStreaming: false,
    completed: false,
    fileChanges: [],
    nextOrder: 0,
    pendingTransitions: [],
    activeStream: false,
    textBuffer: '',
    inThinkingBlock: false,
    thinkingItemId: null,
    carry: '',
  }
}

function snapshotAccumulator(acc: StreamAccumulator): StreamingState {
  const now = Date.now()
  for (let i = acc.pendingTransitions.length - 1; i >= 0; i--) {
    const t = acc.pendingTransitions[i]
    if (now >= t.at) {
      const item = acc.itemById.get(t.id)
      if (item && item.kind === 'file-op') item.fileStatus = t.status
      acc.pendingTransitions.splice(i, 1)
    }
  }
  return {
    items: acc.items.filter(item => item.kind !== 'text' || item.textContent),
    todos: acc.todos,
    isStreaming: acc.isStreaming,
    fileChanges: [...acc.fileChanges],
  }
}

const EMPTY_STREAMING_STATE: StreamingState = {
  items: [],
  todos: [],
  isStreaming: false,
  fileChanges: [],
}

/**
 * Strip inline thinking tags from plain text. This is a safety net for edge cases
 * where thinking tag markers leak through the stateful parser (e.g. orphaned
 * opening tags without closing). The primary extraction is done by
 * processThoughtTags() which tracks thinking blocks across streaming deltas.
 */
function stripThinkingTags(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
}

// Opening / closing tags recognised by the streaming thinking parser.
// DeepSeek native uses <think>; generic models use <thinking>/<reasoning>.
const OPEN_TAGS = ['<think>', '<thinking>', '<reasoning>']
const CLOSE_TAGS = ['</think>', '</thinking>', '</reasoning>']
const MAX_TAG_LEN = Math.max(...OPEN_TAGS.map((t) => t.length), ...CLOSE_TAGS.map((t) => t.length))

function findFirstTag(s: string, tags: string[]): { idx: number; len: number } {
  let best = { idx: -1, len: 0 }
  const lower = s.toLowerCase()
  for (const t of tags) {
    const i = lower.indexOf(t)
    if (i !== -1 && (best.idx === -1 || i < best.idx)) {
      best = { idx: i, len: t.length }
    }
  }
  return best
}

// Length of the trailing run of `s` that could be the start of any tag in
// `tags` (e.g. "<thin" is a prefix of "<thinking>"). That suffix is held back
// across delta boundaries so a tag split between two deltas is still matched.
function danglingTagPrefixLen(s: string, tags: string[]): number {
  const maxLook = Math.min(s.length, MAX_TAG_LEN - 1)
  const lower = s.toLowerCase()
  for (let n = maxLook; n > 0; n--) {
    const tail = lower.slice(s.length - n)
    if (tags.some((t) => t.startsWith(tail))) return n
  }
  return 0
}

/**
 * Stateful parser that extracts thinking blocks from streaming text deltas and
 * renders them as a LIVE "Thinking..." badge that fills in as content streams.
 *
 * DeepSeek models (e.g. DeepSeek V4 Pro via Blueminds) emit reasoning inline as
 * <think>...</think> plain text rather than native reasoning parts. Because
 * deltas arrive in small fragments, a single thinking block — or even a single
 * tag — may span many deltas. This function tracks per-accumulator state across
 * calls to handle that correctly:
 *
 * - Outside a thinking block: scans for an opening tag (<think>, <thinking>,
 *   <reasoning>). Text before it is emitted as normal text. The moment a tag is
 *   seen, a thinking item is created immediately with done:false (ongoing badge).
 * - Inside a thinking block: appends streamed content to the live thinking item
 *   as it arrives, until the matching closing tag is found, then marks done:true.
 * - Split tags: a trailing partial tag (e.g. a delta ending in "<thin") is held
 *   back in acc.carry and re-examined when the next delta arrives, so tags
 *   straddling a delta boundary are never leaked as visible text.
 *
 * Call flushThoughtTags() on stream completion to emit any held-back carry.
 */
function processThoughtTags(acc: StreamAccumulator, rawContent: string): void {
  if (!rawContent) return
  // Prepend any partial tag held back from the previous delta.
  let remaining = acc.carry + rawContent
  acc.carry = ''

  const addText = (rawText: string) => {
    if (!rawText) return
    // Safety net: the streaming parser above already routes tags, but strip any
    // complete tag pair that slipped through so markers never reach the chat.
    const text = stripThinkingTags(rawText)
    if (!text) return
    const lastItem = acc.items[acc.items.length - 1]
    if (lastItem && lastItem.kind === 'text') {
      lastItem.textContent = (lastItem.textContent || '') + text
    } else {
      acc.items.push({
        id: `text-${acc.nextOrder++}`,
        kind: 'text',
        order: acc.nextOrder,
        textContent: text,
      })
    }
  }

  const openThinking = () => {
    acc.inThinkingBlock = true
    const id = `think-${acc.nextOrder++}`
    const item: StreamingItem = {
      id,
      kind: 'thinking',
      order: acc.nextOrder,
      thinkingContent: '',
      thinkingDone: false,
    }
    acc.items.push(item)
    acc.itemById.set(id, item)
    acc.thinkingItemId = id
  }

  const appendThinking = (text: string) => {
    if (!text) return
    const item = acc.thinkingItemId ? acc.itemById.get(acc.thinkingItemId) : undefined
    if (item && item.kind === 'thinking') {
      item.thinkingContent = (item.thinkingContent || '') + text
    }
  }

  const closeThinking = () => {
    const item = acc.thinkingItemId ? acc.itemById.get(acc.thinkingItemId) : undefined
    if (item && item.kind === 'thinking') {
      item.thinkingContent = (item.thinkingContent || '').trim()
      item.thinkingDone = true
    }
    acc.inThinkingBlock = false
    acc.thinkingItemId = null
  }

  // Loop until the whole delta is consumed (handles multiple blocks per delta).
  while (remaining) {
    if (acc.inThinkingBlock) {
      const close = findFirstTag(remaining, CLOSE_TAGS)
      if (close.idx !== -1) {
        appendThinking(remaining.slice(0, close.idx))
        remaining = remaining.slice(close.idx + close.len)
        closeThinking()
        continue
      }
      // No closing tag yet. Hold back a possible partial closing tag; stream
      // the rest into the live badge now.
      const hold = danglingTagPrefixLen(remaining, CLOSE_TAGS)
      if (hold > 0) {
        appendThinking(remaining.slice(0, remaining.length - hold))
        acc.carry = remaining.slice(remaining.length - hold)
      } else {
        appendThinking(remaining)
      }
      return
    }

    // Outside a thinking block: look for an opening tag.
    const open = findFirstTag(remaining, OPEN_TAGS)
    if (open.idx !== -1) {
      addText(remaining.slice(0, open.idx))
      remaining = remaining.slice(open.idx + open.len)
      openThinking()
      continue
    }

    // No opening tag. Emit text, but hold back a possible partial opening tag.
    const hold = danglingTagPrefixLen(remaining, OPEN_TAGS)
    if (hold > 0) {
      addText(remaining.slice(0, remaining.length - hold))
      acc.carry = remaining.slice(remaining.length - hold)
    } else {
      addText(remaining)
    }
    return
  }
}

// Flush any held-back partial tag when the stream ends. If a thinking block was
// left open (no closing tag ever arrived), close it so the badge stops spinning.
function flushThoughtTags(acc: StreamAccumulator): void {
  if (acc.carry) {
    const carry = acc.carry
    acc.carry = ''
    if (acc.inThinkingBlock) {
      const item = acc.thinkingItemId ? acc.itemById.get(acc.thinkingItemId) : undefined
      if (item && item.kind === 'thinking') {
        item.thinkingContent = (item.thinkingContent || '') + carry
      }
    } else {
      const lastItem = acc.items[acc.items.length - 1]
      if (lastItem && lastItem.kind === 'text') {
        lastItem.textContent = (lastItem.textContent || '') + carry
      } else {
        acc.items.push({ id: `text-${acc.nextOrder++}`, kind: 'text', order: acc.nextOrder, textContent: carry })
      }
    }
  }
  if (acc.inThinkingBlock && acc.thinkingItemId) {
    const item = acc.itemById.get(acc.thinkingItemId)
    if (item && item.kind === 'thinking') {
      item.thinkingContent = (item.thinkingContent || '').trim()
      item.thinkingDone = true
    }
    acc.inThinkingBlock = false
    acc.thinkingItemId = null
  }
}

function processStreamEvent(acc: StreamAccumulator, event: StreamEvent): void {
  switch (event.type) {
    case 'text-delta': {
      processThoughtTags(acc, event.content)
      break
      }

    case 'thinking': {
      const existing = acc.itemById.get(event.id)
      if (existing && existing.kind === 'thinking') {
        existing.thinkingContent = (existing.thinkingContent || '') + event.content
        existing.thinkingDone = event.done
      } else {
        const item: StreamingItem = {
          id: event.id,
          kind: 'thinking',
          order: acc.nextOrder++,
          thinkingContent: event.content,
          thinkingDone: event.done,
        }
        acc.items.push(item)
        acc.itemById.set(item.id, item)
      }
      break
    }

    case 'file-op': {
      if (!acc.isStreaming && !acc.activeStream) {
        acc.isStreaming = true
        acc.activeStream = true
      }
      const existing = acc.itemById.get(event.id)
      if (existing && existing.kind === 'file-op') {
        existing.fileAction = event.action
        existing.filePath = event.path
        existing.fileNewPath = event.newPath
        existing.fileStatus = event.status
        existing.fileTool = event.tool
      } else {
        // Deduplicate: skip if we already have a badge for the same path + action
        if (acc.items.some((item) => item.kind === 'file-op' && item.filePath === event.path && item.fileAction === event.action)) break

        const showRunning = event.status === 'completed' || event.status === 'error'
        const item: StreamingItem = {
          id: event.id,
          kind: 'file-op',
          order: acc.nextOrder++,
          fileAction: event.action,
          filePath: event.path,
          fileNewPath: event.newPath,
          fileStatus: showRunning ? 'running' : event.status,
          fileTool: event.tool,
        }
        acc.items.push(item)
        acc.itemById.set(item.id, item)
        if (showRunning) {
          acc.pendingTransitions.push({ id: event.id, status: event.status as 'completed' | 'error', at: Date.now() + 600 })
        }
      }
      break
    }

    case 'question': {
      if (!acc.isStreaming && !acc.activeStream) {
        acc.isStreaming = true
        acc.activeStream = true
      }
      const existing = acc.itemById.get(event.id)
      if (existing && existing.kind === 'question') {
        existing.questionText = event.question
        existing.questionStatus = event.status
      } else {
        const item: StreamingItem = {
          id: event.id,
          kind: 'question',
          order: acc.nextOrder++,
          questionText: event.question,
          questionStatus: event.status,
        }
        acc.items.push(item)
        acc.itemById.set(item.id, item)
      }
      break
    }

    case 'todo':
      acc.todos = event.items
      break

    case 'status':
      if (event.status === 'running' && !acc.completed) {
        acc.isStreaming = true
        acc.activeStream = true
      }
      break

    case 'file-change':
      if (!acc.fileChanges.includes(event.file)) {
        acc.fileChanges.push(event.file)
      }
      break

    case 'complete':
      // Flush any held-back partial tag and close a still-open thinking badge.
      flushThoughtTags(acc)
      acc.isStreaming = false
      acc.completed = true
      acc.activeStream = false
      break

    case 'error': {
      // Stop streaming and show error message
      flushThoughtTags(acc)
      acc.isStreaming = false
      acc.activeStream = false

      // Add error message as text
      const errorText = `\n\n⚠️ **Error:** ${event.message}\n\n${
        event.message.includes('usage exceeded') || event.message.includes('rate limit')
          ? 'The AI service has reached its usage limit. Please try again later or use a different model.'
          : 'An error occurred while processing your request.'
      }`
      
      if (acc.textBuffer) {
        acc.textBuffer += errorText
      } else {
        acc.textBuffer = errorText
      }
      
      break
    }
  }
}

/** Streams live deltas; SSE buffer replay clears duplicate risk by resetting accumulators on connect. */
export function useStreamingAgent(
  projectId: string,
  sessionId: string,
  isActive: boolean,
  sessionStatus?: AgentSession['status'] | null,
) {
  const accRef = useRef<StreamAccumulator>(createEmptyAccumulator())
  const dirtyRef = useRef(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const [snapshot, setSnapshot] = useState<StreamingState>(EMPTY_STREAMING_STATE)
  const [isConnected, setIsConnected] = useState(false)
  const storageKey = `auroracraft-stream:${projectId}:${sessionId}`

  useEffect(() => {
    if (!projectId || !sessionId) return
    accRef.current = createEmptyAccumulator()
    dirtyRef.current = false
    setSnapshot(EMPTY_STREAMING_STATE)
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [projectId, sessionId, storageKey])

  const clearStreamStorageAndAcc = useCallback(() => {
    accRef.current = createEmptyAccumulator()
    dirtyRef.current = false
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore storage failures
    }
  }, [storageKey])

  // Persisted chats only: never hydrate stream overlays from disk (those rows duplicate agent messages).
  useEffect(() => {
    if (!projectId || !sessionId) return
    const terminal =
      sessionStatus === 'completed' || sessionStatus === 'failed' || sessionStatus === 'cancelled'
    if (terminal) {
      clearStreamStorageAndAcc()
      setSnapshot(EMPTY_STREAMING_STATE)
    }
  }, [projectId, sessionId, sessionStatus, clearStreamStorageAndAcc])

  // Periodic state sync (batches rapid events into ~60fps renders for smooth streaming)
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(() => {
      const hasDueTransitions = accRef.current.pendingTransitions.some(t => Date.now() >= t.at)
      if (dirtyRef.current || hasDueTransitions) {
        dirtyRef.current = false
        const nextSnapshot = snapshotAccumulator(accRef.current)
        setSnapshot(nextSnapshot)
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(nextSnapshot))
        } catch {
          // ignore storage failures
        }
      }
    }, 16)

    return () => clearInterval(interval)
  }, [isActive, storageKey])

  // EventSource connection
  useEffect(() => {
    if (!isActive || !projectId || !sessionId) {
      return
    }

    const url = `/api/projects/${projectId}/agent/sessions/${sessionId}/stream`
    const es = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = es

    es.onopen = () => {
      setIsConnected(true)
      // Server replays buffered OpenCode events per connection; wiping local accumulator avoids
      // doubling content that was persisted in localStorage before refresh.
      setSnapshot(EMPTY_STREAMING_STATE)
      accRef.current = createEmptyAccumulator()
      dirtyRef.current = true
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // ignore storage failures
      }
    }

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as StreamEvent
        processStreamEvent(accRef.current, event)
        dirtyRef.current = true
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects; we track connection state
      setIsConnected(false)
    }

    return () => {
      es.close()
      eventSourceRef.current = null
      setIsConnected(false)
    }
  }, [projectId, sessionId, isActive, storageKey])

  const resetStream = useCallback(() => {
    accRef.current = createEmptyAccumulator()
    dirtyRef.current = false
    setSnapshot(EMPTY_STREAMING_STATE)
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore storage failures
    }
  }, [storageKey])

  return {
    streamingState: snapshot,
    isConnected,
    resetStream,
  }
}

export function useProjectFiles(projectId: string) {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects', projectId, 'files'],
    queryFn: () => api.get<{ files: FileTreeEntry[] }>(`/projects/${projectId}/files`),
    enabled: !!projectId,
  })

  const refetchWithContent = useCallback(() => {
    void refetch()
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'files', 'content'] })
  }, [refetch, queryClient, projectId])

  return {
    files: data?.files ?? [],
    isLoading,
    refetch: refetchWithContent,
  }
}

export function useFileContent(projectId: string, filePath: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'files', 'content', filePath],
    queryFn: () => api.get<{ content: string; path: string }>(`/projects/${projectId}/files/content?path=${encodeURIComponent(filePath!)}`),
    enabled: !!projectId && !!filePath,
  })

  return {
    content: data?.content ?? null,
    isLoading,
    error,
  }
}

export function useFileOperations(projectId: string) {
  const queryClient = useQueryClient()

  const invalidateFiles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'files'] })
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'files', 'content'] })
  }, [queryClient, projectId])

  const createMutation = useMutation({
    mutationFn: ({ path, type }: { path: string; type: 'file' | 'directory' }) =>
      api.post<{ success: boolean; path: string; type: string }>(`/projects/${projectId}/files/create`, { path, type }),
    onSuccess: () => invalidateFiles(),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ path }: { path: string }) =>
      apiClient.delete(`/projects/${projectId}/files/delete`, { data: { path } }).then(() => undefined),
    onSuccess: () => invalidateFiles(),
  })

  const renameMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      api.post<{ success: boolean; oldPath: string; newPath: string }>(`/projects/${projectId}/files/rename`, { oldPath, newPath }),
    onSuccess: () => invalidateFiles(),
  })

  const saveMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.put<{ success: boolean; path: string }>(`/projects/${projectId}/files/content`, { path, content }),
    onSuccess: () => invalidateFiles(),
  })

  return {
    createFile: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteFile: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    renameFile: renameMutation.mutateAsync,
    isRenaming: renameMutation.isPending,
    saveFile: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  }
}
