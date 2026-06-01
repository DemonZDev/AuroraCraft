import { promises as fs } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { codeReviews } from '../db/schema/code-reviews.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { agentMessages } from '../db/schema/agent-messages.js'
import type { NimToolDef } from '../bridges/nim-client.js'
import type { AssistantJobContext } from './assistant-types.js'

// All Assistant tools are READ-ONLY. They run in-process (the server can read any
// workspace) and never mutate files, the DB, or processes.

const MAX_FILE_BYTES = 200_000
const IGNORED_DIRS = new Set(['node_modules', '.git', 'target', 'build', '.gradle', 'graphify-out', '.config', 'dist'])

export const ASSISTANT_TOOLS: NimToolDef[] = [
  { type: 'function', function: { name: 'list_project_files', description: 'List all source files in the project (relative paths).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a UTF-8 text file by project-relative path.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Project-relative file path' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'read_code_reviews', description: 'Read recent code review results and their issues.', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'read_agent_messages', description: 'Read the messages (user prompts, agent thinking, text, file operations) for an agent session. Omit sessionId for the most recent session.', parameters: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } } } } },
]

function safeJoin(workspaceDir: string, rel: string): string | null {
  const target = resolve(workspaceDir, rel)
  const rl = relative(workspaceDir, target)
  if (rl.startsWith('..') || isAbsolute(rl)) return null
  return target
}

async function walk(dir: string, base: string, out: string[], depth = 0): Promise<void> {
  if (depth > 12 || out.length > 4000) return
  let entries: Array<{ name: string; isDirectory(): boolean }> = []
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as any
  } catch {
    return
  }
  for (const e of entries) {
    if (IGNORED_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, base, out, depth + 1)
    else out.push(relative(base, full))
  }
}

export async function executeAssistantTool(
  ctx: AssistantJobContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'list_project_files': {
      const out: string[] = []
      await walk(ctx.workspaceDir, ctx.workspaceDir, out)
      return out.length ? out.sort().join('\n') : '(no source files found)'
    }
    case 'read_file': {
      const rel = String(args.path ?? '')
      const target = safeJoin(ctx.workspaceDir, rel)
      if (!target) return `ERROR: path outside workspace: ${rel}`
      try {
        const stat = await fs.stat(target)
        if (stat.size > MAX_FILE_BYTES) return `ERROR: file too large (${stat.size} bytes), max ${MAX_FILE_BYTES}`
        return await fs.readFile(target, 'utf8')
      } catch (e: any) {
        return `ERROR: cannot read ${rel}: ${e?.message ?? e}`
      }
    }
    case 'read_code_reviews': {
      const limit = Math.min(Number(args.limit ?? 5), 20)
      const rows = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.projectId, ctx.projectId))
        .orderBy(desc(codeReviews.createdAt))
        .limit(limit)
      return JSON.stringify(
        rows.map((r) => ({ id: r.id, status: r.status, scope: r.scope, createdAt: r.createdAt, issues: r.issuesJson ?? [] })),
        null,
        2,
      )
    }
    case 'read_agent_messages': {
      let sessionId = args.sessionId ? String(args.sessionId) : null
      if (!sessionId) {
        const [s] = await db
          .select({ id: agentSessions.id })
          .from(agentSessions)
          .where(eq(agentSessions.projectId, ctx.projectId))
          .orderBy(desc(agentSessions.createdAt))
          .limit(1)
        sessionId = s?.id ?? null
      }
      if (!sessionId) return '(no agent session found)'
      const limit = Math.min(Number(args.limit ?? 50), 200)
      const msgs = await db
        .select()
        .from(agentMessages)
        .where(eq(agentMessages.sessionId, sessionId))
        .orderBy(agentMessages.createdAt)
        .limit(limit)
      return JSON.stringify(
        msgs.map((m) => ({ role: m.role, content: m.content, parts: (m.metadata as any)?.parts ?? [] })),
        null,
        2,
      )
    }
    default:
      return `ERROR: unknown tool ${name}`
  }
}
