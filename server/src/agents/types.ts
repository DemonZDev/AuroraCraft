import type { MessagePart } from '../bridges/types.js'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AgentExecutionContext {
  sessionId: string
  projectId: string
  prompt: string
  bridgeName: string
  model?: string          // OpenCode-resolvable model id passed to the bridge (opencode/<id> | openai/<uuid>)
  billingModelId?: string // AuroraCraft ai_models row uuid, used for token reconciliation
  speed?: string
  opencodeSessionId?: string
  username?: string
  projectLinkId?: string
  projectName?: string
  software?: string
  language?: string
  compiler?: string
  javaVersion?: string
  projectDirectory?: string
  userHomeDir?: string
  mcpServers?: Array<{ name: string; config: Record<string, unknown> }>
  mcpDisconnect?: string[]
  userId?: string
  estimatedCost?: number
  providerId?: string
  litellmUrl?: string
  maxOutputTokens?: number
}

export interface AgentExecutionResult {
  status: AgentStatus
  output: string
  error?: string
  metadata?: {
    opencodeSessionId?: string
    parts?: MessagePart[]
  }
}

export interface AgentStreamCallback {
  onOutput: (content: string) => void
  onStatus: (status: AgentStatus) => void
  onLog: (logType: string, message: string) => void
  onComplete: (result: AgentExecutionResult) => void
  onError: (error: string) => void
}
