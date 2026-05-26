export interface User {
  id: string
  username: string
  email: string
  role: 'user' | 'admin'
  coderabbitEnabled?: boolean
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  userId: string
  name: string
  linkId: string | null
  description: string | null
  logo: string | null
  versions: string | null
  layoutMode: string
  status: 'active' | 'archived'
  software: string
  language: 'java' | 'kotlin'
  javaVersion: string
  compiler: 'maven' | 'gradle' | 'both'
  bridge: 'opencode' | 'kiro'
  visibility: 'public' | 'private'
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description?: string
  logo?: string
  versions?: string
  software?: string
  language?: 'java' | 'kotlin'
  javaVersion?: string
  compiler?: 'maven' | 'gradle' | 'both'
  bridge?: 'opencode' | 'kiro'
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  logo?: string | null
  versions?: string | null
  layoutMode?: string
  status?: 'active' | 'archived'
  software?: string
  language?: 'java' | 'kotlin'
  javaVersion?: string
  compiler?: 'maven' | 'gradle' | 'both'
  visibility?: 'public' | 'private'
}

export interface ProjectStats {
  userMessages: number
  aiMessages: number
  files: number
  tokensUsed: number
  createdAt: string
}

export interface CommunityProject {
  id: string
  name: string
  description: string | null
  logo: string | null
  versions: string | null
  layoutMode: string
  software: string
  language: 'java' | 'kotlin'
  javaVersion: string
  compiler: 'maven' | 'gradle' | 'both'
  visibility: 'public' | 'private'
  createdAt: string
  updatedAt: string
  ownerUsername: string
}

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AgentSession {
  id: string
  projectId: string
  status: AgentStatus
  opencodeSessionId?: string | null
  bridge?: 'opencode' | 'kiro'
  kiroSessionId?: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentSessionWithMessages extends AgentSession {
  messages: AgentMessage[]
}

export interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'agent' | 'system'
  content: string
  metadata?: MessageMetadata | null
  createdAt: string
}

export interface MessageMetadata {
  parts?: MessagePart[]
}

export type MessagePart =
  | { type: 'thinking'; content: string }
  | { type: 'text'; content: string }
  | { type: 'file'; action: 'create' | 'update' | 'delete' | 'rename' | 'read'; path: string; newPath?: string }
  | { type: 'tool'; tool: string; path: string }
  | { type: 'todo-list'; items: TodoItem[] }

export interface TodoItem {
  text: string
  status: 'pending' | 'in-progress' | 'completed'
}

export interface AgentLog {
  id: string
  sessionId: string
  logType: string
  message: string
  createdAt: string
}

export interface KiroAuthStatus {
  userId: string
  username: string
  systemUser: string
  systemUserExists: boolean
  authenticated: boolean
  configDir: string
  instructions?: string
}

export interface AdminStats {
  totalUsers: number
  totalProjects: number
  totalAgentSessions: number
}

export interface AdminProject {
  id: string
  name: string
  status: 'active' | 'archived'
  software: string
  language: 'java' | 'kotlin'
  compiler: 'maven' | 'gradle' | 'both'
  createdAt: string
  updatedAt: string
  ownerUsername: string | null
}

export interface AIModel {
  id: string
  name: string
  provider: string
  description: string
}

export const AI_MODELS: AIModel[] = [
  // OpenCode free tier models (verified available as of 2026-05-25)
  // NOTE: MiniMax M2.5 was removed from free tier. Use only verified free models below.
  { id: 'opencode/deepseek-v4-flash-free', name: 'DeepSeek V4 Flash', provider: 'OpenCode', description: 'Fast free coding model with strong reasoning capabilities' },
  { id: 'opencode/nemotron-3-super-free', name: 'Nemotron 3 Super', provider: 'OpenCode', description: 'NVIDIA free model optimized for coding and instruction following' },
  { id: 'opencode/big-pickle', name: 'Big Pickle', provider: 'OpenCode', description: 'Free general-purpose AI model for coding tasks' },
  
  // Kiro CLI models (via Kiro.dev)
  { id: 'kiro/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Kiro', description: 'Strong agentic coding with extended autonomous operation' },
]

export const DEFAULT_MODEL_ID = 'opencode/deepseek-v4-flash-free'

// ── Streaming event types (mirroring server StreamEvent) ─────────────

export type StreamEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'thinking'; id: string; content: string; done: boolean }
  | { type: 'file-op'; id: string; action: string; path: string; newPath?: string; status: 'running' | 'completed' | 'error'; tool: string }
  | { type: 'question'; id: string; question: string; status: 'running' | 'completed' | 'error' }
  | { type: 'todo'; items: StreamTodoItem[] }
  | { type: 'status'; status: string; message?: string }
  | { type: 'file-change'; file: string }
  | { type: 'error'; message: string }
  | { type: 'complete' }

export interface StreamTodoItem {
  id: string
  content: string
  status: string
  priority: string
}

export interface FileTreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeEntry[]
}

// ── Streaming state for real-time rendering ──────────────────────────

export interface ThinkingBlock {
  id: string
  content: string
  done: boolean
  order: number
}

export interface FileOpBlock {
  id: string
  action: string
  path: string
  newPath?: string
  status: 'running' | 'completed' | 'error'
  tool: string
  order: number
}

export interface StreamingItem {
  id: string
  kind: 'thinking' | 'file-op' | 'text' | 'question'
  order: number
  // For thinking
  thinkingContent?: string
  thinkingDone?: boolean
  // For file-op
  fileAction?: string
  filePath?: string
  fileNewPath?: string
  fileStatus?: 'running' | 'completed' | 'error'
  fileTool?: string
  // For text
  textContent?: string
  // For question
  questionText?: string
  questionStatus?: 'running' | 'completed' | 'error'
}

export interface StreamingState {
  items: StreamingItem[]
  todos: StreamTodoItem[]
  isStreaming: boolean
  fileChanges: string[]
}

export interface ApiError {
  message: string
  statusCode: number
}
