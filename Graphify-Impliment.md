# Graphify Integration — Implementation Specification

> **Purpose of this document.** This is the complete, self-contained build spec for the "Save tokens using Graphify" feature in AuroraCraft. It is written so that if the working context is cleared, an engineer (or Claude) can read **only this file** and implement the remaining work correctly. Every integration point cites a real file and line range verified against the codebase on 2026-05-31.
>
> **STATUS: IMPLEMENTED & VALIDATED ON THE LIVE SYSTEM (2026-05-31).** Phases 1–8 are built; server + client compile with 0 errors; the full lifecycle was tested against the running server: enable → no-AI build (`building`→`ready`) → `graph.html` viewer (200) → remove (artifacts + skill gone, 8 Minecraft skills intact). The graph-build runs as the `auroracraft-*` user at **0 tokens** (verified: no `cost.json`). Migration `0017` applied to the live DB and the drizzle tracking reconciled.
>
> **Not yet exercised end-to-end (require a browser / live AI session / risky on the live admin):** the UI buttons render path, the **session-end** auto-rebuild (needs a real OpenCode session + 120s idle), and **tier demotion/promotion** hooks (not run live to avoid disrupting the admin account). All are wired and type-clean — see §15 for the manual test steps.
>
> **Most important correction from validation:** the `aurora-sandbox` wrapper is **dead code / not on the command path**, so command gating is by **skill presence** (§8.3), not by editing the sandbox. Empty (code-less) projects fail the build by design (`graphify` exits "No code files found") → status `failed`, no retry loop.

---

## 1. Feature Summary

AuroraCraft lets users build Minecraft plugins with AI (OpenCode agent). Graphify converts a project's code into a local knowledge graph (`graph.json` + `graph.html`) that the AI queries instead of re-reading files — saving input tokens on every subsequent message. The graph is generated **with zero AI/token cost** (AST-only) because plugin projects are code-only.

### Scenario 1 — AI-built project
1. User creates a project, builds a plugin with a premium model (normal flow today).
2. A **"Save tokens using Graphify"** button appears in the workspace (paid users only).
3. Clicking it generates `graph.json` + `graph.html` with **no AI** (AST structural build).
4. On every later AI message, the agent uses `graphify query/path/explain` to navigate the code and build better with fewer tokens.
5. **When the session ends** (idle timeout), `graphify-out/` is **fully deleted and rebuilt** (not incremental update) — still no AI — so the graph reflects the latest code.
6. The user can **"Remove Graphify"** at any time → all Graphify artifacts + rules are removed.

### Scenario 2 — Imported/cloned project
1. User uploads a ZIP or clones a git repo (existing paid-only flows).
2. On entering the workspace, the **"Save tokens using Graphify"** button is available immediately — **no first AI message required**.
3. One click builds the graph.

### Hard constraints (locked)
- **Paid-only.** Free users never see "Save tokens using Graphify", "Remove Graphify", or "View Graph".
- **Tier demotion** (paid → free): Graphify artifacts + rules are removed from **all** the user's projects, and do **not** regenerate. **Intent is preserved.**
- **Tier promotion** (free → paid): projects that previously had Graphify regenerate **lazily on next workspace open**.
- **Rebuild trigger:** only when the OpenCode **session ends** (idle timeout) — not after every message.
- **Graph viewing:** served over localhost from the backend; viewable inside the workspace (no domain needed).
- **Shared runtime, isolated data:** the Graphify binary/venv is shared (space-saving); each project's **graph** and **OpenCode Graphify rule/skill** are strictly per-project isolated.
- **No merge:** the Graphify OpenCode rule/skill must **never** be merged into AuroraCraft's existing Minecraft `AGENTS.md` or its 8 Minecraft skills. It lives as a **separate, independently removable skill**.
- **Command gating:** the `graphify` command is available to the OpenCode agent **only** when the project's graph exists; if there's no Graphify, the command is blocked.

---

## 2. Key Facts About Graphify (verified)

Installed CLI: `graphify 0.8.22` at `/root/.local/bin/graphify` (must be moved to a shared/global location for prod — see §12).

### 2.1 No-AI build is real for code-only projects
- Graphify has two extraction layers: **structural (AST, deterministic, free)** and **semantic (LLM, costs tokens)**.
- For a **code-only corpus** (only `.java`/`.kt`/etc., no `.md`/PDF/images), Graphify **skips the semantic LLM pass entirely**, even on a full build. Source: the upstream SKILL.md (`~/.claude/skills/graphify/SKILL.md`) "code-only corpus → skip Part B entirely" and `update`'s "code-only changes → skipping semantic extraction (no LLM needed)".
- **A Minecraft plugin project is code-only** → a full from-scratch build is **zero tokens**.
- **Supported code extensions** include `.java`, `.kt`, `.kts`, `.scala`, plus `.py/.ts/.js/.go/.rs/...` (SKILL.md `code_exts` set). **Gradle/Maven build scripts** (`.gradle`, `pom.xml`) are **not** AST-parsed as code — acceptable; the value is the plugin source graph.

### 2.2 Build command (canonical)
The **only documented no-LLM build path is `graphify update`** (`update <path> — re-extract code files and update the graph (no LLM needed)`). `graphify extract` exists but is "AST + semantic LLM" and expects an LLM backend — **do not use it**.

To honor "fully removed and regenerated (not update)" **and** "no AI", the build = **delete then full structural rebuild**:

```bash
cd '<projectDir>' \
  && rm -rf graphify-out \
  && /usr/local/bin/graphify update . --force
```
- `--force` overwrites even if node count drops (safe after refactors that delete code).
- Run with `GEMINI_API_KEY` / `GOOGLE_API_KEY` **unset** (Graphify only reads those two for semantic; absent ⇒ falls through to no-LLM for code-only). It does **not** read `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`.
- `graphify-out/graph.html` is generated by default (omit `--no-viz`). Consider `--no-viz` only for very large graphs (>5000 nodes) — see §16.
- **✅ VERIFIED (2026-05-31):** `graphify update . --force` builds correctly **from an empty state** (it does a full "re-extract", no prior graph needed). Java test → 7 nodes/6 edges; Kotlin test → 5 nodes/5 edges with real symbol labels (`Greeter`, `.greet()`, `.onEnable()`). Exit 0, **no `cost.json` → zero tokens**, no network/API-key prompt. Output literally prints `Re-extracting code files in . (no LLM needed)...`.
- **Outputs produced by a build:** `graph.json`, `graph.html`, **and also** `GRAPH_REPORT.md`, `manifest.json`, `.graphify_labels.json`, `.graphify_root`, and a `cache/` dir — all inside `graphify-out/`. All AST-derived (no AI). We `rm -rf graphify-out` before each build, so the `cache/` is rebuilt fresh every time ⇒ guarantees a true full rebuild (not incremental). We only *surface* `graph.json` + `graph.html`; the rest is harmless.

### 2.3 Query commands are local & free (the token-saving mechanism)
`query`, `path`, `explain`, `affected` are pure traversals over `graph.json` — **no network, no LLM, no tokens**. These are what the agent runs during a build.
- `graphify query "<question>"` — BFS over the graph; `--budget N` caps output (default 2000 tokens).
- `graphify path "A" "B"`, `graphify explain "X"`, `graphify affected "X"`.
- **Matcher caveat:** case-folded substring + IDF, **no stemming/synonyms**. The agent must query using code-symbol vocabulary (class/method names). Bake this guidance into the Graphify skill (§8.1).

### 2.4 Things we deliberately do NOT use
- **`graphify opencode install`** — writes a graphify section **into `AGENTS.md`** + a `tool.execute.before` plugin. This **merges** with the Minecraft AGENTS.md → **forbidden** by the no-merge constraint. We replicate the useful part as an isolated skill instead.
- **`graphify extract`** — pulls in an LLM backend (costs tokens / may hang without a key).
- **`--global` / `global add`** — writes to `~/.graphify/global-graph.json` (cross-project). We keep graphs strictly per-project → never pass `--global`.
- **`GRAPH_REPORT.md`** — not requested; the `update` path **does** emit it (verified), but it's AST-derived (no AI, no tokens), so harmless. We simply don't surface it.

---

## 3. Tier State Machine (the subtle core)

Two independent pieces of state per project:
- **`graphifyEnabled`** (intent): user clicked "Save tokens". Persists across demotion. Cleared only by explicit "Remove Graphify".
- **`graphifyStatus`** (runtime): `none | building | ready | failed`. Reflects disk/build state.

**Effective active** = `graphifyEnabled && user.tier === 'paid'`.

| Event | `graphifyEnabled` | Files on disk | `graphifyStatus` | Skill in HOME |
|---|---|---|---|---|
| Paid user clicks "Save tokens" | → `true` | built (no AI) | `building`→`ready` | written |
| Session ends (idle) while active | unchanged | wiped + full rebuild | `building`→`ready` | unchanged |
| Paid user clicks "Remove Graphify" | → **`false`** | deleted | `none` | removed |
| **Demoted paid→free** | **stays `true`** | deleted (all projects) | `none` | removed |
| **Promoted free→paid** | still `true` | (rebuilt lazily on workspace open) | `none`→`building`→`ready` | rewritten on rebuild |
| Free user (any) | — | — | buttons hidden | — |

Rule: **demotion deletes artifacts but preserves intent**; **only explicit "Remove" clears intent**.

---

## 4. Architecture: Shared vs Isolated

| Layer | Shared (global, space-saving) | Isolated (per project) |
|---|---|---|
| graphify binary + Python venv | ✅ `/var/lib/graphify/shared/venv` + wrapper `/usr/local/bin/graphify` | — |
| tree-sitter grammars / runtime | ✅ bundled in the shared venv | — |
| **The graph** (`graphify-out/`) | — | ✅ `<projectDir>/graphify-out/` (user-owned) |
| **Graphify OpenCode skill** | — | ✅ isolated HOME `.config/opencode/skills/graphify-navigation/` |

**Key absolute paths (verified):**
- Project workspace (code, CWD): `/home/auroracraft-{username.toLowerCase()}/{linkId}` — `server/src/routes/agents.ts:45-48` `getProjectDirectory()`.
- Isolated HOME (rules/skills/config): `/var/lib/auroracraft/configs/auroracraft-{username}/{linkId}` — `server/src/utils/provider-config.ts:30-38` `getProjectConfigDirectory()`. Skills dir: `.../.config/opencode/skills/`.
- Graph lives in the **workspace** (so `graphify` can scan code and the agent finds `graphify-out/graph.json` relative to CWD). Skill lives in the **isolated HOME** (OpenCode auto-discovers it via `HOME`).

---

## 5. Data Model Changes

**File:** `server/src/db/schema/projects.ts` (current table def at lines 10-31, `pgTable('projects', {...})`).

Add a status enum near the existing enums (top of file, alongside `projectStatusEnum` etc.):
```ts
export const graphifyStatusEnum = pgEnum('graphify_status', ['none', 'building', 'ready', 'failed'])
```
Add three columns to the `projects` table (after `repoBranch`, before `createdAt`):
```ts
  graphifyEnabled: boolean('graphify_enabled').default(false).notNull(),
  graphifyStatus: graphifyStatusEnum('graphify_status').default('none').notNull(),
  graphifyBuiltAt: timestamp('graphify_built_at', { withTimezone: true }),
```
- `boolean` is already imported in sibling schemas (`users.ts` uses `boolean`); ensure `boolean` and `pgEnum` are imported in `projects.ts`.

**Migration — ✅ DONE & APPLIED to live DB (2026-05-31):** `server/drizzle/0017_uneven_giant_man.sql`.

> **⚠️ Migration-tooling drift discovered & handled.** `pnpm db:generate` produced a *bad* auto-diff that re-created pre-existing objects (tables/types/columns from 0011–0016) because drizzle's snapshot baseline was stale. Worse, the DB's `drizzle.__drizzle_migrations` tracking was stuck at entry **#14** while the DB actually had 0015/0016 applied (they were run **manually via psql**, bypassing the migrator). So `pnpm db:migrate` would try to re-run 0015/0016/0017 and **fail on 0016**. Resolution actually applied:
> 1. Rewrote `0017_*.sql` to be **graphify-only + idempotent** (`DO $$ CREATE TYPE … EXCEPTION WHEN duplicate_object` + `ADD COLUMN IF NOT EXISTS ×3`).
> 2. Applied it directly via `psql -1` (verified: 3 columns + enum present; all 15 existing projects defaulted to `enabled=false`/`status=none`).
> 3. Inserted a `__drizzle_migrations` row for 0017 with `created_at=1780246635662` (the journal `when`) and resynced the id sequence. Since the migrator keys off `MAX(created_at)`, future `pnpm db:migrate` now skips everything ≤0017 → the pre-existing 0015/0016 landmine is sidestepped.
> 4. `meta/0017_snapshot.json` is now a **correct full baseline**, so future `generate` diffs will be clean.
>
> **For a fresh environment** (clean DB): the idempotent 0017 + all prior migrations apply normally; no special steps. The reconciliation above was only needed for *this* already-live DB.

Drizzle config: `server/drizzle.config.ts` (`schema: './src/db/schema/*'`, `out: './drizzle'`).

**Frontend type:** add the same three fields to `Project` in `client/src/types/index.ts` (interface at lines 14-32):
```ts
  graphifyEnabled: boolean
  graphifyStatus: 'none' | 'building' | 'ready' | 'failed'
  graphifyBuiltAt: string | null
```

---

## 6. New Backend Module — `server/src/utils/graphify-service.ts`

This is the heart of the feature. It is the **only** place that shells out to `graphify`. It owns build/remove, the per-project lock, DB status updates, skill management, and the lifecycle reconcilers. It mirrors existing patterns: `runuser` spawning (`opencode-process-manager.ts`), `sudo` helper + uid/gid resolve (`system-user.ts`, `provider-config.ts`), and DB access via drizzle.

### 6.1 Constants & helpers
```ts
const GRAPHIFY_BIN = '/usr/local/bin/graphify'
const CONFIG_BASE = '/var/lib/auroracraft/configs'           // matches provider-config.ts / opencode-knowledge.ts
const GRAPHIFY_SKILL_NAME = 'graphify-navigation'            // isolated skill dir name (NOT one of the 8 Minecraft skills)
const BUILD_TIMEOUT_MS = 300_000

// /home/auroracraft-<user>/<linkId>  → { systemUser, linkId }
function parseProjectDir(dir: string): { systemUser: string; linkId: string } | null

function workspaceDir(username: string, linkId: string): string  // /home/auroracraft-${username.toLowerCase()}/${linkId}
function isolatedSkillDir(username: string, linkId: string): string // ${CONFIG_BASE}/auroracraft-${username}/${linkId}/.config/opencode/skills/${GRAPHIFY_SKILL_NAME}
```
- Reuse the `sudo(cmd,args)` / root-detect pattern from `system-user.ts:13-25`, and `runuser -l <user> -c <shellCmd>` + `shellQuote()` from `opencode-process-manager.ts:50-52,369`.

### 6.2 Per-project lock
```ts
const inFlight = new Map<string, Promise<void>>()   // key: workspaceDir
```
Build/rebuild/remove for a given workspace must serialize. If a build is in flight, new build requests await it (or no-op). Prevents the "graph deleted mid-query" race when a new message lands during a session-end rebuild.

### 6.3 `buildGraph({ username, linkId, projectId })`
1. Set DB `graphifyStatus='building'` for `projectId`.
2. Acquire lock for `workspaceDir`.
3. Run as the user (capture stdout/stderr, `BUILD_TIMEOUT_MS`):
   ```
   sudo runuser -l auroracraft-<user> -c \
     "cd '<workspaceDir>' && rm -rf graphify-out && unset GEMINI_API_KEY GOOGLE_API_KEY && '<GRAPHIFY_BIN>' update . --force"
   ```
4. On success: verify `graphify-out/graph.json` and `graphify-out/graph.html` exist; set `graphifyStatus='ready'`, `graphifyBuiltAt=now()`. Write the Graphify skill (§8.1, idempotent).
5. On failure/timeout: set `graphifyStatus='failed'`; log stderr. Never throw to the HTTP caller (fire-and-forget); surface via status.
6. Release lock.

### 6.4 `removeGraph({ username, linkId, projectId, clearIntent })`
1. Acquire lock.
2. Delete artifacts: `rm -rf '<workspaceDir>/graphify-out'` (run as user, or as root via `sudo rm -rf` since root can remove user files).
3. Remove the isolated skill dir: `rm -rf isolatedSkillDir(...)` (root-owned operation; the isolated HOME is created/chowned by us).
4. DB: `graphifyStatus='none'`, `graphifyBuiltAt=null`; if `clearIntent` then also `graphifyEnabled=false`.
5. Release lock.
- Explicit "Remove Graphify" → `clearIntent=true`. Demotion cleanup → `clearIntent=false`.

### 6.5 Skill management
- `writeGraphifySkill(username, linkId)`: `mkdir -p isolatedSkillDir`, write `SKILL.md` (content in §8.1), chown to the user (uid/gid via `resolveUserIds`, like `provider-config.ts:25-47`). Idempotent.
- `removeGraphifySkill(username, linkId)`: `rm -rf` of **only** `<isolatedHOME>/.config/opencode/skills/graphify-navigation/`. **Never** remove the parent `skills/` or `.config/opencode/` (that's where the Minecraft `AGENTS.md` + 8 skills live — verified in §8.2).
- **Must not touch** `AGENTS.md` or the 8 Minecraft skill dirs (`database-setup, gui-inventory, command-framework, config-management, async-operations, event-handling, scheduler-tasks, paper-components`).

### 6.6 Lifecycle reconcilers
- `onSessionEnd(directory: string)` — called fire-and-forget from the process manager (§9). Parse `directory`→{systemUser,linkId}; map `systemUser` (`auroracraft-x`) back to app username; look up project + owner; if `graphifyEnabled && owner.tier==='paid'` → `buildGraph(...)`. Re-checks live DB state (handles removal/demotion mid-session). Swallow all errors.
- `reconcileOnWorkspaceOpen(project, user)` — called from `GET /api/projects/:id` (§7.1). If `user.tier==='paid' && project.graphifyEnabled && project.graphifyStatus==='none'` → fire-and-forget `buildGraph(...)` (sets `building` immediately so the UI shows progress). Lazy re-promotion path.
- `cleanupUserGraphify(userId)` — demotion (§10). For every project of `userId` with `graphifyEnabled=true`: `removeGraph({clearIntent:false})`. Keep intent.
- `markUserForRebuild(userId)` — promotion (§10). For every project of `userId` with `graphifyEnabled=true`: set `graphifyStatus='none'` (idempotent) so the workspace-open hook rebuilds. No eager build.

### 6.7 Notes
- **Tokens:** builds and queries cost **0 AuroraCraft tokens**. Do **not** touch `token-service.ts`.
- **username vs systemUser:** `systemUser = auroracraft-<appUsername.toLowerCase()>` (`system-user.ts:7-11 toSystemUsername`). `onSessionEnd` only has the directory → it has the *system* user; to get the project/owner, query `projects` by `linkId` (unique) and join `users` — don't rely on reversing the username.

---

## 7. Backend Route Changes

All project routes use `preHandler: [authMiddleware]`; `request.user = { id, username, email, role, tier, createdAt, updatedAt }` (`server/src/middleware/auth.ts`; `tier: 'free'|'paid'|null`). Paid check pattern: `(request.user!.tier ?? 'free') === 'paid'`. Ownership pattern: `and(eq(projects.id, id), eq(projects.userId, request.user!.id))`.

Add a new route module **`server/src/routes/graphify.ts`** (export `graphifyRoutes`) and register it in `server/src/index.ts` alongside the others (lines 41-48, e.g. after `agentRoutes`). Pattern: `await app.register(graphifyRoutes)`.

### 7.1 Hook into workspace-open — `GET /api/projects/:id`
**File:** `server/src/routes/projects.ts:123-137`. Before `return project` (line ~135), add fire-and-forget reconcile (must not block or change the response):
```ts
// Graphify lazy reconcile (re-promotion / missing graph). Fire-and-forget.
if (project) {
  import('../utils/graphify-service.js')
    .then(m => m.reconcileOnWorkspaceOpen(project, request.user!))
    .catch(() => {})
}
return project
```

### 7.2 New endpoints (`server/src/routes/graphify.ts`)
All paid-gated + ownership-checked. Mirror handler/auth style from `projects.ts`.

1. **`GET /api/projects/:id/graphify`** → `{ enabled, status, builtAt }`. Used by the UI to render buttons/poll. (If free tier, can still return `{enabled:false,status:'none'}` or 403 — UI hides anyway; prefer returning state so re-promotion UI is correct.)

2. **`POST /api/projects/:id/graphify`** (enable + build):
   - If `tier!=='paid'` → 403 (`"Graphify requires a paid subscription."`).
   - Load project (ownership). Set `graphifyEnabled=true`, `graphifyStatus='building'`.
   - Fire-and-forget `buildGraph({ username: request.user!.username, linkId: project.linkId, projectId: id })`.
   - Return `{ status: 'building' }` (201/202).

3. **`DELETE /api/projects/:id/graphify`** (explicit remove):
   - If `tier!=='paid'` → 403 (defensive; UI hides for free).
   - `removeGraph({ username, linkId, projectId: id, clearIntent: true })`.
   - Return `{ status: 'none' }`.

4. **`GET /api/projects/:id/graphify/graph.html`** (viewer source):
   - Ownership + paid + `graphifyStatus==='ready'` (else 404).
   - Stream `<workspaceDir>/graphify-out/graph.html` with `Content-Type: text/html; charset=utf-8`. Path is fixed (no user input) → no traversal risk. File may be ~2 MB; stream via `createReadStream` (mirror `projects.ts:907-949` download pattern).
   - **CSP/headers:** `graph.html` contains inline `<script>`. Set a permissive `Content-Security-Policy` for **this response only** (e.g. `script-src 'unsafe-inline' 'self'`) or ensure no global CSP blocks it. Validate rendering (§13).
   - Backend runs as root → can read the user-owned file.

### 7.3 Import/clone (Scenario 2) — no code change required
**✅ VERIFIED route paths:** ZIP import = `POST /api/projects/upload` (`projects.ts:329`); git clone = `POST /api/projects/clone` (`projects.ts:395`). Both drop files into `/home/auroracraft-{username}/{linkId}/`. The "Save tokens using Graphify" button works on these projects with no first AI message because `POST /api/projects/:id/graphify` operates directly on the workspace dir. **No change needed** beyond the project existing on disk.

---

## 8. OpenCode Integration (no-merge) + Command Gating

### 8.1 The isolated Graphify skill
**Source file (new, in repo):** `opencode-knowledge/skills/graphify-navigation/SKILL.md`. **Do NOT** add it to the `skillsToCopy` array in `opencode-knowledge.ts:279-283` (that would merge it into the Minecraft generation). It is copied/removed **only** by `graphify-service.ts` (§6.5), keeping it fully independent.

Skill frontmatter must match the existing format (`opencode-knowledge/skills/event-handling/SKILL.md`): `name, description, license, compatibility: opencode, metadata.category, metadata.difficulty`. Draft body:
```markdown
---
name: graphify-navigation
description: Use the prebuilt code knowledge graph to navigate this project before reading files
license: MIT
compatibility: opencode
metadata:
  category: navigation
  difficulty: beginner
---

# Graphify Navigation

This project has a prebuilt knowledge graph at `graphify-out/graph.json`. Use it to
understand code structure and relationships **before** opening or grepping files — it
saves time and tokens.

## Use these commands (all local, no cost)
- `graphify query "<question>"`   — find relevant symbols/files for a question
- `graphify path "<A>" "<B>"`     — how two symbols are connected
- `graphify explain "<Symbol>"`   — what a class/method connects to
- `graphify affected "<Symbol>"`  — what changes if you modify a symbol

## Rules
1. Before reading/grepping broadly, run `graphify query` with the **exact class/method
   names** likely in the code (the matcher is substring-based — no synonyms/stemming).
2. Use the results to open only the files that matter.
3. Do not run `graphify update`, `extract`, `install`, or any build/clone subcommand —
   the platform rebuilds the graph automatically when your session ends.
```

> **Why a skill, not an AGENTS.md merge or the official plugin:** honors the no-merge constraint, is trivially removable (delete one dir), and never risks corrupting the 14-section Minecraft `AGENTS.md`. (Optional future enhancement: an *isolated* `tool.execute.before` OpenCode plugin in the per-project HOME for hard enforcement — see §17.)

### 8.2 Confirm Minecraft generation won't clobber it
**✅ VERIFIED:** `generateOpenCodeKnowledge()` (`opencode-knowledge.ts:249-307`, called each message at `agents.ts:472` and `:643`) only does `mkdir(skillsDir,{recursive})` then per-skill `mkdir`+`copyFile` (loop at `:285-296`). It **never** wipes `skillsDir` or deletes sibling dirs ⇒ our `graphify-navigation/` survives every per-message regeneration. **However**, `cleanupOpenCodeKnowledge(username, linkId)` (`:309-319`) does `rm -rf` of the **entire** `.config/opencode` dir — it's the project-deletion cleanup. That's fine (project is gone), but it means **our `removeGraphifySkill` must delete ONLY `.config/opencode/skills/graphify-navigation/`**, never the parent dir (which holds the Minecraft `AGENTS.md` + 8 skills).

**✅ VERIFIED config layout** (live isolated HOME tree): the authoritative OpenCode config home is **`<isolatedHOME>/.config/opencode/`** — it contains `AGENTS.md`, `opencode.json`, `node_modules` (symlinked shared plugins), and `skills/` with exactly the 8 Minecraft skills. So our skill path `.config/opencode/skills/graphify-navigation/` is correct. (`.local/share/opencode/` = data/db; `.cache/opencode/` = cache. A stray `.opencode/opencode.json` seen in one old test dir is a legacy artifact — ignore it; current code uses `.config/opencode/`.)

### 8.3 Command gating — ⚠️ REALITY CHECK: `aurora-sandbox` is NOT wired (verified 2026-05-31)
**Finding:** `sandboxPath = '/usr/local/bin/aurora-sandbox'` is declared at `opencode-process-manager.ts:336` but **never used**. Grep confirms the only other occurrences are the unrelated `OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS` lines. Both spawn branches (`:352-372` systemUser, `:373-391` fallback) launch `opencode serve` **directly** with `OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS=true`, and the shared OpenCode plugin dir (`/var/lib/opencode/shared/node_modules`) contains **no** plugin referencing the sandbox. **Conclusion: the "AI Agent Sandbox" described in CLAUDE.md is currently inert** — the wrapper script exists but is not on the command path, and OpenCode runs bash unrestricted. **Editing aurora-sandbox would therefore have zero effect.** Do not rely on it.

**Primary enforcement = SKILL PRESENCE (fully in our control).**
- Graphify enabled → `writeGraphifySkill` writes `graphify-navigation/SKILL.md` → the agent learns graphify exists and uses `query/path/explain`.
- Graphify disabled / removed / user demoted → `removeGraphifySkill` deletes that one dir → the agent has **no knowledge** of graphify and never invokes it. This *is* the "graphify is disabled when there's no graphify" behavior, enforced at the only layer we fully own.
- **Natural self-gating:** `query`, `path`, `explain`, `affected` all READ `graph.json`. With no graph they fail gracefully (nothing to traverse) — so the *useful* subcommands are inherently unavailable without a graph, regardless of any wrapper.
- **Low-stakes residue:** the only thing not hard-blocked is the agent hypothetically running `graphify update/extract/install` itself. It has no reason to (the skill explicitly forbids it), and a build costs **0 tokens** — so the worst case is a harmless redundant rebuild, not a security/cost issue.

### 8.4 Hard enforcement (recommended if strict guarantee required): isolated `tool.execute.before` plugin
If the product needs to *hard-block* `graphify` (not just rely on skill presence), the correct mechanism — given `SKIP_PERMISSIONS=true` makes OpenCode's native permission config inert — is an **OpenCode plugin** `tool.execute.before` hook. This is the **same mechanism `graphify opencode install` uses**, but we write it **isolated per-project** instead of globally so it never merges into the Minecraft `AGENTS.md`.
- Write a small JS plugin into the per-project isolated HOME (e.g. referenced via the `plugin` field of `.config/opencode/opencode.json`, or wherever OpenCode auto-loads plugins from `$HOME`). On each bash `tool.execute.before`, if the command's first word is `graphify`: reject unless `graphify-out/graph.json` exists **and** the subcommand ∈ {query,path,explain,affected}.
- Written by `buildGraph` (on enable), deleted by `removeGraph` (on disable/demote) — same lifecycle as the skill, equally removable, no AGENTS.md contact.
- **Validation needed before building this:** OpenCode's plugin API surface + exactly how an isolated (non-shared) plugin is registered in `opencode.json` / discovered under `$HOME`. Inspect `@opencode-ai` packages in the shared `node_modules` and the existing `opencode.json` shape (`provider-config.ts`).
- **Alternative hard path (heavier, out of scope):** actually wire `aurora-sandbox` as OpenCode's bash executor (fix the dead `:336` reference) — a cross-cutting platform change beyond this feature; if it's ever done, the §-removed gate snippet below can live there too.

**Recommendation:** ship **§8.3 skill-presence** as the MVP (correct, simple, low-stakes), and add the **§8.4 isolated plugin** if/when a hard guarantee is required. The gate logic either way:
```
reject "graphify" unless:  -f graphify-out/graph.json  AND  subcommand ∈ {query,path,explain,affected}
```

---

## 9. Process Lifecycle Hook (session-end rebuild)

**File:** `server/src/bridges/opencode-process-manager.ts`. Session end = idle timeout → `stopInstance()` (lines 465-497, SIGTERM→5s→SIGKILL) → `cleanupInstance(directory, instance)` (lines 499-506). Also reached on process exit/error.

Insert a fire-and-forget call inside `cleanupInstance`, after `releasePort` and before `this.instances.delete(directory)`:
```ts
// Graphify: rebuild the project graph after the session ends (no AI). Fire-and-forget.
import('../utils/graphify-service.js')
  .then(m => m.onSessionEnd(directory))
  .catch(() => {})
```
- `directory` is the workspace path (`/home/auroracraft-<user>/<linkId>`). `onSessionEnd` does the DB lookup and only rebuilds if the project is still Graphify-active (§6.6). This keeps the process manager decoupled from the DB.
- Idempotent + lock-protected (§6.2), so overlapping triggers (exit + idle) are safe.

---

## 10. Admin Tier-Change Hooks

**File:** `server/src/routes/admin.ts:185-217`, `PATCH /api/admin/users/:id/tier` (admin-only via `adminGuard`, `middleware/auth.ts:100-110`).

Current logic: fetches `user.tier`; if downgrading paid→free and the user has paid-only provider keys, returns **409** (blocks). Otherwise `db.update(users).set({ tier, ... })` at line ~215.

Add Graphify reconciliation **after** the successful `db.update` (do not block the tier change on Graphify):
```ts
// after db.update(users).set({ tier, updatedAt: new Date() })...
try {
  const svc = await import('../utils/graphify-service.js')
  if (tier === 'free' && user.tier === 'paid') {
    await svc.cleanupUserGraphify(id)     // delete artifacts+skill from all projects; keep intent
  } else if (tier === 'paid' && user.tier === 'free') {
    await svc.markUserForRebuild(id)      // set status='none' so workspace-open rebuilds lazily
  }
} catch (err) {
  app.log.warn({ err, userId: id }, 'Graphify tier reconciliation failed')
}
```
- Demotion cleanup runs only when the downgrade actually proceeds (i.e., not on the 409 path).
- No new admin UI needed; the existing tier toggle (`client/src/pages/admin/users.tsx:286-308 handleUpdateTier`) drives it.

---

## 11. Frontend Changes

### 11.1 Paid detection (canonical)
```ts
const { tokens } = useUserTokens()           // client/src/hooks/use-user-tokens.ts
const isPaid = tokens?.tier === 'paid'       // exact pattern already used in workspace.tsx:2119
```

### 11.2 New hook — `client/src/hooks/use-graphify.ts`
Mirror `use-projects.ts` / `use-agent.ts` (TanStack Query + shared `api` client at `client/src/lib/api.ts`, axios `withCredentials`):
```ts
export function useGraphify(projectId: string) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['projects', projectId, 'graphify'],
    queryFn: () => api.get<{ enabled: boolean; status: 'none'|'building'|'ready'|'failed'; builtAt: string|null }>(`/projects/${projectId}/graphify`),
    enabled: !!projectId,
    refetchInterval: q => (q.state.data?.status === 'building' ? 2000 : false),   // poll while building
  })
  const enable = useMutation({ mutationFn: () => api.post(`/projects/${projectId}/graphify`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', projectId, 'graphify'] }) })
  const remove = useMutation({ mutationFn: () => api.delete(`/projects/${projectId}/graphify`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', projectId, 'graphify'] }) })
  return { graphify: data ?? null, enable: enable.mutateAsync, isEnabling: enable.isPending,
           remove: remove.mutateAsync, isRemoving: remove.isPending }
}
```

### 11.3 Workspace buttons
**File:** `client/src/pages/workspace.tsx`. Insert in **both** headers, wrapped in `{isPaid && ...}`, next to the CodeRabbit/Download buttons:
- **Desktop header:** ~line **3456** (after CodeRabbit review section, before layout toggle).
- **Mobile header:** ~line **2717** (icon-only to save space).

Button logic by `graphify.status` / `graphify.enabled`:
- `!enabled` → **"Save tokens using Graphify"** → `enable()`.
- `enabled && status==='building'` → disabled **"Building graph…"** + spinner.
- `enabled && status==='ready'` → **"View Graph"** (opens viewer) + **"Remove Graphify"** (`remove()`, confirm via existing `GlassyConfirmModal`, already imported ~line 78).
- `enabled && status==='failed'` → **"Retry"** (`enable()`) + **"Remove Graphify"**.

### 11.4 Graph viewer — ✅ rendered as a web view INSIDE the editor panel (not a modal)
**Decision (user requirement):** "View Graph" renders the interactive graph **inside the code-editor panel** as a web view; opening `graphify-out/graph.html` from the **file tree** still shows **raw HTML** (Monaco) — the two paths are distinct.

Implementation:
- A module-level sentinel `GRAPH_VIEW_PATH = '__graphify_graph_view__'` is used as `selectedFile`. `EditorPanel` branches: when `selectedFile === GRAPH_VIEW_PATH` it renders the `<iframe>` below instead of Monaco (and skips the file-content fetch by passing `null` to `useFileContent`). Selecting any real file replaces the sentinel and returns to code.
- `GraphifyControls` "View Graph" calls an `onViewGraph` prop → workspace `handleViewGraph()` sets the sentinel (and `setMobileTab('code')` on mobile). On desktop the EditorPanel is always the main panel; on mobile it's the `code` tab.
```tsx
<iframe
  src={`/api/projects/${projectId}/graphify/graph.html`}
  title="Project Knowledge Graph"
  className="w-full flex-1 border-0 bg-white"
  sandbox="allow-scripts"
/>
```
- **⚠️ CSP — the bug that made it "not work":** `graph.html` loads `vis-network` from **`https://unpkg.com`** + inline scripts. The viewer route MUST send a CSP allowing it, else the script is blocked and the graph is **blank**. Live header now: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; font-src 'self' data: https://unpkg.com; default-src 'self' data: blob:; img-src 'self' data: blob:` (set in `routes/graphify.ts`).
- `sandbox="allow-scripts"` (no `allow-same-origin`) is correct & safe: verified `graph.html` has **0 external fetches** and inline vis data, so the opaque origin doesn't break rendering, and a crafted-symbol XSS can't reach the parent session. No global helmet/X-Frame-Options exists, so framing same-origin works.
- **⚠️ Gotcha hit during impl:** the sentinel literal was first written with a stray **NUL byte** (`'\x00graphify…'`) which made git treat `workspace.tsx` as binary. Fixed to a plain ASCII sentinel. If `git diff` ever shows `Bin … bytes` on a source file, grep for `\x00`.

### 11.5 Optional polish
- Pricing page (`client/src/pages/pricing.tsx`): list "Graphify token savings" as a paid feature.
- Show `graphify benchmark` "% token reduction" near the View Graph button (optional; `graphify benchmark` is local/free).

---

## 12. Deployment / Shared Install

### 12.1 Shared Graphify install (README step — model after OpenCode/CodeRabbit/LiteLLM, README Steps 7-8,15)
```bash
# Shared Graphify (Python) — accessible to all auroracraft-* users
sudo mkdir -p /var/lib/graphify/shared
sudo python3 -m venv /var/lib/graphify/shared/venv
sudo /var/lib/graphify/shared/venv/bin/pip install --upgrade graphifyy   # PyPI pkg is 'graphifyy' (double-y); CLI is 'graphify'
sudo ln -sf /var/lib/graphify/shared/venv/bin/graphify /usr/local/bin/graphify
sudo chmod -R 755 /var/lib/graphify/shared          # readable+executable by all users (like LiteLLM's 755 venv)
/usr/local/bin/graphify --version                   # expect: graphify 0.8.22 (or newer)
```
- Pin a known-good version (current: `0.8.22`). The binary **must** be globally executable by `auroracraft-*` users (same lesson as OpenCode in `/usr/local/bin`).
- Ensure the venv's Python can run for any user (755 on the venv tree).

### 12.2 Per-user setup — likely none required
The graph is written into the user-owned workspace; runtime is the shared venv. **No per-user symlink needed** (unlike Gradle/Maven). If Graphify writes a runtime cache to `$HOME/.graphify`, that's fine (user's own home). Do **not** wire `--global`, so no shared global-graph file is created. (If a per-user cache later proves worth sharing, follow `shared-cache.ts` `setupUserSharedCaches()` + `symlinkSafe()` and call it from `system-user.ts:71`.)

### 12.3 Server startup
`initializeSharedCaches()` (`index.ts:32`) need not change. Optionally add a one-time check that `/usr/local/bin/graphify` exists and log a warning if missing (Graphify is an optional feature, like LiteLLM/CodeRabbit).

### 12.4 Restart flow (unchanged)
`pnpm --filter server build` → `./auroracraft.sh restart` → `pm2 logs auroracraft-server`. Frontend: `pnpm --filter client build` then restart + hard refresh.

---

## 13. Phase 0 — ✅ COMPLETE (validated 2026-05-31)

All five checks ran against the live system. Results folded into the spec above. Summary:

1. **✅ No-AI build from empty works.** `graphify update . --force` in a fresh code-only dir built `graph.json`+`graph.html`(+`GRAPH_REPORT.md`,`manifest.json`,`cache/`), exit 0, **no `cost.json` → 0 tokens**, prints `Re-extracting code files in . (no LLM needed)...`. No network/API-key prompt. → §2.2 updated. **No fallback to `extract` needed.**
2. **⚠️ Sandbox is NOT wired — major correction.** `sandboxPath` is declared at `opencode-process-manager.ts:336` but **never used**; OpenCode is spawned directly with `OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS=true`; no shared plugin references it. `aurora-sandbox` is inert. → §8.3/§8.4 rewritten: **enforcement = skill presence (MVP)** + optional **isolated `tool.execute.before` plugin (hard gate)**. Editing the bash sandbox is pointless.
3. **✅ Skill non-clobber confirmed.** `generateOpenCodeKnowledge` only `mkdir`+`copyFile` (`:285-296`), never wipes siblings. `cleanupOpenCodeKnowledge` (`:309-319`) rm's all of `.config/opencode` but only on project deletion. → removal must target only our skill dir (§6.5). → §8.2 updated.
4. **✅ Routes confirmed.** ZIP = `POST /api/projects/upload` (`:329`); clone = `POST /api/projects/clone` (`:395`). → §7.3 updated.
5. **✅ Kotlin extraction works.** `.kt` build → 5 nodes/5 edges, labels `Greeter`,`.greet()`,`Plugin`,`.onEnable()`. Kotlin AST is real.

**Bonus (verified):** config layout — `.config/opencode/` is authoritative (AGENTS.md + opencode.json + skills/ + node_modules symlink); `.local/share/opencode/` = data; `.cache/opencode/` = cache. Our skill path `.config/opencode/skills/graphify-navigation/` is correct.

<details><summary>Original Phase-0 commands (for reference / re-run)</summary>

```bash
mkdir -p /tmp/gtest/src && printf 'public class A { void f(){ new B().g(); } }\n' > /tmp/gtest/src/A.java
cd /tmp/gtest && rm -rf graphify-out && unset GEMINI_API_KEY GOOGLE_API_KEY && graphify update . --force
ls graphify-out/   # graph.json + graph.html present
cat graphify-out/cost.json 2>/dev/null   # absent → 0 tokens
```
</details>

---

## 14. Phased Implementation Plan (checklist)

**Phase 0 — Validation (§13). ✅ COMPLETE (2026-05-31).**
- [x] 0.1 No-AI `update .` build from empty → graph.json + graph.html, 0 tokens
- [x] 0.2 Trace aurora-sandbox interception path → **inert/dead code; enforcement model changed (§8)**
- [x] 0.3 Confirm skill non-clobber
- [x] 0.4 Record exact import/clone route paths (`/upload`, `/clone`)
- [x] 0.5 Kotlin extraction sanity

**Phase 1 — Data model (§5).**
- [ ] 1.1 Add `graphifyStatusEnum` + 3 columns to `projects.ts`
- [ ] 1.2 `pnpm db:generate`, review `0017_*.sql`, `pnpm db:migrate`
- [ ] 1.3 Extend `Project` type in `client/src/types/index.ts`

**Phase 2 — Deployment (§12).**
- [ ] 2.1 Shared venv install + `/usr/local/bin/graphify` symlink (755)
- [ ] 2.2 README step added
- [ ] 2.3 Optional startup presence check/log

**Phase 3 — Backend service (§6).**
- [ ] 3.1 Create `server/src/utils/graphify-service.ts` (constants, parse, lock)
- [ ] 3.2 `buildGraph`, `removeGraph` (+ status/builtAt updates)
- [ ] 3.3 `writeGraphifySkill` / `removeGraphifySkill`
- [ ] 3.4 `onSessionEnd`, `reconcileOnWorkspaceOpen`, `cleanupUserGraphify`, `markUserForRebuild`

**Phase 4 — Routes (§7).**
- [ ] 4.1 Create `server/src/routes/graphify.ts` (GET status, POST enable, DELETE remove, GET graph.html)
- [ ] 4.2 Register in `index.ts`
- [ ] 4.3 Workspace-open reconcile hook in `projects.ts:123-137`

**Phase 5 — OpenCode integration (§8).** Enforcement = skill presence (aurora-sandbox is dead — do NOT edit it).
- [ ] 5.1 Author `opencode-knowledge/skills/graphify-navigation/SKILL.md` (do NOT add to `skillsToCopy`)
- [ ] 5.2 Wire skill write/remove into `buildGraph`/`removeGraph` (removal targets ONLY `skills/graphify-navigation/`)
- [ ] 5.3 *(Optional, hard gate)* isolated `tool.execute.before` plugin per §8.4 — only if a hard block is required; needs OpenCode plugin-API validation first

**Phase 6 — Lifecycle + admin (§9, §10).**
- [ ] 6.1 `cleanupInstance` session-end hook in `opencode-process-manager.ts`
- [ ] 6.2 Admin tier-change reconciliation in `admin.ts`

**Phase 7 — Frontend (§11).**
- [ ] 7.1 `use-graphify.ts` hook
- [ ] 7.2 Desktop + mobile buttons (state machine) in `workspace.tsx`
- [ ] 7.3 Graph viewer modal (iframe)
- [ ] 7.4 Optional pricing/benchmark polish

**Phase 8 — Test (§15).** Run the full matrix.

---

## 15. Testing Checklist (end-to-end)

**Scenario 1 (AI-built):**
- [ ] Paid user builds plugin → "Save tokens using Graphify" visible; click → status building→ready; `graphify-out/{graph.json,graph.html}` exist; `cost.json` shows 0 tokens.
- [ ] Send a message → agent can run `graphify query` (succeeds); plugin code updated.
- [ ] After idle timeout → `graphify-out/` deleted and rebuilt fresh (mtime advanced), still 0 tokens.
- [ ] "View Graph" → iframe renders the interactive graph on localhost.
- [ ] "Remove Graphify" → artifacts + skill gone; `graphifyEnabled=false`; `graphify` command now rejected by sandbox.

**Scenario 2 (import/clone):**
- [ ] Upload ZIP / clone repo → enter workspace → button available with **no** AI message → click builds graph.

**Tier transitions:**
- [ ] Demote paid→free (admin) → all the user's graphs + skills removed; `graphifyEnabled` still true; no rebuild on next message; buttons hidden.
- [ ] Promote free→paid → open a previously-enabled project's workspace → graph rebuilds lazily (status none→building→ready) without manual action.
- [ ] Free user never sees any Graphify button; direct `POST /api/projects/:id/graphify` → 403.

**Isolation/safety:**
- [ ] User A cannot access User B's `graph.html` (ownership 404).
- [ ] Minecraft `AGENTS.md` + 8 skills are byte-identical before/after enabling/removing Graphify (no merge).
- [ ] Agent cannot run `graphify update/extract/install/clone` (sandbox rejects non-read-only subcommands).
- [ ] Concurrent session-end rebuild + new message → no crash, no half-deleted graph (lock works).

---

## 16. Edge Cases & Gotchas

- **Large cloned repos:** AST build can be slow and `graph.html` huge. If `graph.json` node count > ~5000, rebuild with `--no-viz` (skip html) and show "graph too large to view" while still enabling queries. Make the viz threshold a constant.
- **Race on rebuild:** the per-project lock (§6.2) plus idempotent status updates prevent "graph deleted mid-query." A message landing during a session-end rebuild waits on the lock.
- **`onSessionEnd` fires on every teardown** (idle, exit, error). Guard with the lock + the live DB active-check so non-Graphify projects are a cheap no-op.
- **Username casing:** workspace dir uses `username.toLowerCase()`; system user is `auroracraft-<lower>`. Always lowercase when composing paths.
- **`graphify` needs a writable HOME** for `.graphify_python` interpreter resolution; `runuser -l` sets `HOME=/home/auroracraft-<user>` (writable) — fine. The per-project marker files live inside `graphify-out/` (deleted on rebuild) so they never go stale.
- **Don't set GEMINI/GOOGLE keys** in the build env, ever (would trigger paid semantic extraction).
- **`noEmitOnError:false`** in `server/tsconfig.json` — pre-existing type errors are tolerated; don't "fix" by flipping it.
- **Free→paid with stale `ready`:** `markUserForRebuild` forces `status='none'` so the lazy hook always rebuilds against current code.
- **graph.html CSP:** if a global CSP is added later, the viewer route needs an exception (inline scripts).
- **⚠️ aurora-sandbox is dead code** (verified `opencode-process-manager.ts:336` declared, never used; OpenCode runs with `SKIP_PERMISSIONS=true`). Do **not** spend time editing it for gating — it isn't on the command path. Enforcement is skill presence (§8.3) or an isolated plugin (§8.4). If the platform ever wires the sandbox for real, the gate snippet in §8.4 can live there.
- **`update` from empty == full build** (not incremental). Since we always `rm -rf graphify-out` first, every rebuild is full — exactly the "regenerate fully, not update" requirement, at 0 tokens.
- **Empty / code-less projects:** `graphify update .` prints "No code files found" and **exits 1** → the service sets status `failed` (verified live on an empty project). This is harmless: the workspace-open reconcile only fires on status `none`, so there is no retry loop; once the project has Java/Kotlin code (after an AI build or import), enabling/retry succeeds. In the real flows the button only appears once code exists.

---

## 17. Out of Scope / Future Enhancements
- **Isolated `tool.execute.before` OpenCode plugin** for hard enforcement (replicate graphify's plugin into the per-project HOME, removable) instead of the advisory skill. More robust; more complex; still must avoid AGENTS.md merge.
- **Eager re-promotion rebuild** (background job) instead of lazy — rejected per decision (#2 lazy).
- **Cross-project/global graph** (`--global`) — intentionally excluded (isolation).
- **`graphify benchmark` savings UI**, `export callflow-html` architecture diagrams.
- **Semantic enrichment / GRAPH_REPORT.md** — would cost tokens; excluded.

---

## 18. Quick Reference — Paths, Constants, Anchors

| Thing | Value / Location |
|---|---|
| Graphify CLI (prod) | `/usr/local/bin/graphify` → `/var/lib/graphify/shared/venv/bin/graphify` (755) |
| PyPI package / CLI name | `graphifyy` / `graphify` (current `0.8.22`) |
| Build command | `cd <ws> && rm -rf graphify-out && graphify update . --force` (no AI; code-only) |
| Read-only agent cmds | `graphify query|path|explain|affected` (local, 0 tokens) |
| Workspace dir | `/home/auroracraft-{username.toLowerCase()}/{linkId}` — `agents.ts:45-48` |
| Isolated HOME | `/var/lib/auroracraft/configs/auroracraft-{username}/{linkId}` — `provider-config.ts:30-38` |
| Isolated skill dir | `{isolatedHOME}/.config/opencode/skills/graphify-navigation/` |
| Graph artifacts | `{workspaceDir}/graphify-out/{graph.json,graph.html}` |
| Tier field | `users.tier` enum `user_tier` = `['free','paid']` — `users.ts:6-23` |
| Paid check (BE) | `(request.user!.tier ?? 'free') === 'paid'` |
| Paid check (FE) | `useUserTokens().tokens?.tier === 'paid'` |
| `request.user` shape | `{ id, username, email, role:'user'|'admin', tier:'free'|'paid'|null, createdAt, updatedAt }` — `middleware/auth.ts` |
| Session-end hook | `opencode-process-manager.ts` `cleanupInstance()` lines 499-506 |
| Workspace-open hook | `projects.ts` `GET /api/projects/:id` lines 123-137 |
| Tier-change hook | `admin.ts` `PATCH /api/admin/users/:id/tier` lines 185-217 |
| Minecraft rules gen | `opencode-knowledge.ts:249-307` (`skillsToCopy` 279-283) — **do not add graphify here** |
| Project-knowledge cleanup | `cleanupOpenCodeKnowledge()` `opencode-knowledge.ts:309-319` — rm's ALL of `.config/opencode` (deletion only) |
| Command enforcement | **skill presence** (MVP); optional isolated `tool.execute.before` plugin (§8.4). **aurora-sandbox is INERT — declared `opencode-process-manager.ts:336`, never used; do not edit for gating** |
| Spawn (systemUser) | `opencode-process-manager.ts:352-372` (`runuser -l <sysuser> -c <shellCmd>`, `SKIP_PERMISSIONS=true`) |
| Route registration | `server/src/index.ts:41-48` |
| Shared install model | `shared-cache.ts`, LiteLLM `/var/lib/litellm/shared/venv/bin/litellm` |
| New files | `server/src/utils/graphify-service.ts`, `server/src/routes/graphify.ts`, `client/src/hooks/use-graphify.ts`, `opencode-knowledge/skills/graphify-navigation/SKILL.md` |
| Migration | `server/drizzle/0017_*.sql` (after `0016_community_features.sql`) |

---
*End of spec. Phase 0 validation is complete (§13) — begin implementation at §14 → Phase 1. Keep this file updated as assumptions are confirmed or changed.*
