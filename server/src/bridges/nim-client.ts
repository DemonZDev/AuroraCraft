export interface NimMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: NimToolCall[]
  name?: string
}

export interface NimToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface NimToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface NimUsage {
  promptTokens: number
  completionTokens: number
  cachedTokens: number
}

export interface NimChatResult {
  content: string
  reasoning: string
  toolCalls: NimToolCall[]
  finishReason: string | null
  usage: NimUsage
}

export class NimError extends Error {
  status?: number
  aborted: boolean
  constructor(message: string, status?: number, aborted = false) {
    super(message)
    this.name = 'NimError'
    this.status = status
    this.aborted = aborted
  }
}

// 5 min per call; the overall 30-min job deadline is enforced by the engine.
const PER_CALL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * One chat-completions call against NVIDIA NIM (OpenAI-compatible).
 * `signal` is the engine's overall-job AbortController signal; we also add a
 * per-call timeout so a single hung request cannot stall the whole job.
 * The API key is never logged.
 */
export async function nimChat(opts: {
  apiKey: string
  baseUrl: string
  slug: string
  messages: NimMessage[]
  tools?: NimToolDef[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}): Promise<NimChatResult> {
  const { apiKey, baseUrl, slug, messages, tools, maxTokens = 8192, temperature = 0.4, signal } = opts

  const perCall = new AbortController()
  const timer = setTimeout(() => perCall.abort(), PER_CALL_TIMEOUT_MS)
  const onParentAbort = () => perCall.abort()
  if (signal) {
    if (signal.aborted) perCall.abort()
    else signal.addEventListener('abort', onParentAbort, { once: true })
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: slug,
        messages,
        ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: perCall.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new NimError(`NIM ${res.status}: ${body.slice(0, 300)}`, res.status)
    }

    const json = await res.json() as {
      choices?: Array<{
        message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: NimToolCall[] }
        finish_reason?: string | null
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
      }
    }
    const choice = json.choices?.[0]
    return {
      content: choice?.message?.content ?? '',
      reasoning: choice?.message?.reasoning_content ?? '',
      toolCalls: choice?.message?.tool_calls ?? [],
      finishReason: choice?.finish_reason ?? null,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        cachedTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    }
  } catch (err) {
    if (err instanceof NimError) throw err
    const aborted = (err as Error)?.name === 'AbortError'
    throw new NimError(
      aborted ? 'NIM request aborted' : `NIM request failed: ${(err as Error)?.message}`,
      undefined,
      aborted,
    )
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onParentAbort)
  }
}
