import type { BridgeInterface, BridgeTask, BridgeResult, BridgeStreamEvent, MessagePart, TodoItem, StreamEvent } from './types.js'
import { processManager } from './opencode-process-manager.js'
import { AGENT_SYSTEM_PROMPT } from './system-prompt.js'
import { existsSync } from 'fs'
import { join } from 'path'
import { estimateTokens } from '../config/ai-models.js'

// No default model override — let OpenCode use its configured default

// ── OpenCode API response types ──────────────────────────────────────

interface OpenCodeSession {
  id: string
  projectID?: string
  directory?: string
  title?: string
}

interface OpenCodePart {
  id?: string
  sessionID?: string
  messageID?: string
  type?: string
  text?: string
  tool?: string
  callID?: string
  state?: {
    status?: string
    input?: Record<string, unknown>
    output?: string
    title?: string
    metadata?: Record<string, unknown>
    error?: string
    time?: { start?: number; end?: number }
  }
  time?: { start?: number; end?: number }
  [key: string]: unknown
}

interface OpenCodeEvent {
  type: string
  properties: Record<string, unknown>
}

interface OpenCodeMessage {
  info?: {
    role?: string
    sessionID?: string
    id?: string
    time?: { created?: number; completed?: number }
    [key: string]: unknown
  }
  parts?: OpenCodePart[]
  [key: string]: unknown
}

interface OpenCodeTodo {
  id?: string
  content?: string
  status?: string
  priority?: string
}

// ── Thinking tag parser ────────────────────────────────────────────────
// Extracts <thinking>...</thinking> and DeepSeek  ...\think  blocks from
// plain text and converts them to thinking parts. Used when models (e.g.
// DeepSeek via Fireworks) emit reasoning as regular text instead of native
// reasoning parts.

const THINKING_TAG_RE = /<thinking>([\s\S]*?)<\/thinking>/gi
const REASONING_TAG_RE = /<reasoning>([\s\S]*?)<\/reasoning>/gi
const DEEPSEEK_THINKING_RE = /(?:^|[\n\r])\s*<think>([\s\S]*?)<\/think>(?:\s*|[\n\r])/gi

function parseThinkingTags(text: string): MessagePart[] {
  if (!text) return []
  const parts: MessagePart[] = []
  let lastIndex = 0

  // Collect all tag matches (<thinking>, <reasoning>, DeepSeek <think>)
  const matches: Array<{ index: number; end: number; content: string }> = []
  let m: RegExpExecArray | null

  const thinkingRe = new RegExp(THINKING_TAG_RE.source, THINKING_TAG_RE.flags)
  while ((m = thinkingRe.exec(text)) !== null) {
    matches.push({ index: m.index, end: thinkingRe.lastIndex, content: m[1].trim() })
  }

  const reasoningRe = new RegExp(REASONING_TAG_RE.source, REASONING_TAG_RE.flags)
  while ((m = reasoningRe.exec(text)) !== null) {
    matches.push({ index: m.index, end: reasoningRe.lastIndex, content: m[1].trim() })
  }

  const deepseekRe = new RegExp(DEEPSEEK_THINKING_RE.source, DEEPSEEK_THINKING_RE.flags)
  while ((m = deepseekRe.exec(text)) !== null) {
    matches.push({ index: m.index, end: deepseekRe.lastIndex, content: m[1].trim() })
  }

  // Sort by position
  matches.sort((a, b) => a.index - b.index)

  for (const match of matches) {
    const before = text.slice(lastIndex, match.index).trim()
    if (before) parts.push({ type: 'text', content: before })
    parts.push({ type: 'thinking', content: match.content })
    lastIndex = match.end
  }

  const after = text.slice(lastIndex).trim()
  if (after) parts.push({ type: 'text', content: after })

  // If no tags found, return the original text as a single text part
  if (parts.length === 0) return [{ type: 'text', content: text }]
  return parts
}

// ── File action mapping ──────────────────────────────────────────────

type FileAction = 'create' | 'update' | 'delete' | 'rename' | 'read'

const TOOL_TO_FILE_ACTION: Record<string, FileAction> = {
  write: 'create', file_write: 'create', create: 'create', create_file: 'create', createFile: 'create',
  edit: 'update', file_edit: 'update', str_replace: 'update', str_replace_editor: 'update',
  patch: 'update', apply_diff: 'update', file_patch: 'update',
  delete: 'delete', file_delete: 'delete', remove: 'delete', rm: 'delete',
  rename: 'rename', move: 'rename', mv: 'rename', file_rename: 'rename',
  read: 'read', file_read: 'read', cat: 'read', read_file: 'read', readFile: 'read',
}

const BUILD_ARTIFACT_RE = [
  /^target\//i,
  /^build\//i,
  /^out\//i,
  /^\.gradle\//i,
  /^\.mvn\//i,
  /(?:^|\/)(?:classes|generated|generated-sources|generated-test-sources|tmp|libs|reports|test-results)\//i,
  /\.(?:class|jar|war|ear|lst|properties|pom|sha1|md5)$/i,
  /(?:^|\/)(?:createdFiles|inputFiles)\.lst$/i,
  /(?:^|\/)consumer.*\.pom$/i,
]

function extractFilePath(input: Record<string, unknown>): string {
  return String(input.path ?? input.filePath ?? input.file_path ?? input.filename ?? input.file ?? input.target ?? input.source ?? '')
}

function extractNewPath(input: Record<string, unknown>): string {
  return String(input.new_path ?? input.newFilePath ?? input.destination ?? input.target ?? input.newPath ?? '')
}

function isBuildArtifactPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  return BUILD_ARTIFACT_RE.some((pattern) => pattern.test(normalized))
}

function cleanAssistantText(text: string): string {
  if (!text) return ''
  const withoutInline = text.replace(
    /(\s*)\[(Created|Updated|Read|Deleted|Renamed)\]\s+([^\s`"']+|`[^`]+`)/g,
    (_m, leadingWs) => leadingWs || ' ',
  )
  const normalized = withoutInline
    .replace(/\n[ \t]{2,}(?=[A-Za-z"(])/g, ' ')
    .replace(/^\s{2,}([-*]\s)/gm, '$1')
    .replace(/\n\s*\n(?=\s*[-*]\s)/g, '\n')

  return normalized
    .replace(/\[Run\]\s+[^\n]*/g, '')
    .replace(/(?:^|[\s.])\[[0-9;]{1,20}m/g, ' ')
    .replace(/(\S)\s+(#{2,6}\s)/g, '$1\n\n$2')
    .replace(/(#{2,6})([A-Za-z])/g, '$1 $2')
    .replace(/Files:-/g, 'Files:\n- ')
    .replace(/^\s*\[(Created|Updated|Read|Deleted|Renamed)\]\s+.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── SSE Connection (one per project directory) ───────────────────────

class SSEConnection {
  private controller: AbortController | null = null
  private listeners = new Map<string, Set<(event: StreamEvent) => void>>()
  private partTypes = new Map<string, string>()
  private eventBuffer = new Map<string, StreamEvent[]>()
  private readonly MAX_BUFFER_SIZE = 500
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private baseUrl: string,
    private directory: string,
  ) {}

  private makeRelativePath(filePath: string): string {
    if (filePath.startsWith(this.directory + '/')) {
      return filePath.slice(this.directory.length + 1)
    }
    if (filePath.startsWith('/')) {
      const lastSlash = filePath.lastIndexOf('/')
      return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
    }
    return filePath
  }

  get listenerCount(): number {
    let count = 0
    for (const set of this.listeners.values()) count += set.size
    return count
  }

  addListener(sessionId: string, callback: (event: StreamEvent) => void) {
    let set = this.listeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.listeners.set(sessionId, set)
    }
    set.add(callback)
    // Late-joining browser tabs (reload mid-run): replay buffered deltas so UI unfreezes.
    // 'complete' is never buffered, so reconnecting clients still get a live terminal signal.
    const buffered = this.eventBuffer.get(sessionId)
    if (buffered?.length) {
      for (const event of buffered) {
        callback(event)
      }
    }
  }

  removeListener(sessionId: string, callback: (event: StreamEvent) => void) {
    const set = this.listeners.get(sessionId)
    if (set) {
      set.delete(callback)
      if (set.size === 0) {
        this.listeners.delete(sessionId)
        this.cancelIdleComplete(sessionId)
      }
    }
  }

  connect() {
    if (this.controller) return
    this.controller = new AbortController()
    this.consumeStream(this.controller.signal).catch(() => {})
  }

  disconnect() {
    this.controller?.abort()
    this.controller = null
    this.partTypes.clear()
    this.eventBuffer.clear()
    for (const timer of this.idleTimers.values()) clearTimeout(timer)
    this.idleTimers.clear()
  }

  private async consumeStream(signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        const url = `${this.baseUrl}/event`
        console.log('[OpenCode] Connecting to SSE event stream:', url)
        const response = await fetch(url, {
          headers: { Accept: 'text/event-stream' },
          signal,
        })

        if (!response.ok || !response.body) {
          console.error('[OpenCode] SSE connection failed: status', response.status)
          await this.delay(2000, signal)
          continue
        }
        console.log('[OpenCode] SSE event stream connected')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          let idx: number
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)

            let data = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('data: ')) data += line.slice(6)
              else if (line.startsWith('data:')) data += line.slice(5)
            }

            if (data) {
              try {
                this.routeEvent(JSON.parse(data) as OpenCodeEvent)
              } catch { /* ignore parse errors */ }
            }
          }
        }
      } catch (err) {
        if (signal.aborted) return
        console.error('[OpenCode] SSE stream error, reconnecting in 2s:', err instanceof Error ? err.message : err)
      }

      console.log('[OpenCode] SSE stream disconnected, reconnecting in 2s...')
      await this.delay(2000, signal)
    }
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }

  private routeEvent(event: OpenCodeEvent) {
    // Auto-approve permission requests so tool calls (write, edit, etc.) aren't blocked
    if (event.type === 'permission.updated') {
      const props = event.properties as { id?: string; sessionID?: string }
      console.log('[OpenCode] Permission event:', event.type, 'id:', props.id, 'session:', props.sessionID)
      if (props.id && props.sessionID) {
        this.approvePermission(props.sessionID, props.id)
      }
    }

    const { sessionId, streamEvents } = this.transformEvent(event)
    if (streamEvents.length === 0) return

    for (const streamEvent of streamEvents) {
      if (sessionId) {
        // Buffer non-terminal events for late-joining listeners (e.g. SSE endpoint after page refresh)
        // 'complete' is a terminal signal that should only be dispatched live, never replayed
        if (streamEvent.type !== 'complete') {
          let buffer = this.eventBuffer.get(sessionId)
          if (!buffer) {
            buffer = []
            this.eventBuffer.set(sessionId, buffer)
          }
          buffer.push(streamEvent)
          if (buffer.length > this.MAX_BUFFER_SIZE) {
            buffer.splice(0, buffer.length - this.MAX_BUFFER_SIZE)
          }
        }

        // Dispatch to existing listeners
        const listeners = this.listeners.get(sessionId)
        if (listeners) {
          for (const cb of [...listeners]) cb(streamEvent)
        }
      } else {
        // Broadcast to all listeners in this directory
        for (const [, listeners] of this.listeners) {
          for (const cb of [...listeners]) cb(streamEvent)
        }
      }
    }
  }

  private transformEvent(event: OpenCodeEvent): { sessionId: string | null; streamEvents: StreamEvent[] } {
    const events: StreamEvent[] = []

    switch (event.type) {
      case 'message.part.delta': {
        const props = event.properties as { sessionID?: string; partID?: string; field?: string; delta?: string }
        if (!props.delta) return { sessionId: props.sessionID ?? null, streamEvents: [] }

        const partType = this.partTypes.get(props.partID ?? '')
        if (partType === 'text') {
          events.push({ type: 'text-delta', content: props.delta })
        } else if (partType === 'reasoning') {
          events.push({ type: 'thinking', id: props.partID ?? '', content: props.delta, done: false })
        }
        return { sessionId: props.sessionID ?? null, streamEvents: events }
      }

      case 'message.part.updated': {
        const props = event.properties as { part?: OpenCodePart }
        const part = props.part
        if (!part) return { sessionId: null, streamEvents: [] }

        const sessionId = part.sessionID ?? null

        if (part.id && part.type) {
          this.partTypes.set(part.id, part.type)
        }

        if (part.type === 'reasoning' && part.time?.end) {
          events.push({ type: 'thinking', id: part.id ?? '', content: '', done: true })
        } else if (part.type === 'tool') {
          const toolEvent = this.transformToolPart(part)
          if (toolEvent) events.push(toolEvent)
        }

        return { sessionId, streamEvents: events }
      }

      case 'session.status': {
        const props = event.properties as { sessionID?: string; status?: { type?: string } }
        const statusType = props.status?.type
        const sessionId = props.sessionID ?? null
        if (statusType === 'busy') {
          if (sessionId) this.cancelIdleComplete(sessionId)
          events.push({ type: 'status', status: 'running' })
        } else if (statusType === 'idle') {
          if (sessionId) this.scheduleIdleComplete(sessionId)
          events.push({ type: 'status', status: 'idle' })
        }
        return { sessionId, streamEvents: events }
      }

      case 'session.idle': {
        const props = event.properties as { sessionID?: string }
        const sessionId = props.sessionID ?? null
        if (sessionId) {
          this.scheduleIdleComplete(sessionId)
        }
        return { sessionId, streamEvents: [] }
      }

      case 'todo.updated': {
        const props = event.properties as { sessionID?: string; todos?: OpenCodeTodo[] }
        events.push({
          type: 'todo',
          items: (props.todos ?? []).map((t) => ({
            id: t.id ?? '',
            content: t.content ?? '',
            status: t.status ?? 'pending',
            priority: t.priority ?? 'medium',
          })),
        })
        return { sessionId: props.sessionID ?? null, streamEvents: events }
      }

      case 'question.asked': {
        const props = event.properties as { sessionID?: string; id?: string; question?: string }
        if (props.id && props.question) {
          events.push({
            type: 'question',
            id: props.id,
            question: props.question,
            status: 'running',
          })
        }
        return { sessionId: props.sessionID ?? null, streamEvents: events }
      }

      case 'question.answered': {
        const props = event.properties as { sessionID?: string; id?: string }
        if (props.id) {
          events.push({
            type: 'question',
            id: props.id,
            question: '',
            status: 'completed',
          })
        }
        return { sessionId: props.sessionID ?? null, streamEvents: events }
      }

      case 'session.diff': {
        const props = event.properties as {
          sessionID?: string
          diff?: Array<{ file?: string; status?: string; additions?: number; deletions?: number }>
        }
        // Emit file-change events (triggers file tree refresh) instead of file-op events
        // (which would create duplicate badges alongside the tool-call-based badges)
        for (const entry of props.diff ?? []) {
          if (!entry.file) continue
          events.push({
            type: 'file-change',
            file: this.makeRelativePath(entry.file),
          })
        }
        return { sessionId: props.sessionID ?? null, streamEvents: events }
      }

      case 'file.edited': {
        return { sessionId: null, streamEvents: [] }
      }

      case 'message.updated': {
        const props = event.properties as {
          info?: {
            sessionID?: string
            role?: string
            time?: { created?: number; completed?: number }
            error?: { name?: string; data?: { message?: string } }
          }
        }
        const sessionId = props.info?.sessionID ?? null
        if (props.info?.error) {
          const errorMsg = props.info.error.data?.message ?? 'Unknown error'
          events.push({ type: 'error', message: errorMsg })
          // Emit complete after error to stop waiting
          if (sessionId) {
            setTimeout(() => this.dispatchToSession(sessionId, { type: 'complete' }), 100)
          }
        }
        return { sessionId, streamEvents: events }
      }

      case 'session.error': {
        const props = event.properties as { sessionID?: string; error?: string }
        const errorMsg = props.error ?? 'Session error'
        events.push({ type: 'error', message: errorMsg })
        // Emit complete after error to stop waiting
        const sessionId = props.sessionID ?? null
        if (sessionId) {
          setTimeout(() => this.dispatchToSession(sessionId, { type: 'complete' }), 100)
        }
        return { sessionId, streamEvents: events }
      }

      default:
        return { sessionId: null, streamEvents: [] }
    }
  }

  private approvePermission(sessionId: string, permissionId: string) {
    console.log('[OpenCode] Attempting to approve permission:', permissionId, 'for session:', sessionId)
    fetch(`${this.baseUrl}/session/${sessionId}/permissions/${permissionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'always' }),
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      console.error('[OpenCode] Permission approval failed:', permissionId, err instanceof Error ? err.message : err)
    })
  }

  private scheduleIdleComplete(sessionId: string) {
    this.cancelIdleComplete(sessionId)
    console.log('[OpenCode] Scheduling idle complete for session:', sessionId, '(30s timer)')
    // Primary completion mechanism: schedule a debounced complete event.
    // If another step starts (session.status: busy), the timer is cancelled.
    // 30s is long enough to cover gaps between multi-step tool calls
    // (plugin creation can have long pauses between steps),
    // while still completing reasonably quickly after the task finishes.
    const timer = setTimeout(() => {
      this.idleTimers.delete(sessionId)
      console.log('[OpenCode] Idle timer fired for session:', sessionId, '— dispatching complete')
      this.dispatchToSession(sessionId, { type: 'complete' })
    }, 30_000)
    this.idleTimers.set(sessionId, timer)
  }

  private cancelIdleComplete(sessionId: string) {
    const timer = this.idleTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(sessionId)
    }
  }

  clearBuffer(sessionId: string) {
    this.eventBuffer.delete(sessionId)
    this.cancelIdleComplete(sessionId)
  }

  dispatchComplete(sessionId: string) {
    this.cancelIdleComplete(sessionId)
    console.log('[OpenCode] Dispatching complete for session:', sessionId)
    this.dispatchToSession(sessionId, { type: 'complete' })
    // Clear buffer after dispatching complete to prevent replay on reconnect
    this.eventBuffer.delete(sessionId)
  }

  dispatchError(sessionId: string, message: string) {
    this.dispatchToSession(sessionId, { type: 'error', message })
  }

  private dispatchToSession(sessionId: string, event: StreamEvent) {
    // Buffer non-terminal events for late-joining listeners
    if (event.type !== 'complete') {
      let buffer = this.eventBuffer.get(sessionId)
      if (!buffer) {
        buffer = []
        this.eventBuffer.set(sessionId, buffer)
      }
      buffer.push(event)
      if (buffer.length > this.MAX_BUFFER_SIZE) {
        buffer.splice(0, buffer.length - this.MAX_BUFFER_SIZE)
      }
    }
    // Always dispatch to live listeners
    const listeners = this.listeners.get(sessionId)
    if (listeners) {
      for (const cb of [...listeners]) cb(event)
    }
  }

  private parseBashCommand(command: string): { action: FileAction; path: string; newPath?: string } | null {
    const trimmed = command.trim()
    
    // Match: rm <file> or rm -rf <file>
    const rmMatch = trimmed.match(/^rm\s+(?:-[rf]+\s+)?(.+)$/)
    if (rmMatch) {
      const path = rmMatch[1].replace(/^['"]|['"]$/g, '').trim()
      return { action: 'delete', path }
    }
    
    // Match: mv <old> <new>
    const mvMatch = trimmed.match(/^mv\s+(.+?)\s+(.+)$/)
    if (mvMatch) {
      const oldPath = mvMatch[1].replace(/^['"]|['"]$/g, '').trim()
      const newPath = mvMatch[2].replace(/^['"]|['"]$/g, '').trim()
      return { action: 'rename', path: oldPath, newPath }
    }
    
    return null
  }

  private transformToolPart(part: OpenCodePart): StreamEvent | null {
    const toolName = (part.tool ?? '').toLowerCase()
    let action = TOOL_TO_FILE_ACTION[toolName]

    const state = part.state
    if (!state) return null

    let status: 'running' | 'completed' | 'error'
    if (state.status === 'completed') status = 'completed'
    else if (state.status === 'error') status = 'error'
    else status = 'running'

    // Handle question tool specially
    if (toolName === 'question') {
      const input = state.input ?? {}
      return {
        type: 'question',
        id: part.callID ?? part.id ?? '',
        question: String(input.question ?? input.prompt ?? ''),
        status,
      }
    }

    if (!action) {
      const input = state.input ?? {}
      const command = String(input.command ?? '')

      
      // Parse bash commands for file operations
      if (toolName === 'bash' || toolName === 'shell') {
        const parsed = this.parseBashCommand(command)
        if (parsed) {
          if (isBuildArtifactPath(parsed.path) || (parsed.newPath && isBuildArtifactPath(parsed.newPath))) {
            return null
          }
          return {
            type: 'file-op',
            id: part.callID ?? part.id ?? '',
            action: parsed.action,
            path: parsed.path,
            newPath: parsed.newPath,
            status,
            tool: toolName,
          }
        }
      }
      
      const label = String(input.path ?? input.pattern ?? input.command ?? toolName)
      return {
        type: 'file-op',
        id: part.callID ?? part.id ?? '',
        action: 'tool',
        path: label,
        status,
        tool: part.tool ?? toolName,
      }
    }

    const input = state.input ?? {}
    const rawPath = extractFilePath(input)
    if (!rawPath) return null

    const path = this.makeRelativePath(rawPath)
    if (isBuildArtifactPath(path)) return null
    const rawNewPath = action === 'rename' ? extractNewPath(input) : undefined
    if (rawNewPath && isBuildArtifactPath(this.makeRelativePath(rawNewPath))) return null

    // Bug Fix 1: Check if file exists to determine create vs update
    // ONLY check when tool is still running (before file is written)
    // Once completed, the file will exist regardless of whether it was created or updated
    if (action === 'create' && status === 'running') {
      const fullPath = join(this.directory, path)
      if (existsSync(fullPath)) {
        action = 'update'
      }
    }

    return {
      type: 'file-op',
      id: part.callID ?? part.id ?? '',
      action,
      path,
      newPath: rawNewPath ? this.makeRelativePath(rawNewPath) : undefined,
      status,
      tool: toolName,
    }
  }
}

// ── Subscription Manager ─────────────────────────────────────────────

export class SubscriptionManager {
  private connections = new Map<string, SSEConnection>()
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

  subscribe(
    directory: string,
    opencodeSessionId: string,
    callback: (event: StreamEvent) => void,
    baseUrl: string,
  ): () => void {
    // Cancel any pending disconnect for this directory
    const pendingTimer = this.disconnectTimers.get(directory)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      this.disconnectTimers.delete(directory)
    }

    let conn = this.connections.get(directory)
    if (!conn) {
      conn = new SSEConnection(baseUrl, directory)
      this.connections.set(directory, conn)
      conn.connect()
    }

    conn.addListener(opencodeSessionId, callback)

    const connection = conn
    return () => {
      connection.removeListener(opencodeSessionId, callback)
      if (connection.listenerCount === 0) {
        // Grace period: keep connection + buffer alive for late-joining subscribers
        const timer = setTimeout(() => {
          this.disconnectTimers.delete(directory)
          if (connection.listenerCount === 0) {
            connection.disconnect()
            this.connections.delete(directory)
          }
        }, 30_000)
        this.disconnectTimers.set(directory, timer)
      }
    }
  }

  clearBuffer(directory: string, sessionId: string) {
    const conn = this.connections.get(directory)
    if (conn) conn.clearBuffer(sessionId)
  }

  dispatchComplete(directory: string, sessionId: string) {
    const conn = this.connections.get(directory)
    if (conn) conn.dispatchComplete(sessionId)
  }

  dispatchError(directory: string, sessionId: string, message: string) {
    const conn = this.connections.get(directory)
    if (conn) conn.dispatchError(sessionId, message)
  }
}

// ── OpenCode Bridge ──────────────────────────────────────────────────

export class OpenCodeBridge implements BridgeInterface {
  name = 'opencode'
  private activeSessions = new Map<string, AbortController>()
  readonly subscriptionManager: SubscriptionManager

  constructor() {
    this.subscriptionManager = new SubscriptionManager()
  }

  async initialize(): Promise<void> {
    // No-op: instances are started on demand by the process manager
  }

  isAvailable(): boolean {
    return true // Instances are started on demand
  }

  async executeTask(task: BridgeTask): Promise<BridgeResult> {
    return this.streamResponse(task, () => {})
  }

  async createOrResolveSession(baseUrl: string, directory: string, title?: string, existingId?: string, forceNew?: boolean): Promise<string> {
    if (!forceNew && existingId) {
      try {
        const res = await fetch(`${baseUrl}/session/${existingId}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) return existingId
      } catch { /* session not found, create new */ }
    }

    // Try to find existing session by title (project link name)
    if (!forceNew && title) {
      try {
        const res = await fetch(`${baseUrl}/session`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const sessions = (await res.json()) as OpenCodeSession[]
          const matching = sessions.find((s) => s.title === title)
          if (matching) return matching.id
        }
      } catch { /* ignore, will create new */ }
    }

    const url = new URL(`${baseUrl}/session`)
    if (directory) url.searchParams.set('directory', directory)

    const body: Record<string, string> = {}
    if (title) body.title = title

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      throw new Error(`Failed to create OpenCode session: status ${res.status}`)
    }

    const session = (await res.json()) as OpenCodeSession
    
    // Auto-approve all permissions to prevent tools from getting stuck
    await this.autoApproveAllPermissions(baseUrl, session.id).catch((err) => {
      console.warn('[OpenCode] Failed to auto-approve permissions:', err instanceof Error ? err.message : err)
    })
    
    return session.id
  }

  private async autoApproveAllPermissions(baseUrl: string, sessionId: string): Promise<void> {
    try {
      // Get all pending permissions
      const res = await fetch(`${baseUrl}/session/${sessionId}/permissions`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      
      if (!res.ok) return
      
      const permissions = (await res.json()) as Array<{ id: string }>
      
      // Approve each permission with 'always' response
      for (const perm of permissions) {
        await fetch(`${baseUrl}/session/${sessionId}/permissions/${perm.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: 'always' }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {})
      }
    } catch {
      // Ignore errors - permissions might not exist yet
    }
  }

  async sendPromptAsync(baseUrl: string, sessionId: string, prompt: string, model?: string, maxOutputTokens?: number): Promise<void> {
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: prompt }],
    }

    if (model && model.includes('/')) {
      const [providerID, ...rest] = model.split('/')
      const modelID = rest.join('/')
      body.model = { providerID, modelID }
    }

    if (maxOutputTokens !== undefined && maxOutputTokens > 0) {
      body.maxOutputTokens = maxOutputTokens
    }

    console.log('[OpenCode] Sending prompt with maxOutputTokens:', maxOutputTokens)

    const res = await fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    if (res.status !== 204 && !res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      throw new Error(`Failed to send prompt: status ${res.status}: ${errText}`)
    }
  }

  async streamResponse(task: BridgeTask, onEvent: (event: BridgeStreamEvent) => void): Promise<BridgeResult> {
    const controller = new AbortController()
    this.activeSessions.set(task.sessionId, controller)

    const directory = task.context?.projectDirectory ?? '.'
    let baseUrl: string

    try {
      baseUrl = await processManager.acquire({
        directory,
        javaVersion: task.context?.javaVersion ?? '21',
        compiler: task.context?.compiler ?? 'maven',
      })
    } catch (err) {
      this.activeSessions.delete(task.sessionId)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return {
        success: false,
        output: '',
        error: `Failed to start OpenCode instance: ${msg}. Make sure 'opencode' is installed and accessible.`,
      }
    }

    // Configure Firecrawl MCP server if the user has an API key
    if (task.context?.firecrawlApiKey) {
      try {
        const { addMCPServer, buildFirecrawlMCPConfig } = await import('../utils/opencode-mcp.js')
        const mcpConfig = buildFirecrawlMCPConfig(task.context.firecrawlApiKey)
        await addMCPServer(baseUrl, 'firecrawl', mcpConfig)
        console.log('[OpenCode] Added Firecrawl MCP server')
      } catch (err) {
        console.warn('[OpenCode] Failed to add Firecrawl MCP server:', err instanceof Error ? err.message : err)
      }
    } else {
      // Disconnect stale Firecrawl MCP if key was removed
      try {
        const { disconnectMCPServer } = await import('../utils/opencode-mcp.js')
        await disconnectMCPServer(baseUrl, 'firecrawl')
        console.log('[OpenCode] Disconnected stale Firecrawl MCP server')
      } catch (err) {
        // Non-fatal: server might not exist
      }
    }

    try {
      console.log('[OpenCode] Starting stream for session:', task.sessionId, 'project:', task.projectId, 'url:', baseUrl)
      onEvent({ type: 'status', content: 'Connecting to OpenCode...', timestamp: new Date().toISOString() })

      const opencodeSessionId = await this.createOrResolveSession(
        baseUrl,
        directory,
        task.context?.projectLinkId ?? task.projectId,
        task.context?.opencodeSessionId,
      )

      onEvent({ type: 'status', content: 'Sending prompt to AI agent...', timestamp: new Date().toISOString() })

      // Clear stale buffered events from previous messages so they aren't replayed
      this.subscriptionManager.clearBuffer(directory, opencodeSessionId)

      // Subscribe to events for real-time forwarding + completion detection
      const collectedText: string[] = []
      const thinkingParts = new Map<string, { content: string; done: boolean }>()
      const filePartsById = new Map<string, { action: string; path: string; newPath?: string; tool: string }>()
      const seenParts = new Set<string>()
      const orderedRefs: Array<{ type: 'thinking' | 'file' | 'tool' | 'text'; id: string }> = []
      let latestTodos: TodoItem[] = []
      let resolved = false

      let timedOut = false
      let lastEventTime = Date.now()

      // Track intermediate text segments for proper ordering
      const textSegments: Array<{ id: string; text: string }> = []
      let pendingText = ''

      const completionPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!resolved) { resolved = true; timedOut = true; unsub?.(); resolve() }
        }, 1800000)

        let unsub: (() => void) | null = null
        unsub = this.subscriptionManager.subscribe(directory, opencodeSessionId, (event) => {
          if (controller.signal.aborted || resolved) return
          lastEventTime = Date.now()

          switch (event.type) {
            case 'text-delta':
              pendingText += event.content
              collectedText.push(event.content)
              onEvent({ type: 'text-delta', content: event.content, timestamp: new Date().toISOString() })
              break

            case 'thinking': {
              // Capture any pending text as a segment before adding thinking
              if (pendingText.trim()) {
                const textId = `text-${Date.now()}`
                textSegments.push({ id: textId, text: cleanAssistantText(pendingText.trim()) })
                orderedRefs.push({ type: 'text', id: textId })
              }
              pendingText = ''

              const existing = thinkingParts.get(event.id) ?? { content: '', done: false }
              existing.content += event.content
              existing.done = event.done
              thinkingParts.set(event.id, existing)
              if (!seenParts.has(event.id)) {
                seenParts.add(event.id)
                orderedRefs.push({ type: 'thinking', id: event.id })
              }
              onEvent({ type: 'thinking', content: event.content, timestamp: new Date().toISOString() })
              break
            }

            case 'file-op': {
              // Capture any pending text as a segment before adding file-op
              if (pendingText.trim()) {
                const textId = `text-${Date.now()}`
                textSegments.push({ id: textId, text: cleanAssistantText(pendingText.trim()) })
                orderedRefs.push({ type: 'text', id: textId })
              }
              pendingText = ''

              if (!seenParts.has(event.id)) {
                seenParts.add(event.id)
                orderedRefs.push({ type: event.action === 'tool' ? 'tool' : 'file', id: event.id })
              }
              if (event.status === 'completed' || event.status === 'error') {
                filePartsById.set(event.id, {
                  action: event.action,
                  path: event.path,
                  newPath: event.newPath,
                  tool: event.tool,
                })
              }
              const verb = event.status === 'running'
                ? `${event.action.replace(/e$/, '')}ing`
                : `${event.action}${event.action.endsWith('e') ? 'd' : 'ed'}`
              onEvent({
                type: 'file-op',
                content: `${verb} ${event.path}`,
                timestamp: new Date().toISOString(),
                metadata: { action: event.action, path: event.path, newPath: event.newPath, status: event.status },
              })
              break
            }

            case 'todo':
              latestTodos = event.items.map((t) => ({
                text: t.content,
                status: t.status === 'completed'
                  ? 'completed' as const
                  : t.status === 'in_progress'
                    ? 'in-progress' as const
                    : 'pending' as const,
              }))
              onEvent({ type: 'todo', content: JSON.stringify(event.items), timestamp: new Date().toISOString() })
              break

            case 'status':
              onEvent({ type: 'status', content: event.status, timestamp: new Date().toISOString() })
              break

            case 'complete':
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                unsub?.()
                resolve()
              }
              break

            case 'error':
              onEvent({ type: 'error', content: event.message, timestamp: new Date().toISOString() })
              break
          }
        }, baseUrl)

        controller.signal.addEventListener('abort', () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            unsub?.()
            resolve()
          }
        }, { once: true })
      })

      // Build context prompt and send to OpenCode
      const contextPrompt = this.buildContextPrompt(task)

      // Get baseline assistant message count before sending prompt
      // so pollUntilIdle only considers NEW messages for completion
      let baselineAssistantCount = 0
      try {
        const msgRes = await fetch(`${baseUrl}/session/${opencodeSessionId}/message`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (msgRes.ok) {
          const existingMessages = (await msgRes.json()) as OpenCodeMessage[]
          baselineAssistantCount = existingMessages.filter((m) => m.info?.role === 'assistant').length
        }
      } catch {
        // If we can't determine baseline, set high so poll waits for SSE-based completion instead
        baselineAssistantCount = Number.MAX_SAFE_INTEGER
      }

      console.log('[OpenCode] Sending prompt to session:', opencodeSessionId, 'baseline msgs:', baselineAssistantCount)
      await this.sendPromptAsync(baseUrl, opencodeSessionId, contextPrompt, task.context?.model, task.context?.maxOutputTokens)
      console.log('[OpenCode] Prompt sent successfully')

      // Start permission polling to detect stuck permissions
      const permAbort = new AbortController()
      controller.signal.addEventListener('abort', () => permAbort.abort(), { once: true })
      this.pollPermissions(baseUrl, opencodeSessionId, permAbort.signal)

      // Monitor for stuck operations — warn user if no events for 3 minutes
      const progressChecker = setInterval(() => {
        if (resolved || controller.signal.aborted) {
          clearInterval(progressChecker)
          return
        }
        const elapsed = Date.now() - lastEventTime
        if (elapsed > 180000) {
          const stuckMsg = 'No progress detected for 3 minutes — the operation may be stuck. You can cancel and retry.'
          onEvent({ type: 'error', content: stuckMsg, timestamp: new Date().toISOString() })
          this.subscriptionManager.dispatchError(directory, opencodeSessionId, stuckMsg)
          lastEventTime = Date.now()
        }
      }, 60000)

      // Wait for completion via SSE events, with polling fallback
      const pollFallback = this.pollUntilIdle(baseUrl, opencodeSessionId, controller.signal, baselineAssistantCount)
      await Promise.race([completionPromise, pollFallback]).catch(() => {})
      clearInterval(progressChecker)

      // Stop permission polling once the main stream completes
      permAbort.abort()

      // Handle timeout — return failure instead of silently succeeding
      if (timedOut) {
        this.subscriptionManager.dispatchComplete(directory, opencodeSessionId)
        const errorMsg = 'Session timed out after 30 minutes'
        onEvent({ type: 'error', content: errorMsg, timestamp: new Date().toISOString() })
        onEvent({ type: 'complete', content: 'Timed out', timestamp: new Date().toISOString() })
        const partialText = await this.fetchAssistantText(baseUrl, opencodeSessionId)

        // Flush any remaining pending text into segments
        if (pendingText.trim()) {
          const textId = `text-${Date.now()}`
          textSegments.push({ id: textId, text: cleanAssistantText(pendingText.trim()) })
          orderedRefs.push({ type: 'text', id: textId })
          pendingText = ''
        }

        // Assemble partial metadata so file-op badges are preserved
        const timeoutParts: MessagePart[] = []
        for (const ref of orderedRefs) {
          if (ref.type === 'thinking') {
            const t = thinkingParts.get(ref.id)
            if (t) timeoutParts.push({ type: 'thinking', content: t.content })
          } else if (ref.type === 'text') {
            const seg = textSegments.find((s) => s.id === ref.id)
            if (seg) {
              // Parse <thinking> tags from text segments (DeepSeek/Fireworks workaround)
              const parsed = parseThinkingTags(seg.text)
              timeoutParts.push(...parsed)
            }
          } else {
            const fp = filePartsById.get(ref.id)
            if (fp) {
              if (fp.action === 'tool') {
                timeoutParts.push({ type: 'tool', tool: fp.tool, path: fp.path })
              } else {
                timeoutParts.push({
                  type: 'file',
                  action: fp.action as 'create' | 'update' | 'delete' | 'rename' | 'read',
                  path: fp.path,
                  newPath: fp.newPath,
                })
              }
            }
          }
        }

        // Strip <thinking> and DeepSeek  tags from the output text so they don't appear twice
        const cleanTimeoutOutput = cleanAssistantText(partialText || collectedText.join(''))
          .replace(THINKING_TAG_RE, '')
          .replace(REASONING_TAG_RE, '')
          .replace(DEEPSEEK_THINKING_RE, '')
          .trim()

        return {
          success: false,
          output: cleanTimeoutOutput,
          error: 'Session timed out after 30 minutes',
          metadata: {
            opencodeSessionId,
            parts: timeoutParts.length > 0 ? timeoutParts : undefined,
          },
        }
      }

      // Handle abort/cancellation
      if (controller.signal.aborted) {
        return { success: false, output: '', error: 'Execution cancelled', metadata: { opencodeSessionId } }
      }

      // If poll fallback resolved but SSE hasn't sent 'complete' yet,
      // dispatch it now so the frontend SSE listener gets the signal promptly
      if (!resolved) {
        console.log('[OpenCode] Poll fallback resolved before SSE complete — dispatching complete for:', opencodeSessionId)
        resolved = true
        this.subscriptionManager.dispatchComplete(directory, opencodeSessionId)
      }

      onEvent({ type: 'status', content: 'AI agent completed. Processing response...', timestamp: new Date().toISOString() })

      // Fetch full messages from OpenCode for accurate persistence
      const fullText = await this.fetchAssistantText(baseUrl, opencodeSessionId)
      const rawOutputText = cleanAssistantText(fullText || collectedText.join(''))

      // Strip <thinking> and DeepSeek  tags from the output text so they don't appear as raw text
      const outputText = rawOutputText
        .replace(THINKING_TAG_RE, '')
        .replace(REASONING_TAG_RE, '')
        .replace(DEEPSEEK_THINKING_RE, '')
        .trim()
      console.log('[OpenCode] Stream complete for session:', opencodeSessionId, 'text length:', outputText.length, 'parts:', orderedRefs.length)

      onEvent({ type: 'complete', content: 'Done', timestamp: new Date().toISOString() })

      // Flush any remaining pending text into segments so the last text block is included in parts
      if (pendingText.trim()) {
        const textId = `text-${Date.now()}`
        textSegments.push({ id: textId, text: cleanAssistantText(pendingText.trim()) })
        orderedRefs.push({ type: 'text', id: textId })
        pendingText = ''
      }

      // Assemble metadata parts
      const parts: MessagePart[] = []
      for (const ref of orderedRefs) {
        if (ref.type === 'thinking') {
          const t = thinkingParts.get(ref.id)
          if (t) parts.push({ type: 'thinking', content: t.content })
        } else if (ref.type === 'text') {
          const seg = textSegments.find((s) => s.id === ref.id)
          if (seg) {
            // Parse <thinking> tags from text segments (DeepSeek/Fireworks workaround)
            const parsed = parseThinkingTags(seg.text)
            parts.push(...parsed)
          }
        } else {
          const fp = filePartsById.get(ref.id)
          if (fp) {
            if (fp.action === 'tool') {
              parts.push({ type: 'tool', tool: fp.tool, path: fp.path })
            } else {
              parts.push({
                type: 'file',
                action: fp.action as 'create' | 'update' | 'delete' | 'rename' | 'read',
                path: fp.path,
                newPath: fp.newPath,
              })
            }
          }
        }
      }
      if (latestTodos.length > 0) {
        parts.push({ type: 'todo-list', items: latestTodos })
      }

      // Calculate token usage from actual text lengths for reconciliation
      const inputTokens = estimateTokens(task.prompt)
      const outputTokens = estimateTokens(outputText)

      return {
        success: true,
        output: outputText,
        metadata: {
          opencodeSessionId,
          parts: parts.length > 0 ? parts : undefined,
          usage: {
            inputTokens,
            outputTokens,
          },
        },
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, output: '', error: 'Execution cancelled' }
      }
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[OpenCode] Bridge error for session:', task.sessionId, msg)
      return { success: false, output: '', error: `OpenCode bridge error: ${msg}` }
    } finally {
      this.activeSessions.delete(task.sessionId)
      processManager.release(directory).catch(() => {})
    }
  }

  async cancelExecution(sessionId: string): Promise<void> {
    const controller = this.activeSessions.get(sessionId)
    if (controller) {
      controller.abort()
      this.activeSessions.delete(sessionId)
    }
  }

  async deleteSession(_opencodeSessionId: string): Promise<void> {
    // No-op: with per-project instances, sessions are cleaned up when the process stops.
    // The process manager's idle timeout handles cleanup automatically.
  }

  async cleanupProject(systemUsername: string, projectDir: string): Promise<void> {
    // 1. Force-stop any running OpenCode instance for this project
    await processManager.forceStop(projectDir)

    // 2. Force-stop any running LiteLLM proxy for this project
    const { litellmProcessManager } = await import('./litellm-process-manager.js')
    await litellmProcessManager.forceStop(projectDir)

    // 3. Clean up SQLite DB and filesystem artifacts
    const { cleanupOpenCodeProject } = await import('../utils/opencode-cleanup.js')
    await cleanupOpenCodeProject(systemUsername, projectDir)
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async pollPermissions(baseUrl: string, sessionId: string, signal: AbortSignal): Promise<void> {
    // Diagnostic: periodically check for pending permissions that may block tool execution
    while (!signal.aborted) {
      await new Promise((r) => setTimeout(r, 10000))
      if (signal.aborted) return
      try {
        const res = await fetch(`${baseUrl}/permission`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const permissions = (await res.json()) as Array<{ id?: string; sessionID?: string; permission?: string; metadata?: Record<string, unknown> }>
          const pending = permissions.filter((p) => p.sessionID === sessionId)
          if (pending.length > 0) {
            console.warn('[OpenCode] ⚠ STUCK PERMISSION DETECTED for session:', sessionId,
              pending.map((p) => `${p.permission} (${p.id})`).join(', '))
          }
        }
      } catch { /* ignore polling errors */ }
    }
  }

  private async pollUntilIdle(baseUrl: string, sessionId: string, signal: AbortSignal, baselineAssistantCount: number): Promise<void> {
    // Initial delay before polling starts
    await new Promise((r) => setTimeout(r, 5000))

    let quietSince = 0
    let lastSeenCount = baselineAssistantCount

    while (!signal.aborted) {
      try {
        const res = await fetch(`${baseUrl}/session/${sessionId}/message`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const messages = (await res.json()) as OpenCodeMessage[]
          const assistantMessages = messages.filter((m) => m.info?.role === 'assistant')
          if (assistantMessages.length > baselineAssistantCount) {
            // Reset quiet timer when new messages appear (new step started)
            if (assistantMessages.length !== lastSeenCount) {
              lastSeenCount = assistantMessages.length
              quietSince = 0
            }
            const lastAssistant = assistantMessages[assistantMessages.length - 1]
            if (lastAssistant?.info?.time?.completed) {
              if (quietSince === 0) {
                quietSince = Date.now()
              } else if (Date.now() - quietSince >= 15000) {
                return
              }
            } else {
              quietSince = 0
            }
          }
        }
      } catch { /* ignore polling errors */ }

      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  private async fetchAssistantText(baseUrl: string, sessionId: string): Promise<string> {
    try {
      const res = await fetch(`${baseUrl}/session/${sessionId}/message`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return ''

      const messages = (await res.json()) as OpenCodeMessage[]
      const assistantMessages = messages.filter((m) => m.info?.role === 'assistant')
      const lastAssistant = assistantMessages[assistantMessages.length - 1]
      if (!lastAssistant) return ''

      return this.extractTextFromMessage(lastAssistant)
    } catch {
      return ''
    }
  }

  private extractTextFromMessage(message: OpenCodeMessage): string {
    const textChunks: string[] = []

    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (part.type === 'text' || part.type === 'text-delta' || part.type === 'text-start') {
          const text = part.text ?? (part as Record<string, unknown>).content ?? ''
          if (typeof text === 'string' && text) textChunks.push(text)
        }
      }
    }

    return cleanAssistantText(textChunks.join(''))
  }

  private buildContextPrompt(task: BridgeTask): string {
    const ctx = task.context
    
    const lines: string[] = []
    
    // Add system prompt first (models need this to follow formatting rules)
    lines.push(AGENT_SYSTEM_PROMPT)
    lines.push('')
    lines.push('---')
    lines.push('')
    
    // Add project context
    if (ctx?.projectName) {
      lines.push(`[Project: ${ctx.projectName}]`)
      if (ctx.software) lines.push(`Software: ${ctx.software}`)
      if (ctx.language) lines.push(`Language: ${ctx.language}`)
      if (ctx.compiler) lines.push(`Build: ${ctx.compiler}`)
      if (ctx.javaVersion) lines.push(`Java: ${ctx.javaVersion}`)
      if (ctx.projectDirectory) lines.push(`Dir: ${ctx.projectDirectory}`)
      lines.push('')
    }
    
    lines.push(`${task.prompt}`)

    return lines.join('\n')
  }
}
