/**
 * Graphify service — the ONLY place that shells out to the `graphify` CLI.
 *
 * Generates a per-project code knowledge graph (graph.json + graph.html) with
 * ZERO AI/token cost (AST-only `graphify update`), and manages the isolated,
 * removable OpenCode "graphify-navigation" skill that tells the agent to query
 * the graph. See Graphify-Impliment.md for the full design.
 *
 * Key invariants:
 *  - Graph artifacts live in the user-owned workspace: <workspaceDir>/graphify-out/
 *  - The skill lives in the isolated HOME: .config/opencode/skills/graphify-navigation/
 *    (NEVER merged into the Minecraft AGENTS.md or its 8 skills)
 *  - Builds/queries cost 0 AuroraCraft tokens (no token-service involvement)
 *  - Enforcement is by skill presence; aurora-sandbox is NOT wired (dead code)
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, copyFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { users } from '../db/schema/users.js'
import { getProjectConfigDirectory } from './provider-config.js'

const execFileAsync = promisify(execFile)

const GRAPHIFY_BIN = '/usr/local/bin/graphify'
const KNOWLEDGE_BASE = '/root/AuroraCraft/opencode-knowledge'
const GRAPHIFY_SKILL_NAME = 'graphify-navigation'
const BUILD_TIMEOUT_MS = 300_000

type GraphifyStatus = 'none' | 'building' | 'ready' | 'failed'

function isRoot(): boolean {
  return process.getuid?.() === 0
}

/** Single-quote escape for safe inclusion in a `sh -c` string. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Map /home/auroracraft-<user>/<linkId> → { systemUser, linkId }. */
function parseWorkspaceDir(directory: string): { systemUser: string; linkId: string } | null {
  const m = directory.match(/^\/home\/(auroracraft-[^/]+)\/(.+)$/)
  if (!m) return null
  return { systemUser: m[1], linkId: m[2] }
}

/** The workspace (code) directory for a project. Mirrors agents.ts getProjectDirectory. */
export function getWorkspaceDir(username: string, linkId: string): string {
  return `/home/auroracraft-${username.toLowerCase()}/${linkId}`
}

/** Absolute path of the isolated graphify skill dir for a project. */
function skillDir(directory: string): string {
  return join(getProjectConfigDirectory(directory), '.config', 'opencode', 'skills', GRAPHIFY_SKILL_NAME)
}

/** Run a shell command as the project's Linux system user (mirrors process manager). */
async function runAsUser(systemUser: string, shellCmd: string, timeoutMs = BUILD_TIMEOUT_MS): Promise<void> {
  const runuserArgs = ['-l', systemUser, '-c', shellCmd]
  const opts = { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }
  if (isRoot()) {
    await execFileAsync('runuser', runuserArgs, opts)
  } else {
    await execFileAsync('sudo', ['runuser', ...runuserArgs], opts)
  }
}

/** chown -R <user>:<user> a path (so OpenCode, running as that user, can read it). */
async function chownToUser(path: string, systemUser: string): Promise<void> {
  const args = ['-R', `${systemUser}:${systemUser}`, path]
  if (isRoot()) {
    await execFileAsync('chown', args)
  } else {
    await execFileAsync('sudo', ['chown', ...args])
  }
}

// ── Per-project serialization lock (keyed by workspace dir) ──────────────────
// Prevents "graph deleted mid-build" races when a session-end rebuild overlaps
// a new build/remove for the same project.
const inFlight = new Map<string, Promise<void>>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = inFlight.get(key) ?? Promise.resolve()
  const result = prev.catch(() => {}).then(fn)
  const done = result.then(() => {}, () => {})
  inFlight.set(key, done)
  void done.then(() => {
    if (inFlight.get(key) === done) inFlight.delete(key)
  })
  return result
}

async function setStatus(projectId: string, status: GraphifyStatus, builtAt?: Date | null): Promise<void> {
  if (builtAt !== undefined) {
    await db.update(projects)
      .set({ graphifyStatus: status, graphifyBuiltAt: builtAt, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  } else {
    await db.update(projects)
      .set({ graphifyStatus: status, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  }
}

// ── Skill management (isolated, never touches Minecraft rules) ───────────────

/** Copy the graphify-navigation skill into the project's isolated OpenCode HOME. */
export async function writeGraphifySkill(directory: string): Promise<void> {
  const src = join(KNOWLEDGE_BASE, 'skills', GRAPHIFY_SKILL_NAME, 'SKILL.md')
  if (!existsSync(src)) {
    console.warn(`[Graphify] skill source missing: ${src} — agent guidance will be absent`)
    return
  }
  const dest = skillDir(directory)
  await mkdir(dest, { recursive: true })
  await copyFile(src, join(dest, 'SKILL.md'))
  const parsed = parseWorkspaceDir(directory)
  if (parsed) {
    try {
      await chownToUser(dest, parsed.systemUser)
    } catch (err) {
      console.warn(`[Graphify] chown skill dir failed for ${dest}:`, err instanceof Error ? err.message : err)
    }
  }
}

/** Remove ONLY the graphify-navigation skill dir. Never the parent skills/ or .config/opencode. */
export async function removeGraphifySkill(directory: string): Promise<void> {
  await rm(skillDir(directory), { recursive: true, force: true })
}

// ── Build / remove ───────────────────────────────────────────────────────────

/** Internal: delete + full structural (no-AI) rebuild, under the per-project lock. */
function runBuildLocked(projectId: string, directory: string): Promise<void> {
  const parsed = parseWorkspaceDir(directory)
  if (!parsed) {
    console.warn(`[Graphify] cannot build — unexpected workspace path: ${directory}`)
    return setStatus(projectId, 'failed').catch(() => {})
  }
  const { systemUser } = parsed
  return withLock(directory, async () => {
    try {
      // Full rebuild (not incremental): delete then re-extract. Code-only ⇒ no LLM, 0 tokens.
      // GEMINI/GOOGLE keys are unset so graphify can never trigger paid semantic extraction.
      const shellCmd =
        `cd ${shellQuote(directory)} && ` +
        `rm -rf graphify-out && ` +
        `unset GEMINI_API_KEY GOOGLE_API_KEY && ` +
        `${shellQuote(GRAPHIFY_BIN)} update . --force`
      await runAsUser(systemUser, shellCmd)

      const graphJson = join(directory, 'graphify-out', 'graph.json')
      const graphHtml = join(directory, 'graphify-out', 'graph.html')
      if (!existsSync(graphJson) || !existsSync(graphHtml)) {
        throw new Error('graph.json / graph.html missing after build')
      }

      await writeGraphifySkill(directory)
      await setStatus(projectId, 'ready', new Date())
      console.log(`[Graphify] graph ready for ${directory}`)
    } catch (err: unknown) {
      const e = err as { message?: string; stderr?: string; stdout?: string }
      const detail = [e?.stdout, e?.stderr].filter(Boolean).join('\n').trim()
      console.error(`[Graphify] build failed for ${directory}: ${e?.message ?? err}${detail ? `\n${detail}` : ''}`)
      await setStatus(projectId, 'failed').catch(() => {})
    }
  })
}

/** Public build entry (explicit enable / session-end). Sets status=building then builds. */
export async function buildProjectGraph(projectId: string, directory: string): Promise<void> {
  await setStatus(projectId, 'building').catch(() => {})
  return runBuildLocked(projectId, directory)
}

/** Delete graph artifacts + skill. clearIntent=true also flips graphifyEnabled=false. */
export async function removeProjectGraph(
  projectId: string,
  directory: string,
  opts: { clearIntent: boolean },
): Promise<void> {
  return withLock(directory, async () => {
    try {
      await rm(join(directory, 'graphify-out'), { recursive: true, force: true })
    } catch (err) {
      console.warn(`[Graphify] failed to remove graphify-out for ${directory}:`, err instanceof Error ? err.message : err)
    }
    try {
      await removeGraphifySkill(directory)
    } catch (err) {
      console.warn(`[Graphify] failed to remove skill for ${directory}:`, err instanceof Error ? err.message : err)
    }
    if (opts.clearIntent) {
      await db.update(projects)
        .set({ graphifyEnabled: false, graphifyStatus: 'none', graphifyBuiltAt: null, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
    } else {
      await db.update(projects)
        .set({ graphifyStatus: 'none', graphifyBuiltAt: null, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
    }
  })
}

// ── Lifecycle reconcilers ─────────────────────────────────────────────────────

/**
 * Called fire-and-forget from the OpenCode process manager when a session ends
 * (idle timeout / exit). Rebuilds the graph IF the project is still graphify-active.
 * Re-checks live DB state so removal/demotion mid-session is respected.
 */
export async function onSessionEnd(directory: string): Promise<void> {
  try {
    const parsed = parseWorkspaceDir(directory)
    if (!parsed) return
    const rows = await db
      .select({ id: projects.id, enabled: projects.graphifyEnabled, tier: users.tier })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .where(eq(projects.linkId, parsed.linkId))
      .limit(1)
    const row = rows[0]
    if (!row || !row.enabled || row.tier !== 'paid') return
    await buildProjectGraph(row.id, directory)
  } catch (err) {
    console.error(`[Graphify] onSessionEnd failed for ${directory}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Called fire-and-forget from GET /api/projects/:id. Lazy (re-promotion) rebuild:
 * if the project is graphify-active but has no graph (status 'none'), atomically
 * claim it (none→building) and build. The atomic claim prevents duplicate builds
 * from rapid workspace polling.
 */
export async function reconcileOnWorkspaceOpen(
  project: { id: string; linkId: string | null; graphifyEnabled: boolean; graphifyStatus: GraphifyStatus | string },
  user: { username: string; tier: 'free' | 'paid' | null | undefined },
): Promise<void> {
  try {
    if (!project.linkId) return
    if (user.tier !== 'paid') return
    if (!project.graphifyEnabled) return
    if (project.graphifyStatus !== 'none') return

    const claimed = await db.update(projects)
      .set({ graphifyStatus: 'building', updatedAt: new Date() })
      .where(and(eq(projects.id, project.id), eq(projects.graphifyStatus, 'none')))
      .returning({ id: projects.id })
    if (claimed.length === 0) return // another request already claimed the build

    const directory = getWorkspaceDir(user.username, project.linkId)
    await runBuildLocked(project.id, directory)
  } catch (err) {
    console.error('[Graphify] reconcileOnWorkspaceOpen failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Tier demotion (paid → free): remove graph artifacts + skill from ALL of the
 * user's graphify-enabled projects. PRESERVES intent (graphifyEnabled stays true)
 * so a later promotion auto-rebuilds.
 */
export async function cleanupUserGraphify(userId: string): Promise<void> {
  try {
    const owner = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1)
    const username = owner[0]?.username
    if (!username) return
    const rows = await db
      .select({ id: projects.id, linkId: projects.linkId })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.graphifyEnabled, true)))
    for (const r of rows) {
      if (!r.linkId) continue
      await removeProjectGraph(r.id, getWorkspaceDir(username, r.linkId), { clearIntent: false })
    }
  } catch (err) {
    console.error(`[Graphify] cleanupUserGraphify failed for ${userId}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Tier promotion (free → paid): reset enabled projects to status 'none' so the
 * lazy workspace-open hook rebuilds them. No eager build.
 */
export async function markUserForRebuild(userId: string): Promise<void> {
  try {
    await db.update(projects)
      .set({ graphifyStatus: 'none', graphifyBuiltAt: null, updatedAt: new Date() })
      .where(and(eq(projects.userId, userId), eq(projects.graphifyEnabled, true)))
  } catch (err) {
    console.error(`[Graphify] markUserForRebuild failed for ${userId}:`, err instanceof Error ? err.message : err)
  }
}
