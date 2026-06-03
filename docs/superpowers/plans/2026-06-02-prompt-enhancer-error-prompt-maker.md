# Prompt Enhancer & Error Prompt Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two NVIDIA-NIM-powered, read-only helper features to AuroraCraft — a **Prompt Enhancer** (rewrite/structure a prompt before sending to the Agent) and an **Error Prompt Maker** (turn selected Code-Review issues into an optimized fix prompt) — available to all users gated only by an admin-set NIM key, with no token billing.

**Architecture:** A dedicated NIM subsystem independent of the OpenCode Agent: `nim-client.ts` (native-fetch OpenAI-compatible calls) → `nim-engine.ts` (multi-call agentic pipelines, read-only file tools) → `nim_jobs` table (persisted, refresh-safe, fire-and-forget + client poll) → `routes/nim.ts`. The client adds a blocking Prompt-Enhancer modal (intercepts all send paths) and a 2-option Error-Prompt-Maker window (Option A = NIM, Option B = existing in-built `confirmAutoFix`, untouched).

**Tech Stack:** Fastify 5, Drizzle ORM (PostgreSQL), Zod, React 19 + TanStack Query, native `fetch`. **No unit-test framework exists** (server build = `tsc || true`, client = `tsc -p tsconfig.app.json && vite build`). Per CLAUDE.md, verification = **typecheck/build + `./auroracraft.sh restart` + `pm2 logs` + curl/UI smoke tests**. Each task's verification reflects that — there are no `vitest`/`jest` steps because adding a test runner is out of scope and contrary to project conventions.

> **Git policy (CLAUDE.md):** never `git commit`/`push` without an explicit ask. The "Commit" steps below are **optional** and must be confirmed with the user first; otherwise just leave changes in the working tree and report the diff.

> **Slug/URL open item:** the six NIM `/v1/models` slugs and the chat-completions base URL are **unconfirmed**. Phase 0 includes a live verification step (Task 0.6). Until confirmed they are clearly-flagged placeholders in `nim-models.ts`.

---

## File Structure

**New (server):**
- `server/src/config/nim-models.ts` — 6 NIM model defs (id/label/slug/isReasoning), default, base URL.
- `server/src/bridges/nim-client.ts` — OpenAI-compatible chat-completions client (tools, reasoning, abort/timeout).
- `server/src/agents/nim-engine.ts` — enhancer pipelines (4 styles + refine) and error-fix agentic read loop; read-only file tools; 30-min deadline; job state machine.
- `server/src/db/schema/nim-jobs.ts` — `nim_jobs` table.
- `server/src/routes/nim.ts` — all NIM HTTP endpoints.
- `server/drizzle/0018_nim_jobs.sql` — idempotent migration (+ journal entry).

**New (client):**
- `client/src/hooks/use-nim.ts` — NIM models query, key detection, job create/poll/refine/cancel/complete, active-job reattach.
- `client/src/components/prompt-enhancer-modal.tsx` — confirm → style+model picker → blocking loading/result modal.
- `client/src/components/error-prompt-maker-modal.tsx` — 2-option window + Option A model pickers.

**Edited (server):**
- `server/src/db/index.ts` — register `nimJobs` schema.
- `server/src/index.ts` — register `nimRoutes`.
- `server/src/routes/agents.ts` — `sendMessageSchema` cap 10k→50k; add optional `displayContent`; persist visible vs executor prompt split.
- `server/src/db/schema/users.ts` + `projects.ts` — (only if FK cascade needs a back-reference; `nim_jobs` declares its own FKs, so no edit expected).

**Edited (client):**
- `client/src/lib/api.ts` — (verify `api.get/post/delete` exist; no change expected).
- `client/src/pages/admin/users.tsx` — add `nvidia` to the `ProviderKeysModal` provider list.
- `client/src/pages/admin/provider-keys.tsx` — add `{ id: 'nvidia', label: 'NVIDIA NIM' }` to `PROVIDERS`.
- `client/src/pages/workspace.tsx` — intercept 3 send paths; Auto-Fix 2-option window; `enhancerActive` lock source; reattach; mount modals.
- `client/src/hooks/use-agent.ts` — extend `sendMessage` mutation to accept `displayContent`.

---

# PHASE 0 — NIM Foundation

### Task 0.1: Add `nvidia` to admin provider-key UIs

**Files:**
- Modify: `client/src/pages/admin/provider-keys.tsx` (`PROVIDERS` constant, ~L15-20)
- Modify: `client/src/pages/admin/users.tsx` (`ProviderKeysModal` provider list, ~L607-773)

- [ ] **Step 1: Read both files** to find the existing provider option arrays (look for `fireworks`, `bluesminds`, `modal`, `firecrawl`).

- [ ] **Step 2: Add the NVIDIA option** to each provider list. In `provider-keys.tsx`:

```tsx
// inside the PROVIDERS array (keep existing entries)
{ id: 'nvidia', label: 'NVIDIA NIM' },
```

In `users.tsx` `ProviderKeysModal`, add `nvidia` to the same select/options list used for the other providers (match the exact shape already there — `{ id, label }` or `<option value="nvidia">NVIDIA NIM</option>`).

- [ ] **Step 3: Verify no server change is needed.** Confirm `server/src/routes/admin.ts` `paidOnlyProviders = ['fireworks', 'bluesminds', 'firecrawl']` (L203, L295) — `nvidia` is intentionally absent so **free and paid** users can both receive a key. Do **not** add it.

- [ ] **Step 4: Build the client**

Run: `pnpm --filter client build`
Expected: exit 0 (tsc passes, vite build succeeds).

- [ ] **Step 5 (optional, confirm first): Commit**

```bash
git add client/src/pages/admin/provider-keys.tsx client/src/pages/admin/users.tsx
git commit -m "feat(nim): add NVIDIA NIM as an admin-settable provider key"
```

---

### Task 0.2: NIM model registry

**Files:**
- Create: `server/src/config/nim-models.ts`

- [ ] **Step 1: Create the registry.** Slugs/base URL are placeholders pending Task 0.6.

```ts
// server/src/config/nim-models.ts
// NVIDIA NIM models exposed to the Prompt Enhancer & Error Prompt Maker.
// These are SEPARATE from the OpenCode agent models in config/ai-models.ts.
//
// ⚠️ SLUGS + BASE URL ARE UNCONFIRMED — verify against the user's live key
// (GET {NIM_BASE_URL}/models) before go-live. See Task 0.6 in the plan.

export interface NimModel {
  id: string          // stable internal id used by the client + jobs
  label: string       // shown in the picker
  slug: string        // the NIM /v1/models id sent to the API
  isReasoning: boolean // reasoning models emit reasoning_content separately
}

// OpenAI-compatible hosted NVIDIA endpoint. Confirm for this account.
export const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'

export const NIM_MODELS: NimModel[] = [
  { id: 'kimi-k2.6',        label: 'Kimi K2.6',        slug: 'moonshotai/kimi-k2.6',          isReasoning: false },
  { id: 'minimax-m2.7',     label: 'MiniMax M2.7',     slug: 'minimaxai/minimax-m2.7',        isReasoning: false },
  { id: 'step-3.7-flash',   label: 'Step 3.7 Flash',   slug: 'stepfun-ai/step-3.7-flash',     isReasoning: false },
  { id: 'deepseek-v4-pro',  label: 'DeepSeek V4 Pro',  slug: 'deepseek-ai/deepseek-v4-pro',   isReasoning: true  },
  { id: 'deepseek-v4-flash',label: 'DeepSeek V4 Flash',slug: 'deepseek-ai/deepseek-v4-flash', isReasoning: true  },
  { id: 'glm-5.1',          label: 'GLM-5.1',          slug: 'z-ai/glm-5.1',                  isReasoning: false },
]

export const DEFAULT_NIM_MODEL_ID = 'step-3.7-flash'

export function getNimModel(id: string): NimModel | undefined {
  return NIM_MODELS.find((m) => m.id === id)
}

export function resolveNimModel(id: string | undefined): NimModel {
  return getNimModel(id ?? DEFAULT_NIM_MODEL_ID) ?? NIM_MODELS.find((m) => m.id === DEFAULT_NIM_MODEL_ID)!
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter server build`
Expected: no new errors mentioning `nim-models.ts`.

---

### Task 0.3: NIM client (native fetch)

**Files:**
- Create: `server/src/bridges/nim-client.ts`

- [ ] **Step 1: Create the client.** Supports tools, reasoning models, an injected `AbortSignal`, and a per-call timeout. Never logs the key.

```ts
// server/src/bridges/nim-client.ts
import { NIM_BASE_URL } from '../config/nim-models.js'

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

export interface NimChatResult {
  content: string
  reasoning: string
  toolCalls: NimToolCall[]
  finishReason: string | null
}

export class NimError extends Error {
  constructor(message: string, readonly status?: number, readonly aborted = false) {
    super(message)
    this.name = 'NimError'
  }
}

const PER_CALL_TIMEOUT_MS = 5 * 60 * 1000 // 5 min per call; overall job deadline is enforced by the engine

/**
 * One chat-completions call against NVIDIA NIM (OpenAI-compatible).
 * `signal` is the engine's overall-job AbortController signal; we also add a
 * per-call timeout so a single hung request cannot stall the whole job silently.
 */
export async function nimChat(opts: {
  apiKey: string
  slug: string
  messages: NimMessage[]
  tools?: NimToolDef[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}): Promise<NimChatResult> {
  const { apiKey, slug, messages, tools, maxTokens = 4096, temperature = 0.4, signal } = opts

  const perCall = new AbortController()
  const timer = setTimeout(() => perCall.abort(), PER_CALL_TIMEOUT_MS)
  const onParentAbort = () => perCall.abort()
  if (signal) {
    if (signal.aborted) perCall.abort()
    else signal.addEventListener('abort', onParentAbort, { once: true })
  }

  try {
    const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
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
    }
    const choice = json.choices?.[0]
    return {
      content: choice?.message?.content ?? '',
      reasoning: choice?.message?.reasoning_content ?? '',
      toolCalls: choice?.message?.tool_calls ?? [],
      finishReason: choice?.finish_reason ?? null,
    }
  } catch (err) {
    if (err instanceof NimError) throw err
    const aborted = (err as Error)?.name === 'AbortError'
    throw new NimError(aborted ? 'NIM request aborted' : `NIM request failed: ${(err as Error)?.message}`, undefined, aborted)
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onParentAbort)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter server build`
Expected: no new errors mentioning `nim-client.ts`.

---

### Task 0.4: `nim_jobs` schema

**Files:**
- Create: `server/src/db/schema/nim-jobs.ts`
- Modify: `server/src/db/index.ts`

- [ ] **Step 1: Create the schema** (varchar status/kind for forward-compat — mirrors `code-reviews.ts`, avoids pgEnum migration pain).

```ts
// server/src/db/schema/nim-jobs.ts
import { pgTable, uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users.js'
import { projects } from './projects.js'

// kind:   'prompt_enhance' | 'error_fix'
// status: 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
//   prompt_enhance: running -> awaiting_user (result shown) -> completed | cancelled | failed | timeout
//                   (refine: awaiting_user -> running -> awaiting_user)
//   error_fix:      running -> ready (prompt built; client dispatches to agent) -> completed
//                   | cancelled | failed | timeout
export const nimJobs = pgTable('nim_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  nimModel: varchar('nim_model', { length: 60 }).notNull(),
  agentModel: varchar('agent_model', { length: 100 }),
  style: varchar('style', { length: 40 }),
  inputJson: jsonb('input_json'),
  resultJson: jsonb('result_json'),
  historyJson: jsonb('history_json'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type NimJob = typeof nimJobs.$inferSelect
export type NewNimJob = typeof nimJobs.$inferInsert

export type NimJobKind = 'prompt_enhance' | 'error_fix'
export type NimJobStatus =
  | 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
export const NIM_TERMINAL_STATUSES: NimJobStatus[] = ['completed', 'cancelled', 'failed', 'timeout']
```

- [ ] **Step 2: Register in `db/index.ts`.** Add the import after the `providerApiKeys` import and add `...nimJobs` to the schema object.

```ts
import * as nimJobs from './schema/nim-jobs.js'
// ...
export const db = drizzle(client, {
  schema: { ...users, ...sessions, ...projects, ...agentSessions, ...agentMessages, ...agentLogs, ...codeReviews, ...providerApiKeys, ...projectLikes, ...projectViews, ...nimJobs },
})
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server build`
Expected: no new errors.

---

### Task 0.5: Migration `0018_nim_jobs`

**Files:**
- Create: `server/drizzle/0018_nim_jobs.sql`
- Modify: `server/drizzle/meta/_journal.json` (append entry)

- [ ] **Step 1: Generate via drizzle-kit** (this updates the journal + snapshot automatically):

Run: `pnpm --filter server db:generate`
Expected: a new `server/drizzle/00XX_*.sql` + a new `meta/00XX_snapshot.json` + a `_journal.json` entry.

- [ ] **Step 2: Sanitize the generated SQL to nim_jobs-only + idempotent.** Per CLAUDE.md "Drizzle Migration Tracking Drift", the auto-diff may re-emit stale objects. Open the generated `.sql`, delete everything except the `nim_jobs` table, and make it idempotent:

```sql
CREATE TABLE IF NOT EXISTS "nim_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "kind" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "nim_model" varchar(60) NOT NULL,
  "agent_model" varchar(100),
  "style" varchar(40),
  "input_json" jsonb,
  "result_json" jsonb,
  "history_json" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "nim_jobs" ADD CONSTRAINT "nim_jobs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "nim_jobs" ADD CONSTRAINT "nim_jobs_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nim_jobs_project" ON "nim_jobs" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nim_jobs_user_status" ON "nim_jobs" ("user_id","status");
```

(If you renamed the file to `0018_nim_jobs.sql`, make the `_journal.json` `tag` match the filename without extension.)

- [ ] **Step 3: Apply the migration.**

Run: `pnpm --filter server db:migrate`
Expected: "Migrations complete". **If it errors with "already exists"** (tracking drift), apply directly and record tracking per CLAUDE.md:
```bash
psql "$DATABASE_URL" -1 -f server/drizzle/0018_nim_jobs.sql
```

- [ ] **Step 4: Verify the table exists.**

Run: `psql "$DATABASE_URL" -c "\d nim_jobs"`
Expected: the 14 columns above are listed.

---

### Task 0.6: Verify NIM slugs + base URL against a live key

**Files:** (none — investigation; may edit `nim-models.ts`)

- [ ] **Step 1:** Obtain a test NIM key (ask the user / read one set on a user via admin). Then list live models:

```bash
curl -s https://integrate.api.nvidia.com/v1/models \
  -H "Authorization: Bearer $NIM_KEY" | python3 -m json.tool | grep '"id"'
```
Expected: a list of model ids. Match each of the 6 product models (Kimi K2.6, MiniMax M2.7, Step 3.7 Flash, DeepSeek V4 Pro, DeepSeek V4 Flash, GLM-5.1) to a real slug.

- [ ] **Step 2:** Update `NIM_MODELS[].slug` and `NIM_BASE_URL` in `server/src/config/nim-models.ts` to the confirmed values; flip `isReasoning` per each model's behavior (a quick test call: if `content` is empty but `reasoning_content` is populated, it's a reasoning model → engine must set a higher `max_tokens`).

- [ ] **Step 3:** If slugs cannot be confirmed yet, leave the placeholders and **tell the user** the feature will 4xx until slugs are corrected (the engine surfaces NIM errors as job `failed`). Do not block the rest of the build.

---

### Task 0.7: NIM route scaffold + `requireNimKey` + models endpoint + registration

**Files:**
- Create: `server/src/routes/nim.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create the route module** with the gate helper, the models endpoint, the active-job + poll endpoints, and the cancel endpoint. (Enhance/refine/error-fix handlers are added in Phases 1–2.)

```ts
// server/src/routes/nim.ts
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import { nimJobs, NIM_TERMINAL_STATUSES, type NimJob } from '../db/schema/nim-jobs.js'
import { authMiddleware } from '../middleware/auth.js'
import { NIM_MODELS, DEFAULT_NIM_MODEL_ID } from '../config/nim-models.js'
import { nimEngine } from '../agents/nim-engine.js'

/** Load the user's active NVIDIA NIM key, or null. */
export async function getNimKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ apiKey: providerApiKeys.apiKey })
    .from(providerApiKeys)
    .where(and(
      eq(providerApiKeys.userId, userId),
      eq(providerApiKeys.provider, 'nvidia'),
      eq(providerApiKeys.isActive, true),
    ))
    .limit(1)
  return row?.apiKey ?? null
}

export async function nimRoutes(app: FastifyInstance) {
  async function loadOwnedProject(userId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1)
    return project ?? null
  }

  async function requireNimKey(request: FastifyRequest, reply: any): Promise<string | null> {
    const key = await getNimKey(request.user!.id)
    if (!key) {
      reply.status(403).send({ message: 'NVIDIA NIM key not set. Ask an admin to add one.', statusCode: 403 })
      return null
    }
    return key
  }

  function publicJob(job: NimJob, opts: { includeResult: boolean }) {
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      nimModel: job.nimModel,
      agentModel: job.agentModel,
      style: job.style,
      error: job.error,
      result: opts.includeResult ? job.resultJson : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  // List NIM models for the pickers (no key required to list — UI hides the feature
  // separately based on key presence; listing models is harmless).
  app.get('/api/nim/models', { preHandler: [authMiddleware] }, async () => {
    return { models: NIM_MODELS.map(({ id, label, isReasoning }) => ({ id, label, isReasoning })), defaultId: DEFAULT_NIM_MODEL_ID }
  })

  // Latest non-terminal job for this project+user (re-attach after refresh).
  app.get('/api/projects/:id/nim/active', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await loadOwnedProject(request.user!.id, id)
    if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })

    const [job] = await db
      .select()
      .from(nimJobs)
      .where(and(
        eq(nimJobs.projectId, id),
        eq(nimJobs.userId, request.user!.id),
      ))
      .orderBy(desc(nimJobs.createdAt))
      .limit(1)

    if (!job || NIM_TERMINAL_STATUSES.includes(job.status as any)) return { job: null }
    // enhancer needs its result to render; error_fix exposes result only when 'ready' (for client dispatch)
    const includeResult = job.kind === 'prompt_enhance' || job.status === 'ready'
    return { job: publicJob(job, { includeResult }) }
  })

  // Poll a specific job.
  app.get('/api/projects/:id/nim/jobs/:jobId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const [job] = await db.select().from(nimJobs)
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
      .limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    const includeResult = job.kind === 'prompt_enhance' || job.status === 'ready'
    return { job: publicJob(job, { includeResult }) }
  })

  // Force-stop any job.
  app.post('/api/projects/:id/nim/jobs/:jobId/cancel', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string }
    const [job] = await db.select().from(nimJobs)
      .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
      .limit(1)
    if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
    nimEngine.abort(jobId)
    if (!NIM_TERMINAL_STATUSES.includes(job.status as any)) {
      await db.update(nimJobs).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(nimJobs.id, jobId))
    }
    return { status: 'cancelled' }
  })

  // (enhance / refine / confirm / error-fix / complete handlers added in Phases 1 & 2)
  void inArray // keep import used until later tasks reference it
}
```

- [ ] **Step 2: Register the route** in `server/src/index.ts`. Find where `graphifyRoutes`/`agentRoutes` are registered and add alongside:

```ts
import { nimRoutes } from './routes/nim.js'
// ... with the other app.register(...) calls:
await app.register(nimRoutes)
```

- [ ] **Step 3: Create a stub engine** so the route compiles (real engine in Phase 1). Create `server/src/agents/nim-engine.ts`:

```ts
// server/src/agents/nim-engine.ts (Phase-0 stub; expanded in Phase 1 & 2)
class NimEngine {
  private controllers = new Map<string, AbortController>()
  register(jobId: string): AbortSignal {
    const c = new AbortController()
    this.controllers.set(jobId, c)
    return c.signal
  }
  abort(jobId: string): void {
    this.controllers.get(jobId)?.abort()
    this.controllers.delete(jobId)
  }
  done(jobId: string): void {
    this.controllers.delete(jobId)
  }
}
export const nimEngine = new NimEngine()
```

- [ ] **Step 4: Build + restart + smoke test**

Run:
```bash
pnpm --filter server build
./auroracraft.sh restart
pm2 logs auroracraft-server --lines 30 --nostream
```
Expected: server boots, no crash. Then (logged-in cookie required):
```bash
curl -s -b cookie.txt localhost:3000/api/nim/models | python3 -m json.tool
```
Expected: `{ "models": [...6...], "defaultId": "step-3.7-flash" }`.
And without a NIM key, an enhance call (added later) will 403 — verify the gate returns 401 without auth now:
```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/nim/models   # → 401
```

---

# PHASE 1 — Prompt Enhancer

### Task 1.1: Engine — enhancer pipelines (4 styles + refine)

**Files:**
- Modify: `server/src/agents/nim-engine.ts` (replace the Phase-0 stub, keeping the `AbortController` registry)

- [ ] **Step 1: Implement the enhancer.** Multi-call pipeline; 30-min overall deadline; persists to `nim_jobs`. Add to `nim-engine.ts`:

```ts
import { db } from '../db/index.js'
import { nimJobs } from '../db/schema/nim-jobs.js'
import { eq } from 'drizzle-orm'
import { nimChat, NimError, type NimMessage } from '../bridges/nim-client.js'
import { resolveNimModel } from '../config/nim-models.js'

const JOB_DEADLINE_MS = 30 * 60 * 1000 // 30 minutes (spec)

export type EnhanceStyle = 'optimized' | 'structured' | 'explanatory' | 'feature_adding'

const STYLE_SYSTEM: Record<EnhanceStyle, string> = {
  optimized:
    'You are a prompt engineer for an AI agent that writes Minecraft server plugins. Rewrite the user prompt to be clearer and more effective: fix ambiguity, add only SAFE, clearly-implied technical specifics, and organize it into clean sections (Goal, Requirements, Constraints, Acceptance). Improve quality but do NOT invent unrelated features.',
  structured:
    'You are a formatter. Take the user prompt and ONLY restructure it into clean sections (Goal, Requirements, Constraints). Do NOT add, optimize, or change the meaning of anything. Preserve the user intent exactly.',
  explanatory:
    'You are a prompt engineer. Restructure the user prompt into clean sections AND, for each feature, add a short explanatory note describing how it should work and behave in-game. Do not add new features; explain the requested ones.',
  feature_adding:
    'You are a senior Minecraft plugin designer. Restructure the user prompt into clean sections and propose a SMALL number of SAFE, complementary features that naturally fit the described plugin. Clearly mark added features under an "Added (safe) features" section. Never add unsafe, destructive, or scope-exploding features.',
}

interface EnhanceInput { prompt: string; projectName?: string; software?: string; language?: string }

export class NimEngine {
  private controllers = new Map<string, AbortController>()

  register(jobId: string): AbortSignal {
    const c = new AbortController()
    this.controllers.set(jobId, c)
    setTimeout(() => { if (this.controllers.has(jobId)) c.abort() }, JOB_DEADLINE_MS)
    return c.signal
  }
  abort(jobId: string) { this.controllers.get(jobId)?.abort(); this.controllers.delete(jobId) }
  done(jobId: string) { this.controllers.delete(jobId) }

  private async fail(jobId: string, err: unknown) {
    const aborted = err instanceof NimError && err.aborted
    const timedOut = aborted // distinguish below
    const status = aborted ? 'timeout' : 'failed'
    await db.update(nimJobs)
      .set({ status, error: (err as Error)?.message?.slice(0, 500) ?? 'error', updatedAt: new Date() })
      .where(eq(nimJobs.id, jobId)).catch(() => {})
    void timedOut
  }

  /** Run an enhance job: fire-and-forget. Resolves the job to awaiting_user with resultJson.prompt. */
  async runEnhance(jobId: string, apiKey: string, style: EnhanceStyle, modelId: string, input: EnhanceInput) {
    const signal = this.register(jobId)
    const model = resolveNimModel(modelId)
    const maxTokens = model.isReasoning ? 8192 : 4096
    try {
      const ctx = `Project: ${input.projectName ?? 'unknown'} | Platform: ${input.software ?? 'paper'} | Language: ${input.language ?? 'java'}`
      // Call 1: draft in the chosen style
      const draft = await nimChat({
        apiKey, slug: model.slug, maxTokens, signal,
        messages: [
          { role: 'system', content: STYLE_SYSTEM[style] },
          { role: 'user', content: `${ctx}\n\nUSER PROMPT:\n${input.prompt}\n\nReturn ONLY the rewritten prompt, no preamble.` },
        ],
      })
      // Call 2: self-check / polish pass (agentic: a second call refining the first)
      const polished = await nimChat({
        apiKey, slug: model.slug, maxTokens, signal,
        messages: [
          { role: 'system', content: 'You refine prompts. Improve clarity and remove redundancy while keeping the same intent and structure. Return ONLY the final prompt.' },
          { role: 'user', content: draft.content || input.prompt },
        ],
      })
      const finalPrompt = (polished.content || draft.content || input.prompt).trim()
      await db.update(nimJobs)
        .set({ status: 'awaiting_user', resultJson: { prompt: finalPrompt }, updatedAt: new Date() })
        .where(eq(nimJobs.id, jobId))
    } catch (err) {
      await this.fail(jobId, err)
    } finally {
      this.done(jobId)
    }
  }

  /** Refine an existing awaiting_user enhance job with a change request. */
  async runRefine(jobId: string, apiKey: string, modelId: string, currentPrompt: string, changeRequest: string, history: unknown[]) {
    const signal = this.register(jobId)
    const model = resolveNimModel(modelId)
    const maxTokens = model.isReasoning ? 8192 : 4096
    try {
      const out = await nimChat({
        apiKey, slug: model.slug, maxTokens, signal,
        messages: [
          { role: 'system', content: 'You refine an existing prompt according to the user\'s change request. Keep everything good; apply the requested change. Return ONLY the updated prompt.' },
          { role: 'user', content: `CURRENT PROMPT:\n${currentPrompt}\n\nCHANGE REQUEST:\n${changeRequest}` },
        ] as NimMessage[],
      })
      const updated = (out.content || currentPrompt).trim()
      const newHistory = [...history, { changeRequest, prompt: updated }]
      await db.update(nimJobs)
        .set({ status: 'awaiting_user', resultJson: { prompt: updated }, historyJson: newHistory, updatedAt: new Date() })
        .where(eq(nimJobs.id, jobId))
    } catch (err) {
      await this.fail(jobId, err)
    } finally {
      this.done(jobId)
    }
  }
}
export const nimEngine = new NimEngine()
```

> Note: `fail()` maps aborts to `timeout`. A user Force-Stop also aborts → the cancel route already sets `cancelled` first, and `fail()`'s update only runs after the loop unwinds; guard by re-reading status, OR (simpler) have the cancel route win: in `fail()`, only set `failed/timeout` `WHERE status NOT IN (terminal)`. Add `.where(and(eq(nimJobs.id, jobId), notInArray(...)))` if you prefer; for v1 the race window is tiny and cancel runs first.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter server build`
Expected: no new errors. (Remove the unused `notInArray` note if not used.)

---

### Task 1.2: Enhance + refine + confirm routes

**Files:**
- Modify: `server/src/routes/nim.ts`

- [ ] **Step 1: Add the handlers** inside `nimRoutes` (after the cancel handler). Use `z` for validation (import `zod`).

```ts
// add near the top of nim.ts:
import { z } from 'zod'
import { users } from '../db/schema/users.js'

const enhanceSchema = z.object({
  prompt: z.string().min(1).max(20000),
  style: z.enum(['optimized', 'structured', 'explanatory', 'feature_adding']),
  nimModel: z.string().max(60).optional(),
})
const refineSchema = z.object({ changeRequest: z.string().min(1).max(8000) })
```

```ts
// Start a Prompt Enhancer job
app.post('/api/projects/:id/nim/enhance', { preHandler: [authMiddleware] }, async (request, reply) => {
  const { id } = request.params as { id: string }
  const project = await loadOwnedProject(request.user!.id, id)
  if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
  const key = await requireNimKey(request, reply); if (!key) return
  const parsed = enhanceSchema.safeParse(request.body)
  if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

  const modelId = parsed.data.nimModel ?? DEFAULT_NIM_MODEL_ID
  const [job] = await db.insert(nimJobs).values({
    userId: request.user!.id, projectId: id, kind: 'prompt_enhance', status: 'running',
    nimModel: modelId, style: parsed.data.style, inputJson: { prompt: parsed.data.prompt },
  }).returning()

  void nimEngine.runEnhance(job.id, key, parsed.data.style as any, modelId, {
    prompt: parsed.data.prompt, projectName: project.name, software: project.software, language: project.language,
  }).catch((err) => app.log.error({ err, jobId: job.id }, 'enhance job failed'))

  // prune to ~30 recent terminal jobs/project (best-effort)
  void pruneJobs(id, request.user!.id)
  return reply.status(202).send({ jobId: job.id })
})

// Refine an awaiting_user enhance job
app.post('/api/projects/:id/nim/enhance/:jobId/refine', { preHandler: [authMiddleware] }, async (request, reply) => {
  const { id, jobId } = request.params as { id: string; jobId: string }
  const key = await requireNimKey(request, reply); if (!key) return
  const parsed = refineSchema.safeParse(request.body)
  if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
  const [job] = await db.select().from(nimJobs)
    .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id))).limit(1)
  if (!job) return reply.status(404).send({ message: 'Job not found', statusCode: 404 })
  if (job.kind !== 'prompt_enhance' || job.status !== 'awaiting_user')
    return reply.status(409).send({ message: 'Job is not awaiting input', statusCode: 409 })

  const current = (job.resultJson as { prompt?: string })?.prompt ?? ''
  const history = (job.historyJson as unknown[]) ?? []
  await db.update(nimJobs).set({ status: 'running', updatedAt: new Date() }).where(eq(nimJobs.id, jobId))
  void nimEngine.runRefine(jobId, key, job.nimModel, current, parsed.data.changeRequest, history)
    .catch((err) => app.log.error({ err, jobId }, 'refine job failed'))
  return reply.status(202).send({ jobId })
})

// Mark an enhance job completed (called by client right after it dispatches the
// confirmed prompt to the Agent via the normal send path).
app.post('/api/projects/:id/nim/enhance/:jobId/complete', { preHandler: [authMiddleware] }, async (request, reply) => {
  const { id, jobId } = request.params as { id: string; jobId: string }
  await db.update(nimJobs).set({ status: 'completed', updatedAt: new Date() })
    .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
  return { status: 'completed' }
})
```

- [ ] **Step 2: Add the prune helper** at the bottom of `nimRoutes` (before the closing brace):

```ts
async function pruneJobs(projectId: string, userId: string) {
  const terminal = await db.select({ id: nimJobs.id }).from(nimJobs)
    .where(and(eq(nimJobs.projectId, projectId), eq(nimJobs.userId, userId), inArray(nimJobs.status, NIM_TERMINAL_STATUSES as any)))
    .orderBy(desc(nimJobs.createdAt))
  const stale = terminal.slice(30).map((r) => r.id)
  if (stale.length) await db.delete(nimJobs).where(inArray(nimJobs.id, stale)).catch(() => {})
}
```

- [ ] **Step 3: Build + restart + curl**

```bash
pnpm --filter server build && ./auroracraft.sh restart
# with a NIM key set on the test user + valid project id + auth cookie:
curl -s -b cookie.txt -X POST localhost:3000/api/projects/$PID/nim/enhance \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"make a teleport command","style":"optimized"}'
# → {"jobId":"..."}; then poll:
curl -s -b cookie.txt localhost:3000/api/projects/$PID/nim/jobs/$JID | python3 -m json.tool
# → status running → awaiting_user with result.prompt
```
Expected: job resolves to `awaiting_user` with a non-empty `result.prompt` (or `failed` if slugs are wrong — see Task 0.6).

---

### Task 1.3: `use-nim.ts` hook

**Files:**
- Create: `client/src/hooks/use-nim.ts`

- [ ] **Step 1: Create the hook.** Provides models, NIM-key detection (via existing `/user/provider-keys`), and job lifecycle with 2s polling.

```ts
// client/src/hooks/use-nim.ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface NimModelOption { id: string; label: string; isReasoning: boolean }
export type NimJobStatus = 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
export interface NimJobView {
  id: string
  kind: 'prompt_enhance' | 'error_fix'
  status: NimJobStatus
  nimModel: string
  agentModel?: string | null
  style?: string | null
  error?: string | null
  result?: { prompt?: string; summary?: string } | null
  createdAt: string
  updatedAt: string
}
const TERMINAL: NimJobStatus[] = ['completed', 'cancelled', 'failed', 'timeout']
export const isTerminal = (s?: NimJobStatus) => !!s && TERMINAL.includes(s)

export function useNimModels() {
  const { data } = useQuery({
    queryKey: ['nim', 'models'],
    queryFn: () => api.get<{ models: NimModelOption[]; defaultId: string }>('/nim/models'),
    staleTime: 1000 * 60 * 60,
  })
  return { models: data?.models ?? [], defaultId: data?.defaultId ?? 'step-3.7-flash' }
}

export function useHasNimKey() {
  const { data } = useQuery({
    queryKey: ['user', 'provider-keys'],
    queryFn: () => api.get<Array<{ provider: string; isActive: boolean }>>('/user/provider-keys'),
  })
  return (data ?? []).some((k) => k.provider === 'nvidia' && k.isActive)
}

/** Poll a single NIM job until terminal. */
export function useNimJob(projectId: string, jobId: string | null) {
  const { data } = useQuery({
    queryKey: ['projects', projectId, 'nim', 'job', jobId],
    queryFn: () => api.get<{ job: NimJobView }>(`/projects/${projectId}/nim/jobs/${jobId}`).then((r) => r.job),
    enabled: !!projectId && !!jobId,
    refetchInterval: (q) => (isTerminal((q.state.data as NimJobView | undefined)?.status) ? false : 1500),
  })
  return data ?? null
}

/** Reattach: latest non-terminal job for the project (on workspace open / refresh). */
export function useActiveNimJob(projectId: string, enabled = true) {
  const { data, refetch } = useQuery({
    queryKey: ['projects', projectId, 'nim', 'active'],
    queryFn: () => api.get<{ job: NimJobView | null }>(`/projects/${projectId}/nim/active`).then((r) => r.job),
    enabled: !!projectId && enabled,
    refetchInterval: (q) => (isTerminal((q.state.data as NimJobView | null | undefined)?.status ?? undefined) ? false : 1500),
  })
  return { activeJob: data ?? null, refetchActive: refetch }
}

export function useNimMutations(projectId: string) {
  const enhance = useMutation({
    mutationFn: (body: { prompt: string; style: string; nimModel?: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/enhance`, body),
  })
  const refine = useMutation({
    mutationFn: ({ jobId, changeRequest }: { jobId: string; changeRequest: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/enhance/${jobId}/refine`, { changeRequest }),
  })
  const completeEnhance = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/nim/enhance/${jobId}/complete`),
  })
  const cancel = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/nim/jobs/${jobId}/cancel`),
  })
  const errorFix = useMutation({
    mutationFn: (body: { reviewIssueRefs: Array<{ reviewId: string; issueIdx: number }>; nimModel?: string; agentModel: string; sessionId?: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/error-fix`, body),
  })
  const completeErrorFix = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/nim/error-fix/${jobId}/complete`),
  })
  return { enhance, refine, completeEnhance, cancel, errorFix, completeErrorFix }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter client build`
Expected: exit 0.

---

### Task 1.4: Prompt Enhancer modal component

**Files:**
- Create: `client/src/components/prompt-enhancer-modal.tsx`

- [ ] **Step 1: Create the component.** It owns the full lifecycle UI; the parent (workspace) drives it via props. Match the glassy modal style (see `components/ui/glassy.tsx`): fixed overlay `z-[100]`, `bg-black/60 backdrop-blur`, centered card.

```tsx
// client/src/components/prompt-enhancer-modal.tsx
import { useState } from 'react'
import { Sparkles, Loader2, X, RefreshCw, Send, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NimJobView, NimModelOption } from '@/hooks/use-nim'

export type EnhancerPhase = 'confirm' | 'options' | 'working' | 'result'
const STYLES = [
  { id: 'optimized', label: 'Optimized Structured', desc: 'Optimize and structure the prompt.' },
  { id: 'structured', label: 'Structured', desc: 'Structure only — no optimization.' },
  { id: 'explanatory', label: 'Explanatory Structured', desc: 'Structure + explain how each feature works.' },
  { id: 'feature_adding', label: 'Feature-Adding Structured', desc: 'Add safe complementary features + structure.' },
] as const

export function PromptEnhancerModal(props: {
  phase: EnhancerPhase
  job: NimJobView | null
  models: NimModelOption[]
  defaultModelId: string
  onSendAsIs: () => void          // confirm: "Send as-is"
  onStart: (style: string, nimModel: string) => void
  onConfirmSend: () => void       // result: "Confirm & Send"
  onRefine: (changeRequest: string) => void
  onCancel: () => void            // discard everything (also used as force-stop in 'working')
}) {
  const { phase, job, models, defaultModelId } = props
  const [style, setStyle] = useState<string>('optimized')
  const [model, setModel] = useState<string>(defaultModelId)
  const [refineText, setRefineText] = useState('')
  const [showRefine, setShowRefine] = useState(false)

  const Shell = ({ children, maxW = 'max-w-lg' }: { children: React.ReactNode; maxW?: string }) => (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
      <div className={cn('relative w-full mx-4 rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-2xl shadow-2xl overflow-hidden', maxW)}>
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-6">{children}</div>
      </div>
    </div>
  )

  if (phase === 'confirm') {
    return (
      <Shell maxW="max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20"><Sparkles className="h-5 w-5 text-primary" /></div>
          <h3 className="text-sm font-semibold text-text">Do you want to enhance your prompt?</h3>
        </div>
        <div className="flex gap-3">
          <button onClick={props.onSendAsIs} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Send as-is</button>
          <button onClick={() => props.onStart.length /* noop */ || undefined} className="hidden" />
          <button onClick={() => { /* advance to options */ props.onStart('__open__', model) }} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Enhance</button>
        </div>
      </Shell>
    )
  }

  if (phase === 'options') {
    return (
      <Shell>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">Enhance your prompt</h3>
          <button onClick={props.onCancel} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
        </div>
        <label className="block text-[11px] text-text-dim mb-1">Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full mb-4 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text">
          {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div className="grid grid-cols-1 gap-2 mb-5">
          {STYLES.map((s) => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={cn('text-left rounded-xl border px-3 py-2.5 transition', style === s.id ? 'border-primary/60 bg-primary/5' : 'border-border/50 hover:bg-surface-hover')}>
              <div className="text-sm font-medium text-text">{s.label}</div>
              <div className="text-[11px] text-text-dim">{s.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={props.onCancel} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Cancel</button>
          <button onClick={() => props.onStart(style, model)} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Start</button>
        </div>
      </Shell>
    )
  }

  if (phase === 'working') {
    const timedOut = job?.status === 'timeout'
    const failed = job?.status === 'failed'
    return (
      <Shell maxW="max-w-md">
        <div className="flex flex-col items-center text-center gap-3 py-4">
          {timedOut || failed
            ? <Ban className="h-8 w-8 text-destructive" />
            : <Loader2 className="h-8 w-8 text-primary animate-spin" />}
          <p className="text-sm text-text">
            {timedOut ? 'We are experiencing high traffic so the feature didn’t respond.'
              : failed ? (job?.error || 'Enhancement failed.')
              : 'Enhancing your prompt…'}
          </p>
          <button onClick={props.onCancel} className="mt-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover">
            {timedOut || failed ? 'Close' : 'Force Stop'}
          </button>
        </div>
      </Shell>
    )
  }

  // phase === 'result'
  const prompt = job?.result?.prompt ?? ''
  return (
    <Shell maxW="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Enhanced prompt</h3>
        <button onClick={props.onCancel} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[40vh] overflow-auto rounded-xl border border-border/50 bg-background/50 p-3 text-sm text-text whitespace-pre-wrap">{prompt}</div>
      {showRefine && (
        <div className="mt-3">
          <textarea value={refineText} onChange={(e) => setRefineText(e.target.value)} placeholder="Describe what to change…" className="w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text" rows={3} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={props.onConfirmSend} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"><Send className="h-4 w-4" /> Confirm & Send</button>
        {!showRefine
          ? <button onClick={() => setShowRefine(true)} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover"><RefreshCw className="h-4 w-4" /> Describe changes</button>
          : <button onClick={() => { if (refineText.trim()) { props.onRefine(refineText.trim()); setRefineText(''); setShowRefine(false) } }} className="flex-1 min-w-[140px] rounded-xl bg-primary/80 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary">Apply change</button>}
        <button onClick={props.onCancel} className="flex-1 min-w-[120px] rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Cancel</button>
      </div>
    </Shell>
  )
}
```

> The `confirm` phase uses a sentinel `'__open__'` to advance to `options`; the workspace handler treats `style === '__open__'` as "show options, don't start". Alternatively split into an explicit `onEnhanceClicked` prop — implementer's choice; keep the 4 real styles intact.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter client build`
Expected: exit 0.

---

### Task 1.5: Wire the enhancer into the workspace (all 3 send paths + lock + reattach)

**Files:**
- Modify: `client/src/pages/workspace.tsx`
- Modify: `client/src/hooks/use-agent.ts`

- [ ] **Step 1: Extend `sendMessage`** in `use-agent.ts` to carry an optional `displayContent` (used by Error Maker later; harmless for the enhancer):

```ts
const sendMessageMutation = useMutation({
  mutationFn: ({ content, model, bridge, speed, displayContent }: { content: string; model?: string; bridge?: 'opencode' | 'kiro'; speed?: string; displayContent?: string }) =>
    api.post<AgentMessage>(`/projects/${projectId}/agent/sessions/${sessionId}/messages`, { content, model, bridge, speed, displayContent }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'agent', 'sessions', sessionId] })
  },
})
```

- [ ] **Step 2: Read `workspace.tsx`** around these anchors before editing: `ChatInput` send handler (~L1400), `ChatEmptyState` (~L1485), `ChatSession.handleSend` (~L1636), `isWorkspaceLocked` (~L2248), lock banners (~L2682, ~L3419), model/speed state (~L2205-2220).

- [ ] **Step 3: Add enhancer state + a helper** at the WorkspacePage level (where `aiRunning`/`reviewLock` live). The enhancer keeps the *pending raw prompt* and the *active jobId*; it drives `PromptEnhancerModal`.

```tsx
// at top of workspace.tsx imports
import { PromptEnhancerModal, type EnhancerPhase } from '@/components/prompt-enhancer-modal'
import { useNimModels, useHasNimKey, useNimMutations, useNimJob, useActiveNimJob, isTerminal } from '@/hooks/use-nim'

// inside WorkspacePage:
const hasNimKey = useHasNimKey()
const { models: nimModels, defaultId: nimDefault } = useNimModels()
const nim = useNimMutations(projectId)
const [enhPhase, setEnhPhase] = useState<EnhancerPhase | null>(null)   // null = closed
const [enhJobId, setEnhJobId] = useState<string | null>(null)
const [enhPendingPrompt, setEnhPendingPrompt] = useState('')          // raw prompt awaiting enhancement
const [enhDeliver, setEnhDeliver] = useState<((finalPrompt: string) => void) | null>(null) // how to actually send
const enhJob = useNimJob(projectId, enhJobId)
const { activeJob } = useActiveNimJob(projectId, hasNimKey)
```

- [ ] **Step 4: Add `enhancerActive` to the lock.** Find `const isWorkspaceLocked = ...` and OR-in the enhancer:

```tsx
const enhancerActive = enhPhase !== null
const isWorkspaceLocked = isReviewLocked || aiRunning || enhancerActive
```

- [ ] **Step 5: Drive job-phase transitions** with an effect on `enhJob`:

```tsx
useEffect(() => {
  if (!enhJobId || !enhJob) return
  if (enhJob.status === 'awaiting_user') setEnhPhase('result')
  else if (enhJob.status === 'running') setEnhPhase('working')
  else if (enhJob.status === 'timeout' || enhJob.status === 'failed') setEnhPhase('working') // working phase renders timeout/fail text + Close
  else if (enhJob.status === 'cancelled' || enhJob.status === 'completed') { setEnhPhase(null); setEnhJobId(null) }
}, [enhJob, enhJobId])
```

- [ ] **Step 6: Reattach on refresh.** If an active enhance job exists and the modal is closed, reopen it:

```tsx
useEffect(() => {
  if (activeJob && activeJob.kind === 'prompt_enhance' && !enhJobId && !isTerminal(activeJob.status)) {
    setEnhJobId(activeJob.id)
    setEnhPhase(activeJob.status === 'awaiting_user' ? 'result' : 'working')
  }
}, [activeJob, enhJobId])
```

- [ ] **Step 7: The send interceptor.** Create one function used by all send paths. It opens the confirm modal and stashes how to deliver the (possibly enhanced) prompt:

```tsx
const interceptSend = useCallback((rawPrompt: string, deliver: (finalPrompt: string) => void) => {
  if (!hasNimKey) { deliver(rawPrompt); return }     // no NIM key → behave exactly as before
  setEnhPendingPrompt(rawPrompt)
  setEnhDeliver(() => deliver)
  setEnhPhase('confirm')
}, [hasNimKey])
```

- [ ] **Step 8: Replace the three send call-sites** to go through `interceptSend`:
  - **ChatSession.handleSend** (~L1636): instead of `sendMessage({ content: message, model, bridge, speed })`, call
    `interceptSend(message, (finalPrompt) => { void sendMessage({ content: finalPrompt, model, bridge, speed }) })`.
  - **ChatInput.handleSend** (~L1400): leave as-is if it only forwards to `onSend`; the interception happens at the `ChatSession`/`ChatEmptyState` level where `sendMessage`/`createSession` are available.
  - **ChatEmptyState.onSend** (~L1485): this currently creates the session then relies on `pendingMessage`. Refactor so it intercepts FIRST, then creates+sends:
    ```tsx
    // was: onSessionCreated(id, msg) after createSession
    interceptSend(msg, async (finalPrompt) => {
      const sess = await createSession({ bridge })           // existing createSession call
      onSessionCreated(sess.id, finalPrompt)                 // deliver the (enhanced) prompt
    })
    ```
    Keep the existing "first message" delivery mechanism; only the *content* changes to `finalPrompt`.

- [ ] **Step 9: Wire the modal handlers + mount it.** Near the other top-level modals in WorkspacePage's JSX:

```tsx
{enhPhase && (
  <PromptEnhancerModal
    phase={enhPhase}
    job={enhJob}
    models={nimModels}
    defaultModelId={nimDefault}
    onSendAsIs={() => { const d = enhDeliver; const p = enhPendingPrompt; setEnhPhase(null); setEnhDeliver(null); d?.(p) }}
    onStart={(style, model) => {
      if (style === '__open__') { setEnhPhase('options'); return }     // confirm → options
      nim.enhance.mutateAsync({ prompt: enhPendingPrompt, style, nimModel: model })
        .then((r) => { setEnhJobId(r.jobId); setEnhPhase('working') })
        .catch(() => setEnhPhase(null))
    }}
    onConfirmSend={() => {
      const d = enhDeliver; const finalPrompt = enhJob?.result?.prompt ?? enhPendingPrompt; const jid = enhJobId
      setEnhPhase(null); setEnhJobId(null); setEnhDeliver(null)
      d?.(finalPrompt)
      if (jid) void nim.completeEnhance.mutateAsync(jid)
    }}
    onRefine={(changeRequest) => { if (enhJobId) { nim.refine.mutateAsync({ jobId: enhJobId, changeRequest }); setEnhPhase('working') } }}
    onCancel={() => {
      const jid = enhJobId
      setEnhPhase(null); setEnhJobId(null); setEnhDeliver(null); setEnhPendingPrompt('')
      if (jid) void nim.cancel.mutateAsync(jid)
    }}
  />
)}
```

- [ ] **Step 10: Build + restart + manual UI test**

```bash
pnpm --filter client build && pnpm --filter server build && ./auroracraft.sh restart
```
Manual (browser, user with a NIM key):
- Type a prompt, click Send → "Do you want to enhance?" appears, workspace locked.
- Enhance → pick a style + model → Start → loading (Force Stop visible) → result.
- Describe changes → loops; Confirm & Send → prompt reaches the Agent; Cancel → discards.
- Refresh mid-working and at result → modal re-appears in the right state.
- User WITHOUT a NIM key → Send behaves exactly as before (no modal).

---

# PHASE 2 — Error Prompt Maker

### Task 2.1: `displayContent` split in the message endpoint

**Files:**
- Modify: `server/src/routes/agents.ts`

- [ ] **Step 1: Raise the cap and add `displayContent`.** Edit `sendMessageSchema` (L27):

```ts
const sendMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  displayContent: z.string().max(2000).optional(),
  model: z.string().max(100).optional(),
  bridge: z.enum(['opencode', 'kiro']).optional(),
  speed: z.enum(['fast', 'slow', 'rate_limited']).optional(),
})
```

- [ ] **Step 2: Persist the visible message but execute the real prompt.** At the optimistic insert (L292-295), use `displayContent` for the stored/visible content; the executor keeps getting `content`:

```ts
const visibleContent = parsed.data.displayContent ?? parsed.data.content
const [message] = await db
  .insert(agentMessages)
  .values({ sessionId, role: 'user', content: visibleContent })
  .returning()
```
(Leave the `agentExecutor.execute({ ..., prompt: parsed.data.content, ... })` call at L548 unchanged — it already uses `parsed.data.content`, the full prompt.)

- [ ] **Step 3: Build + restart + regression curl** (normal send still works):

```bash
pnpm --filter server build && ./auroracraft.sh restart
curl -s -b cookie.txt -X POST localhost:3000/api/projects/$PID/agent/sessions/$SID/messages \
  -H 'Content-Type: application/json' -d '{"content":"hello","model":"opencode-deepseek-v4-flash-free"}' -o /dev/null -w "%{http_code}\n"
# → 201; chat still shows "hello"
```
Also verify a `displayContent` send shows the summary, not the content:
```bash
curl -s -b cookie.txt -X POST localhost:3000/api/projects/$PID/agent/sessions/$SID/messages \
 -H 'Content-Type: application/json' -d '{"content":"<long real prompt>","displayContent":"Auto-fix: 2 issues","model":"opencode-deepseek-v4-flash-free"}'
# chat shows "Auto-fix: 2 issues"
```

---

### Task 2.2: Engine — error-fix agentic read loop

**Files:**
- Modify: `server/src/agents/nim-engine.ts`

- [ ] **Step 1: Add read-only file tools + the error-fix loop.** Scope reads to the project workspace dir; guard against path traversal.

```ts
// add imports
import { readFile, readdir } from 'fs/promises'
import { resolve, join, relative, isAbsolute } from 'path'

const MAX_FIX_PROMPT_CHARS = 50000
const MAX_TOOL_ROUNDS = 8

interface IssueRef { type?: string; severity?: string; fileName?: string; codegenInstructions?: string }

function safeResolve(rootDir: string, p: string): string | null {
  const abs = isAbsolute(p) ? p : resolve(rootDir, p)
  const rel = relative(rootDir, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) return null   // escaped the workspace
  return abs
}

const FIX_TOOLS = [
  { type: 'function' as const, function: {
    name: 'read_file', description: 'Read a UTF-8 text file from the project workspace (read-only).',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'workspace-relative path' } }, required: ['path'] } } },
  { type: 'function' as const, function: {
    name: 'list_files', description: 'List entries in a workspace directory (read-only).',
    parameters: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] } } },
]

export interface ErrorFixInput {
  issues: IssueRef[]
  workspaceDir: string
  projectName?: string
  software?: string
  language?: string
}

// add this method to the NimEngine class:
async runErrorFix(jobId: string, apiKey: string, modelId: string, input: ErrorFixInput) {
  const signal = (this as any).register(jobId) as AbortSignal
  const model = resolveNimModel(modelId)
  const maxTokens = model.isReasoning ? 8192 : 6000
  try {
    const issuesText = input.issues.map((it, i) =>
      `${i + 1}. [${it.severity ?? 'minor'}] ${it.fileName ?? '(unknown file)'}\n   ${it.codegenInstructions ?? '(no details)'}`).join('\n')

    const messages: NimMessage[] = [
      { role: 'system', content:
        `You are a senior Minecraft plugin engineer building an OPTIMIZED instruction prompt for a separate code-writing AI agent. ` +
        `You have READ-ONLY tools to inspect the project. Read the referenced files (and obviously-related ones) to ground the fix, ` +
        `then produce ONE detailed, well-explained fix prompt the agent can execute. Do NOT write code yourself; produce instructions. ` +
        `Project: ${input.projectName ?? '?'} | Platform: ${input.software ?? 'paper'} | Language: ${input.language ?? 'java'}. ` +
        `When ready, reply with the FINAL prompt only (no tool calls). Keep it under ${MAX_FIX_PROMPT_CHARS} characters.` },
      { role: 'user', content: `Selected code-review issues to fix:\n\n${issuesText}\n\nInspect what you need, then return the final fix prompt.` },
    ]

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const out = await nimChat({ apiKey, slug: model.slug, messages, tools: FIX_TOOLS, maxTokens, signal })
      if (out.toolCalls.length === 0) {
        const finalPrompt = (out.content || '').trim().slice(0, MAX_FIX_PROMPT_CHARS)
        const summary = `Auto-fix: ${input.issues.length} code review issue${input.issues.length === 1 ? '' : 's'}`
        await db.update(nimJobs).set({ status: 'ready', resultJson: { prompt: finalPrompt, summary }, updatedAt: new Date() }).where(eq(nimJobs.id, jobId))
        return
      }
      // record the assistant tool-call turn, then answer each tool call
      messages.push({ role: 'assistant', content: out.content ?? '', tool_calls: out.toolCalls })
      for (const tc of out.toolCalls) {
        let result = ''
        try {
          const args = JSON.parse(tc.function.arguments || '{}')
          if (tc.function.name === 'read_file') {
            const abs = safeResolve(input.workspaceDir, String(args.path ?? ''))
            result = abs ? (await readFile(abs, 'utf8')).slice(0, 20000) : 'ERROR: path outside workspace'
          } else if (tc.function.name === 'list_files') {
            const abs = safeResolve(input.workspaceDir, String(args.dir ?? '.'))
            result = abs ? (await readdir(abs)).join('\n').slice(0, 8000) : 'ERROR: path outside workspace'
          } else {
            result = 'ERROR: unknown tool'
          }
        } catch (e) {
          result = `ERROR: ${(e as Error).message}`
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result })
      }
    }
    // ran out of rounds: ask for a final answer with no tools
    const finalOut = await nimChat({ apiKey, slug: model.slug, messages: [...messages, { role: 'user', content: 'Stop inspecting. Return the final fix prompt now.' }], maxTokens, signal })
    const finalPrompt = (finalOut.content || '').trim().slice(0, MAX_FIX_PROMPT_CHARS)
    const summary = `Auto-fix: ${input.issues.length} code review issue${input.issues.length === 1 ? '' : 's'}`
    await db.update(nimJobs).set({ status: 'ready', resultJson: { prompt: finalPrompt, summary }, updatedAt: new Date() }).where(eq(nimJobs.id, jobId))
  } catch (err) {
    await (this as any).fail(jobId, err)
  } finally {
    (this as any).done(jobId)
  }
}
```

> If `fail` and `register`/`done` are `private`, make `runErrorFix` a class method (it is) so `this.fail(...)` works directly without the `(this as any)` casts — adjust visibility as needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter server build`
Expected: no new errors.

---

### Task 2.3: Error-fix routes

**Files:**
- Modify: `server/src/routes/nim.ts`

- [ ] **Step 1: Add the handlers.** Resolve selected issue refs against `code_reviews.issuesJson`, resolve the workspace dir like `agents.ts` does, start the job.

```ts
// add imports at top of nim.ts:
import { codeReviews } from '../db/schema/code-reviews.js'

const errorFixSchema = z.object({
  reviewIssueRefs: z.array(z.object({ reviewId: z.string().uuid(), issueIdx: z.number().int().min(0) })).min(1).max(50),
  nimModel: z.string().max(60).optional(),
  agentModel: z.string().max(100),
  sessionId: z.string().uuid().optional(),
})

function workspaceDirFor(username: string, linkId: string | null): string {
  if (!linkId) return '.'
  return `/home/auroracraft-${username.toLowerCase()}/${linkId}`
}
```

```ts
// Start an Error Prompt Maker (Option A) job
app.post('/api/projects/:id/nim/error-fix', { preHandler: [authMiddleware] }, async (request, reply) => {
  const { id } = request.params as { id: string }
  const project = await loadOwnedProject(request.user!.id, id)
  if (!project) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
  const key = await requireNimKey(request, reply); if (!key) return
  const parsed = errorFixSchema.safeParse(request.body)
  if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

  // Resolve issue refs → issue objects
  const reviewIds = [...new Set(parsed.data.reviewIssueRefs.map((r) => r.reviewId))]
  const reviews = await db.select().from(codeReviews)
    .where(and(eq(codeReviews.projectId, id), inArray(codeReviews.id, reviewIds)))
  const byId = new Map(reviews.map((r) => [r.id, (r.issuesJson as any[]) ?? []]))
  const issues = parsed.data.reviewIssueRefs
    .map((ref) => byId.get(ref.reviewId)?.[ref.issueIdx])
    .filter(Boolean)
  if (issues.length === 0) return reply.status(400).send({ message: 'No matching issues found', statusCode: 400 })

  const modelId = parsed.data.nimModel ?? DEFAULT_NIM_MODEL_ID
  const [job] = await db.insert(nimJobs).values({
    userId: request.user!.id, projectId: id, kind: 'error_fix', status: 'running',
    nimModel: modelId, agentModel: parsed.data.agentModel,
    inputJson: { issueRefs: parsed.data.reviewIssueRefs, sessionId: parsed.data.sessionId ?? null },
  }).returning()

  void nimEngine.runErrorFix(job.id, key, modelId, {
    issues, workspaceDir: workspaceDirFor(request.user!.username, project.linkId),
    projectName: project.name, software: project.software, language: project.language,
  }).catch((err) => app.log.error({ err, jobId: job.id }, 'error-fix job failed'))

  void pruneJobs(id, request.user!.id)
  return reply.status(202).send({ jobId: job.id })
})

// Mark an error-fix job completed (client calls after dispatching the prompt to the Agent)
app.post('/api/projects/:id/nim/error-fix/:jobId/complete', { preHandler: [authMiddleware] }, async (request, reply) => {
  const { id, jobId } = request.params as { id: string; jobId: string }
  await db.update(nimJobs).set({ status: 'completed', updatedAt: new Date() })
    .where(and(eq(nimJobs.id, jobId), eq(nimJobs.projectId, id), eq(nimJobs.userId, request.user!.id)))
  return { status: 'completed' }
})
```

- [ ] **Step 2: Build + restart + curl** (needs a code review with issues on the project):

```bash
pnpm --filter server build && ./auroracraft.sh restart
curl -s -b cookie.txt -X POST localhost:3000/api/projects/$PID/nim/error-fix \
 -H 'Content-Type: application/json' \
 -d '{"reviewIssueRefs":[{"reviewId":"'$RID'","issueIdx":0}],"agentModel":"opencode-deepseek-v4-flash-free"}'
# → {"jobId":...}; poll jobs/$JID → status running → ready, result.prompt (≤50k) + result.summary
```

---

### Task 2.4: Error Prompt Maker modal

**Files:**
- Create: `client/src/components/error-prompt-maker-modal.tsx`

- [ ] **Step 1: Create the 2-option window + Option A model pickers.** It does NOT generate anything itself — it returns the user's choice + model selections to the workspace.

```tsx
// client/src/components/error-prompt-maker-modal.tsx
import { useState } from 'react'
import { Wand2, Hammer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NimModelOption } from '@/hooks/use-nim'
import type { AIModel } from '@/types'

export function ErrorPromptMakerModal(props: {
  nimModels: NimModelOption[]
  nimDefault: string
  agentModels: AIModel[]
  defaultAgentModel: string
  onPickInBuilt: () => void
  onStartAI: (nimModel: string, agentModel: string) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'choose' | 'ai-models'>('choose')
  const [nimModel, setNimModel] = useState(props.nimDefault)
  const [agentModel, setAgentModel] = useState(props.defaultAgentModel)

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={props.onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">Auto Fix</h3>
          <button onClick={props.onClose} className="text-text-dim hover:text-text"><X className="h-4 w-4" /></button>
        </div>

        {step === 'choose' ? (
          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => setStep('ai-models')} className="text-left rounded-xl border border-border/50 hover:bg-surface-hover px-4 py-3 flex gap-3">
              <Wand2 className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-sm font-medium text-text">AI Prompt Maker</div>
                <div className="text-[11px] text-text-dim">NVIDIA NIM reads your files and builds an optimized fix prompt, then sends it to the Agent.</div></div>
            </button>
            <button onClick={props.onPickInBuilt} className="text-left rounded-xl border border-border/50 hover:bg-surface-hover px-4 py-3 flex gap-3">
              <Hammer className="h-5 w-5 text-text-muted shrink-0" />
              <div><div className="text-sm font-medium text-text">In-Built Prompt Maker</div>
                <div className="text-[11px] text-text-dim">Use the existing template-based fix prompt. No AI model involved.</div></div>
            </button>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] text-text-dim mb-1">Prompt-maker model (NVIDIA NIM)</label>
            <select value={nimModel} onChange={(e) => setNimModel(e.target.value)} className="w-full mb-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text">
              {props.nimModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <label className="block text-[11px] text-text-dim mb-1">Agent model (executes the fix)</label>
            <select value={agentModel} onChange={(e) => setAgentModel(e.target.value)} className="w-full mb-4 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-text">
              {props.agentModels.filter((m) => !m.disabled).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setStep('choose')} className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover">Back</button>
              <button onClick={() => props.onStartAI(nimModel, agentModel)} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Start</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter client build`
Expected: exit 0.

---

### Task 2.5: Wire Error Prompt Maker into the workspace

**Files:**
- Modify: `client/src/pages/workspace.tsx`

- [ ] **Step 1: Read** `handleAutoFix` (~L2261), `confirmAutoFix` (~L2297), the auto-fix model-picker overlay (~L3324), `setAutoFixPayload` (~L2330), and the Review-History "Auto Fix" button (~L3216).

- [ ] **Step 2: Insert the 2-option window.** Change `handleAutoFix` so that — instead of opening the existing agent-model picker directly — it opens `ErrorPromptMakerModal` when the user has a NIM key (otherwise go straight to the in-built flow):

```tsx
const [showErrorMaker, setShowErrorMaker] = useState(false)
const [errFixJobId, setErrFixJobId] = useState<string | null>(null)
const errFixJob = useNimJob(projectId, errFixJobId)

const handleAutoFix = useCallback(() => {
  if (!selectedIssues.length) return
  if (hasNimKey) setShowErrorMaker(true)
  else openInBuiltAutoFix()      // existing behavior: open the agent-model picker → confirmAutoFix()
}, [selectedIssues, hasNimKey])
```
(`openInBuiltAutoFix` = whatever `handleAutoFix` does today — extract its current body into that function so Option B is byte-for-byte unchanged.)

- [ ] **Step 3: Mount the modal + handlers.** Reuse the existing agent `models`/`DEFAULT_MODEL_ID` and `selectedIssues` (shape `{ reviewId, issueIdx }`):

```tsx
{showErrorMaker && (
  <ErrorPromptMakerModal
    nimModels={nimModels}
    nimDefault={nimDefault}
    agentModels={agentModels /* existing AIModel[] from /api/ai/models */}
    defaultAgentModel={selectedModel /* current workspace agent model */}
    onClose={() => setShowErrorMaker(false)}
    onPickInBuilt={() => { setShowErrorMaker(false); openInBuiltAutoFix() }}
    onStartAI={(nimModel, agentModel) => {
      setShowErrorMaker(false)
      nim.errorFix.mutateAsync({
        reviewIssueRefs: selectedIssues.map((s) => ({ reviewId: s.reviewId, issueIdx: s.issueIdx })),
        nimModel, agentModel, sessionId: currentSessionId ?? undefined,
      }).then((r) => setErrFixJobId(r.jobId)).catch(() => {})
    }}
  />
)}
```

- [ ] **Step 4: Dispatch the generated prompt when ready** (silent: visible message is the summary). Add an effect:

```tsx
useEffect(() => {
  if (!errFixJobId || !errFixJob) return
  if (errFixJob.status === 'ready' && errFixJob.result?.prompt) {
    const { prompt, summary } = errFixJob.result
    const jid = errFixJobId
    setErrFixJobId(null)
    // dispatch to the agent via the normal path; show only the summary
    void dispatchToAgent(prompt, summary ?? 'Auto-fix', errFixJob.agentModel ?? selectedModel)
      .finally(() => { void nim.completeErrorFix.mutateAsync(jid) })
  } else if (errFixJob.status === 'failed' || errFixJob.status === 'timeout' || errFixJob.status === 'cancelled') {
    setErrFixJobId(null)
    addToast(errFixJob.status === 'timeout' ? 'We are experiencing high traffic so the feature didn’t respond.' : 'Auto-fix could not be prepared.', 'error')
  }
}, [errFixJob, errFixJobId])
```

`dispatchToAgent(content, displayContent, agentModel)` should: ensure a session exists (reuse the current session or `createSession`), then `sendMessage({ content, displayContent, model: agentModel, bridge })`. Model this on the existing `autoFixPayload` → ChatPanel mechanism, OR call `sendMessage` directly with the chosen `agentModel`. The agent run then locks the workspace via the existing `aiRunning` path (normal billing applies — the *fix execution* is a normal agent run).

- [ ] **Step 5: "Preparing fix…" indicator + reattach.** While `errFixJob.status === 'running'`, show a small non-blocking banner with a Force-Stop (calls `nim.cancel.mutateAsync(errFixJobId)`). On workspace open, reattach from `activeJob` when `activeJob.kind === 'error_fix'`:

```tsx
useEffect(() => {
  if (activeJob?.kind === 'error_fix' && !errFixJobId && !isTerminal(activeJob.status)) setErrFixJobId(activeJob.id)
}, [activeJob, errFixJobId])
```

- [ ] **Step 6: Build + restart + manual UI test**

```bash
pnpm --filter client build && pnpm --filter server build && ./auroracraft.sh restart
```
Manual:
- Run a code review, select 1+ issues, click Auto Fix → 2-option window.
- Option A → pick NIM + agent model → Start → "Preparing fix…" → the Agent begins working; chat shows the summary, NOT the giant prompt.
- Force-Stop during preparation aborts it.
- Refresh during preparation → reattaches.
- Option B → behaves exactly as before (template prompt shown + sent).
- User without NIM key → Auto Fix goes straight to the in-built flow.

---

## Phase verification (end-to-end)

- [ ] Server `tsc` shows no NEW errors; `pnpm --filter client build` exits 0.
- [ ] Backend boots; `/api/nim/models` returns 6 models (401 without auth).
- [ ] Enhancer: 4 styles each return a structured result; refine loops; Confirm&Send reaches the Agent; Cancel discards; refresh re-attaches; Force-Stop works; workspace locked throughout; users without a NIM key are unaffected.
- [ ] Error Maker: Option A builds a ≤50k prompt grounded in real files, auto-sends to the chosen agent model, shows only the summary, survives refresh, Force-Stop works; Option B unchanged.
- [ ] Timeout path surfaces the high-traffic message.
- [ ] `select count(*) from token_transactions` does not increase from enhancer/prompt-maker generation (only from the subsequent agent run, which is normal).
- [ ] No files written by NIM (read-only): grep engine for `writeFile`/`mkdir` → none.

---

## Self-review notes (author)
- Spec coverage: confirm "enhance?" (T1.4/1.5), 4 styles (T1.1/1.4), 3 result choices + refine loop (T1.1/1.2/1.4/1.5), persistence/reattach (T1.5 S6, T2.5 S5), blocking lock (T1.5 S4), force-stop (T0.7 cancel + UI), Error Maker 2 options (T2.4/2.5), Option A read-only ≤50k + auto-send hidden (T2.2/2.3/2.5 + T2.1 displayContent), Option B unchanged (T2.5 S2), free+paid + NIM-key gate (T0.1/T0.7 requireNimKey + useHasNimKey), 30-min timeout msg (T1.1 deadline + T1.4 working phase + T2.5), no billing (no token-service calls in nim.ts/engine).
- Type consistency: `NimJobStatus`/`NimJobView` shared shape; `result.prompt`/`result.summary` used consistently; `reviewIssueRefs:{reviewId,issueIdx}` matches `selectedIssues`.
- Open risk: NIM slugs/base URL (Task 0.6) — feature returns `failed` jobs until confirmed; everything else still builds/runs.
