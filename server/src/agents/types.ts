import type { MessagePart } from '../bridges/types.js'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AgentExecutionContext {
  sessionId: string
  projectId: string
  prompt: string
  bridgeName: string
  model?: string
  speed?: string
  opencodeSessionId?: string
  kiroSessionId?: string
  username?: string
  projectLinkId?: string
  projectName?: string
  software?: string
  language?: string
  compiler?: string
  javaVersion?: string
  projectDirectory?: string
  userHomeDir?: string
  firecrawlApiKey?: string
}

export interface AgentExecutionResult {
  status: AgentStatus
  output: string
  error?: string
  metadata?: {
    opencodeSessionId?: string
    kiroSessionId?: string
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
