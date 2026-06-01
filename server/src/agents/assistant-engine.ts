import { nimChat, type NimMessage } from '../bridges/nim-client.js'
import { ASSISTANT_TOOLS, executeAssistantTool } from './assistant-tools.js'
import { assistantModelOrDefault } from '../config/assistant-models.js'
import { getMemory, setMemory } from '../utils/assistant-memory.js'
import {
  ASSISTANT_MAX_TOOL_ROUNDS,
  ERROR_FIX_MAX_CHARS,
  type AssistantJobContext,
  type EnhanceStyle,
  type UsageTotals,
  type EnhanceArtifact,
  type ErrorFixArtifact,
  type PostSessionArtifact,
} from './assistant-types.js'

export type ProgressFn = (e: {
  type: 'status' | 'thinking' | 'text-delta' | 'tool'
  content?: string
  tool?: string
}) => void

const STYLE_GUIDE: Record<EnhanceStyle, string> = {
  optimized:
    'Rewrite the user request into an OPTIMIZED, well-structured prompt for a Minecraft-plugin coding agent. Improve clarity, add missing technical specifics you can infer, and structure it with clear sections (Goal, Requirements, Constraints, Acceptance). Keep the user’s intent; do not invent unrelated features.',
  structured:
    'Restructure the user request into clear sections (Goal, Requirements, Constraints, Acceptance) WITHOUT changing scope or optimizing wording. Faithful restructuring only.',
  explanatory:
    'Restructure the user request and add brief explanations of HOW each requested feature should work, so the coding agent understands the intended behaviour. Do not add new features.',
  feature_adding:
    'Restructure the user request AND propose a few SAFE, clearly-labelled additional features that fit this plugin. Put additions under an "Optional additions" section so they are obviously separate from the core request.',
}

async function runAgenticLoop(
  ctx: AssistantJobContext,
  system: string,
  user: string,
  usage: UsageTotals,
  onProgress: ProgressFn,
  jsonMode = false,
): Promise<string> {
  const model = assistantModelOrDefault(ctx.model)
  const memory = await getMemory(ctx.projectId)
  const messages: NimMessage[] = [
    {
      role: 'system',
      content:
        system +
        (memory ? `\n\n## Project memory (prior context)\n${memory}` : '') +
        (jsonMode ? '\n\nRespond with a single valid JSON object and nothing else.' : ''),
    },
    { role: 'user', content: user },
  ]

  for (let round = 0; round < ASSISTANT_MAX_TOOL_ROUNDS; round++) {
    if (ctx.signal.aborted) throw new Error('aborted')
    onProgress({ type: 'status', content: `thinking (round ${round + 1})` })
    const res = await nimChat({ apiKey: ctx.apiKey, model: model.nimModelId, messages, tools: ASSISTANT_TOOLS, signal: ctx.signal })
    usage.inputTokens += res.usage.inputTokens
    usage.outputTokens += res.usage.outputTokens
    const msg = res.message
    if (msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })
      for (const tc of msg.tool_calls) {
        onProgress({ type: 'tool', tool: tc.function.name })
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(tc.function.arguments || '{}')
        } catch {
          /* tolerate malformed tool args */
        }
        const result = await executeAssistantTool(ctx, tc.function.name, parsed)
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result.slice(0, 60_000) })
      }
      continue
    }
    const final = msg.content ?? ''
    onProgress({ type: 'text-delta', content: final })
    return final
  }

  // Hit the round cap → force a final answer with no tools.
  const res = await nimChat({ apiKey: ctx.apiKey, model: model.nimModelId, messages, signal: ctx.signal })
  usage.inputTokens += res.usage.inputTokens
  usage.outputTokens += res.usage.outputTokens
  return res.message.content ?? ''
}

export async function runEnhance(
  ctx: AssistantJobContext,
  input: { prompt: string; style: EnhanceStyle; feedback?: string; previousDraft?: string },
  usage: UsageTotals,
  onProgress: ProgressFn,
): Promise<EnhanceArtifact> {
  const system = `You are AuroraCraft's prompt-enhancing assistant for a Minecraft plugin coding agent. You only READ the project for context; you never write code. ${STYLE_GUIDE[input.style]} Use the read-only tools to understand the existing plugin when helpful. Output ONLY the final enhanced prompt text (no preamble, no commentary).`
  let user = `User's original request:\n"""\n${input.prompt}\n"""`
  if (input.feedback && input.previousDraft) {
    user += `\n\nYou previously produced this enhanced prompt:\n"""\n${input.previousDraft}\n"""\n\nThe user asked you to change it as follows:\n"""\n${input.feedback}\n"""\n\nProduce the revised enhanced prompt.`
  }
  const prompt = (await runAgenticLoop(ctx, system, user, usage, onProgress)).trim()
  return { prompt }
}

export async function runErrorFix(
  ctx: AssistantJobContext,
  input: { issues: Array<{ severity?: string; fileName?: string; codegenInstructions?: string; message?: string }> },
  usage: UsageTotals,
  onProgress: ProgressFn,
): Promise<ErrorFixArtifact> {
  const system = `You are AuroraCraft's fix-prompt assistant. You only READ the project for context; you never write code. Given a set of code-review issues, produce a SINGLE highly-detailed, well-explained prompt instructing the coding agent how to fix every issue. Reference exact files and explain the fix rationale. Use the read-only tools to inspect the affected files. The output MUST be under ${ERROR_FIX_MAX_CHARS} characters. Output ONLY the fix prompt.`
  const user = `Code-review issues to fix:\n${JSON.stringify(input.issues, null, 2)}`
  let prompt = (await runAgenticLoop(ctx, system, user, usage, onProgress)).trim()
  if (prompt.length > ERROR_FIX_MAX_CHARS) prompt = prompt.slice(0, ERROR_FIX_MAX_CHARS)
  return { prompt }
}

export async function runPostSession(
  ctx: AssistantJobContext,
  input: { sessionId: string | null },
  usage: UsageTotals,
  onProgress: ProgressFn,
): Promise<PostSessionArtifact> {
  const system = `You are AuroraCraft's post-session analyst. You only READ. Inspect what the coding agent just did this session: read the user's request, the agent's thinking/text, the file operations (created/updated/deleted/renamed), and the current code-review state. Then determine: (1) did the agent complete its work? (2) did it report any issues/problems? (3) did it stop mid-work (user cancel / error / unexpected)? Recommend the single best next action and provide a concise updated project-memory summary.

Use tools: read_agent_messages (omit sessionId for the latest session), list_project_files, read_file, read_code_reviews.

Respond with JSON exactly matching this TypeScript type:
{
  "analysis": { "completed": boolean, "stoppedMidway": boolean, "issues": string[], "reason": string, "summary": string },
  "recommendation": string,
  "actions": Array<{ "id": string, "type": "send_prompt"|"graphify"|"code_review"|"git_push", "label": string, "prompt"?: string }>,
  "memorySummary": string
}
Rules for actions: include a "send_prompt" action (with a ready-to-send prompt) when more agent work is needed; include "code_review" when the work should be reviewed; include "graphify" when the codebase changed enough to rebuild the graph; include "git_push" when the work looks complete and worth committing. Keep 1-3 actions, most relevant first.`
  const user = input.sessionId ? `Analyse agent session ${input.sessionId}.` : 'Analyse the most recent agent session.'
  const raw = await runAgenticLoop(ctx, system, user, usage, onProgress, true)
  const parsed = parseJsonLoose(raw)

  // Persist memory (folded into the same analysis call — no extra round-trip).
  const memorySummary = typeof parsed?.memorySummary === 'string' ? parsed.memorySummary : ''
  if (memorySummary) await setMemory(ctx.projectId, memorySummary)

  return {
    analysis: {
      completed: !!parsed?.analysis?.completed,
      stoppedMidway: !!parsed?.analysis?.stoppedMidway,
      issues: Array.isArray(parsed?.analysis?.issues) ? parsed.analysis.issues.map(String) : [],
      reason: String(parsed?.analysis?.reason ?? ''),
      summary: String(parsed?.analysis?.summary ?? ''),
    },
    recommendation: String(parsed?.recommendation ?? ''),
    actions: Array.isArray(parsed?.actions)
      ? parsed.actions.slice(0, 3).map((a: any, i: number) => ({
          id: String(a.id ?? `a${i}`),
          type: ['send_prompt', 'graphify', 'code_review', 'git_push'].includes(a.type) ? a.type : 'send_prompt',
          label: String(a.label ?? 'Do it'),
          prompt: a.prompt ? String(a.prompt) : undefined,
        }))
      : [],
  }
}

function parseJsonLoose(raw: string): any {
  try {
    return JSON.parse(raw)
  } catch {
    /* fall through */
  }
  const a = raw.indexOf('{')
  const b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(raw.slice(a, b + 1))
    } catch {
      /* ignore */
    }
  }
  return {}
}
