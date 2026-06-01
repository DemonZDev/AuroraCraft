import { Agent, fetch as undiciFetch } from 'undici'
import { PROVIDER_CONFIG } from '../config/ai-models.js'

// Minimal OpenAI-compatible chat client for NVIDIA NIM.
//
// IMPORTANT — we STREAM (stream:true). NIM's hosted gateway returns HTTP 504 for any
// non-streaming completion that takes longer than ~300s, and Node's undici fetch also has
// a 300s headersTimeout. Several NIM models (e.g. Kimi K2.6) routinely generate for >5 min.
// Streaming makes the gateway respond immediately and emit tokens continuously, so a long
// generation never trips either 5-minute timeout. We assemble the streamed deltas back into
// the same non-streaming response shape so callers are unchanged.

export interface NimMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: NimToolCall[]
  tool_call_id?: string
  name?: string
}
export interface NimToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
export interface NimToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}
export interface NimResult {
  message: NimMessage
  finishReason: string
  usage: { inputTokens: number; outputTokens: number }
}

const BASE_URL = PROVIDER_CONFIG['nvidia-nim'].baseUrl

// Disable undici's 5-minute headers/body timeouts; the caller's AbortSignal (30-min job
// cap) is the only timeout. connectTimeout stays bounded so a dead host fails fast.
const nimDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 60_000 })

export async function nimChat(params: {
  apiKey: string
  model: string // the NIM slug (nimModelId), NOT the internal id
  messages: NimMessage[]
  tools?: NimToolDef[]
  temperature?: number
  maxTokens?: number
  signal: AbortSignal
  onText?: (delta: string) => void // optional: receive streamed content deltas for live progress
}): Promise<NimResult> {
  const requestBody = JSON.stringify({
    model: params.model,
    messages: params.messages,
    tools: params.tools && params.tools.length ? params.tools : undefined,
    tool_choice: params.tools && params.tools.length ? 'auto' : undefined,
    temperature: params.temperature ?? 0.3,
    // Reasoning models (step-3.7-flash, deepseek-v4-*) spend output tokens on
    // `reasoning_content` before emitting the final `content`; 8192 gives them room.
    max_tokens: params.maxTokens ?? 8192,
    stream: true,
    stream_options: { include_usage: true },
  })

  let res: Awaited<ReturnType<typeof undiciFetch>>
  for (let attempt = 0; ; attempt++) {
    res = await undiciFetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.apiKey}` },
      body: requestBody,
      signal: params.signal,
      dispatcher: nimDispatcher,
    })
    if (res.ok && res.body) break
    // Retry transient infra errors (rate limit / bad gateway / unavailable) up to 2×.
    // NOT 504 — that means the model itself is too slow; retrying just burns another ~5 min,
    // so surface it so the caller can map it to the friendly "high traffic" message.
    if ((res.status === 429 || res.status === 502 || res.status === 503) && attempt < 2 && !params.signal.aborted) {
      await res.body?.cancel().catch(() => {})
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    const body = await res.text().catch(() => '')
    throw new Error(`NIM ${res.status}: ${body.slice(0, 500)}`)
  }

  let content = ''
  let finishReason = 'stop'
  let inputTokens = 0
  let outputTokens = 0
  const toolCalls: NimToolCall[] = []
  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the last (possibly partial) line
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data:')) continue
      const data = s.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let json: any
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      if (json.usage) {
        inputTokens = json.usage.prompt_tokens ?? inputTokens
        outputTokens = json.usage.completion_tokens ?? outputTokens
      }
      const choice = json.choices?.[0]
      if (!choice) continue
      const delta = choice.delta ?? {}
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        params.onText?.(delta.content)
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0
          if (!toolCalls[i]) toolCalls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } }
          if (tc.id) toolCalls[i].id = tc.id
          if (tc.function?.name) toolCalls[i].function.name = tc.function.name
          if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason
    }
  }

  const assembled = toolCalls.filter(Boolean)
  return {
    message: {
      role: 'assistant',
      content: content || null,
      tool_calls: assembled.length ? assembled : undefined,
    },
    finishReason,
    usage: { inputTokens, outputTokens },
  }
}
