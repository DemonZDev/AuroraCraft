# Prompt Enhancer & Error Prompt Maker — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design); implementation pending
**Author:** Claude (brainstormed with user)

---

## 1. Overview & Scope

Add two NVIDIA-NIM-powered helper features to AuroraCraft. They are **distinct from the
code-writing AI Agent** (OpenCode): AuroraCraft manages them itself, calls the NIM API
directly (no CLI spawned), persists its own state, and has **no write access to the
codespace** (read-only file access only). Their sole purpose is to help the user
communicate better with the Agent and fix errors faster.

1. **Prompt Enhancer** — on Send, optionally rewrite the user's prompt in one of 4 styles,
   review the result, refine in a loop, then send to the Agent.
2. **Error Prompt Maker** — from Code Review History "Auto Fix", choose between an
   AI-generated fix prompt (NIM) or the existing in-built template prompt.

### Hard requirements
- Available to **all users — Free and Paid**.
- The **only** gate: an admin-set **NVIDIA NIM API key** on that user's account. No key →
  neither feature works (hidden/disabled on client, 403 on server).
- **No AuroraCraft token billing** for either feature (DECISION — "Free, no token charge").
- **30-minute timeout** per job → show *"We are experiencing high traffic so the feature
  didn't respond."*
- **Multiple API calls like an agent** — each piece of work uses a small multi-call NIM
  pipeline for accuracy, not a single shot.
- **Force-stop** available while any job is working.
- **Refresh/reopen-safe** — server-managed jobs continue while the user is away and
  re-attach on return.

### Non-goals / out of scope
- No "Post-Session Analyser" (the removed prior build had one; not in this scope).
- No write access to the codespace by these features — read-only only.
- No resume of a job across a **server (PM2) restart** — client refresh is fully supported;
  a backend crash mid-job marks the job `failed`/`timeout` (DECISION). The spec only
  requires surviving client refresh / tab reopen.

---

## 2. Locked Decisions

| # | Decision |
|---|----------|
| Billing | **Free** — no token charge; NIM key is the only gate. |
| Send coverage | Prompt Enhancer intercepts **every** Send, including the **first message of a brand-new session** (empty-state path refactored). |
| Error Maker Option A model | User picks **both** the NIM generation model **and** the agent model that executes the generated prompt. |
| Enhancer lock | **Blocking centered modal the entire time** (loading → result), workspace locked throughout, re-attaches on refresh. |
| Persistence | DB-backed `nim_jobs` table + fire-and-forget server engine + client poll/re-attach (Approach A). |
| Enhance window | NIM-model picker + 4 style choices combined in **one** step. |
| Message cap | Raise agent message content cap **10,000 → 50,000** chars (spec's hard max for the fix prompt; also covers long enhanced prompts). |
| Slugs | NIM `/v1/models` slugs are **unconfirmed** — ship as a clearly-flagged config constant, confirm against a live key before go-live. |

---

## 3. NVIDIA NIM Foundation

### 3.1 Provider key (`nvidia`)
The `provider_api_keys` table already stores per-user keys with a `varchar` provider column
— **no DB migration needed** for the key itself. Add `'nvidia'` to:
- `server/src/config/ai-models.ts` → `ProviderId` union + `PROVIDER_CONFIG` map
  (`{ name: 'NVIDIA NIM', baseUrl: <NIM base>, ... }`).
- `client/src/pages/admin/provider-keys.tsx` → `PROVIDERS` constant.
- `client/src/pages/admin/users.tsx` → `ProviderKeysModal` provider list.
- **Do NOT** add `'nvidia'` to `paidOnlyProviders` in `server/src/routes/admin.ts`
  (free+paid). Existing client `.toLowerCase()` normalization stores it as `nvidia`.

### 3.2 NIM model registry — `server/src/config/nim-models.ts` (new)
```
NIM_MODELS = [
  { id: 'kimi-k2.6',        label: 'Kimi K2.6',        slug: '<TODO confirm>', isReasoning: ? },
  { id: 'minimax-m2.7',     label: 'MiniMax M2.7',     slug: '<TODO confirm>', isReasoning: ? },
  { id: 'step-3.7-flash',   label: 'Step 3.7 Flash',   slug: '<TODO confirm>', default: true },
  { id: 'deepseek-v4-pro',  label: 'DeepSeek V4 Pro',  slug: '<TODO confirm>', isReasoning: ? },
  { id: 'deepseek-v4-flash',label: 'DeepSeek V4 Flash',slug: '<TODO confirm>' },
  { id: 'glm-5.1',          label: 'GLM-5.1',          slug: '<TODO confirm>' },
]
DEFAULT_NIM_MODEL_ID = 'step-3.7-flash'
```
Reasoning models must request enough `max_tokens` (e.g. 8192) so a final `content` is
emitted alongside `reasoning_content`. Slugs are **best-effort placeholders** — an
implementation step verifies them against the user's live key (`GET /v1/models`).

### 3.3 Gating
- **Server:** a shared `requireNimKey(request)` helper loads the user's active `nvidia` key;
  returns the key or sends 403 `{ error: 'NVIDIA NIM key not set' }`.
- **Client:** `use-nim.ts` reads the existing `GET /api/user/provider-keys` (masked) to learn
  whether an `nvidia` key exists. If absent, the "Enhance your prompt?" prompt and Auto-Fix →
  Option A are hidden/disabled with a tooltip: *"Ask an admin to set your NVIDIA NIM key."*

---

## 4. `nim-client.ts` — direct NIM calls (new, `server/src/bridges/`)

- Native `fetch` to the OpenAI-compatible `/v1/chat/completions` endpoint with the user's key.
- `chat({ slug, messages, tools?, maxTokens, signal })` → returns `{ content, reasoning, toolCalls }`.
- Handles reasoning models: reads `choices[0].message.reasoning_content` separately; relies on
  `content` for the final answer.
- **Deadlines:** per-call timeout + an overall job `AbortController` (30 min). Abort →
  classify as `timeout`.
- Tool-calling support (OpenAI `tools`/`tool_calls` schema) for the agentic read loop.
- Never logs the API key.

---

## 5. `nim-engine.ts` — agentic pipelines (new, `server/src/agents/`)

Read-only. The engine is given only read tools: `read_file(path)`, `list_files(dir)` — both
**scoped to the project workspace directory** (resolved via the same path logic the project
file-tree route uses). No write/exec tools ever.

### 5.1 Prompt Enhancer pipelines (per style) — multi-call
- **Optimized Structured:** analyze intent + plugin context → optimize (clarity, fill safe
  technical gaps) → structure → self-check pass.
- **Structured:** structure the user's prompt into clear sections, **no optimization**.
- **Explanatory Structured:** structure + describe how each feature will work (explanatory tone).
- **Feature-Adding Structured:** analyze intent → propose **safe** complementary features →
  integrate + structure → safety/scope check (reject unsafe/over-scoped additions).
- **Refine loop:** `(currentResult, userChangeRequest) → regenerate → result`; appends to job
  `historyJson`.

### 5.2 Error fix pipeline (Option A) — agentic read loop
- Input: the selected issues (resolved from `code_reviews.issuesJson`: `type`, `severity`,
  `fileName`, `codegenInstructions`).
- Loop: read referenced files (and obviously-related files) read-only to ground the fix →
  compose ONE optimized, detailed, well-explained fix prompt for the Agent.
- **Hard cap: ≤ 50,000 characters** (truncate/condense if over). Never shown to the user.

---

## 6. Persistence — `nim_jobs` (new schema + migration `0018`, idempotent)

`server/src/db/schema/nim-jobs.ts`:
```
nim_jobs {
  id          uuid pk
  userId      fk -> users (cascade)
  projectId   fk -> projects (cascade)
  kind        enum('prompt_enhance' | 'error_fix')
  status      enum('running' | 'awaiting_user' | 'completed' | 'cancelled' | 'failed' | 'timeout')
  nimModel    varchar           -- NIM model id used for generation
  agentModel  varchar  null     -- agent model that will execute (error_fix; enhancer uses send path)
  style       varchar  null     -- enhancer style
  inputJson   jsonb             -- original prompt | selected issue refs
  resultJson  jsonb    null     -- enhanced prompt | generated fix prompt
  historyJson jsonb    null     -- refine iterations
  error       text     null
  createdAt / updatedAt
}
```
- Migration `0018_*.sql` written **idempotent** (`DO $$ … duplicate_object` for the enums,
  `CREATE TABLE IF NOT EXISTS`) per the journal-drift gotcha; apply via `psql -1 -f` + manual
  tracking row if the live DB tracking is drifted.
- `startJob` prunes to ~30 recent terminal jobs/project. Project/user delete purges `nim_jobs`.
- In-process `Map<jobId, AbortController>` enables instant force-stop (same process as the
  fire-and-forget engine).

---

## 7. Routes — `server/src/routes/nim.ts` (new), registered in `index.ts`

All `preHandler: [authMiddleware]`; all call `requireNimKey`.

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/nim/models` | List NIM models + default (for the pickers). |
| `GET`  | `/api/projects/:id/nim/active` | Latest non-terminal job for this project+user (re-attach). |
| `GET`  | `/api/projects/:id/nim/jobs/:jobId` | Poll a job's status/result. |
| `POST` | `/api/projects/:id/nim/enhance` | Start a Prompt Enhancer job `{ prompt, style, nimModel }`. |
| `POST` | `/api/projects/:id/nim/enhance/:jobId/refine` | `{ changeRequest }` → new running phase. |
| `POST` | `/api/projects/:id/nim/error-fix` | Start Option A `{ reviewIssueRefs[], nimModel, agentModel, sessionId? }`. |
| `POST` | `/api/projects/:id/nim/jobs/:jobId/cancel` | Force-stop (abort fetch, mark `cancelled`). |

- **enhance** returns `{ jobId }` immediately; engine runs detached; client polls
  `…/jobs/:jobId` until `awaiting_user`/`completed`/terminal.
- **error-fix** runs detached; on success the **server** submits the generated prompt to the
  Agent (server-side `submitPromptToAgent` helper — bypasses the client 10k schema), then
  marks `completed`. The prompt is never returned to the client.
- "Confirm & Send" for the enhancer is a **client** action: it calls the normal agent send
  mutation with `resultJson.prompt`, then marks the job `completed` (or a dedicated
  `…/confirm` route does both server-side — implementation choice, prefer client send to reuse
  streaming wiring).

---

## 8. Feature 1 — Prompt Enhancer (client)

### 8.1 Flow
```
[Send] ─▶ confirm: "Do you want to enhance your prompt?"  [Enhance] / [Send as-is]
   [Enhance] ─▶ Enhance window:
                 NIM model ▾ (default Step 3.7 Flash)
                 ( ) Optimized Structured   ( ) Structured
                 ( ) Explanatory Structured ( ) Feature-Adding Structured
                 [Start]   [Cancel]
   [Start] ─▶ ███ BLOCKING centered modal — workspace LOCKED ███
                 • "Enhancing…"  [Force Stop]
                 • result shown ▶  [Confirm & Send] [Describe changes ↻] [Cancel]
                 [Describe changes] → text box → loops back to "Enhancing…" → result
```

### 8.2 Interception (all three send pathways in `workspace.tsx`)
1. **`ChatSession.handleSend`** (~L1636) — active session. Wrap: show confirm → enhance →
   on Confirm&Send call `sendMessage({ content: enhanced, model, bridge, speed })`.
2. **`ChatInput.handleSend`** (~L1400) — shared input handler (optionally the single hook point).
3. **`ChatEmptyState.onSend`** (~L1485) — **first message of a new session** (DECISION: must be
   covered). Refactor so it creates the session, then runs the enhance flow, then fires
   `sendMessage` explicitly (instead of relying on `pendingMessage` propagation).

### 8.3 Lock + re-attach
- New lock source `enhancerActive` folded into `isWorkspaceLocked`
  (`= isReviewLocked || aiRunning || enhancerActive`). All existing `disabled={isWorkspaceLocked}`
  gates apply.
- The blocking modal renders centered above the workspace whenever a `prompt_enhance` job is
  `running` or `awaiting_user`.
- On workspace open, `use-nim.ts` calls `GET …/nim/active`; if a `prompt_enhance` job is live,
  re-render the modal in the correct state (loading vs result) and lock the workspace.

---

## 9. Feature 2 — Error Prompt Maker (client)

### 9.1 Flow
```
Code Review History → select issue(s) → [Auto Fix]
   ─▶ window:  ( ) AI Prompt Maker     ( ) In-Built Prompt Maker
   [AI Prompt Maker] ─▶ pick NIM model ▾  +  pick Agent model ▾   [Start]
        └─▶ SILENT background job (read-only file-reading agentic loop)
              builds ≤50k-char fix prompt ─▶ server auto-sends to Agent (chosen agent model)
              prompt NEVER shown; [Force Stop] available; refresh-safe
   [In-Built Prompt Maker] ─▶ EXISTING confirmAutoFix() flow, UNCHANGED
```

### 9.2 Integration (`workspace.tsx`)
- `handleAutoFix` (~L2261) currently opens the agent-model picker directly. Insert the
  **2-option window** first.
- **Option B (In-Built):** route to the existing `confirmAutoFix()` (~L2297) →
  `setAutoFixPayload({ prompt, model })` → ChatPanel injection. **Unchanged.**
- **Option A (AI Prompt Maker):** collect NIM model + agent model → `POST …/nim/error-fix` →
  show a non-blocking "Preparing fix…" indicator (with Force-Stop) → on completion the agent
  run begins (normal `aiRunning` lock). Re-attach via `GET …/nim/active` (`error_fix` running).
- **Session handling:** the generated prompt must land in an agent session. The `error-fix`
  flow ensures one exists — reuse the project's current/active session if present, otherwise
  create a session (mirroring how the existing in-built auto-fix path lazily creates a session
  via ChatPanel) before `submitPromptToAgent` runs. The chosen agent model + bridge are applied
  to that session.
- Selected-issue identity is `{ reviewId, issueIdx }` pairs (existing `selectedIssues` shape).

### 9.3 Message cap raise
- `sendMessageSchema` content max `10000 → 50000` in `server/src/routes/agents.ts`.
- Add server-side `submitPromptToAgent(sessionId, prompt, agentModel)` reusing the existing
  message-persist + `agentExecutor.execute` path, callable by the `error_fix` job.

---

## 10. Cross-cutting behavior

- **Timeout:** overall 30-min `AbortController`; on expiry → status `timeout`; client maps
  `timeout` → *"We are experiencing high traffic so the feature didn't respond."*
- **Force-stop:** `cancel` route aborts the in-flight `fetch` via the in-process map + sets
  `cancelled`; client closes the modal/indicator and unlocks.
- **Read-only guarantee:** engine exposes only `read_file`/`list_files`, workspace-scoped.
- **No billing:** these routes never call `token-service` deduct/reconcile.

---

## 11. File-by-file change list

**New (server):**
- `server/src/bridges/nim-client.ts`
- `server/src/agents/nim-engine.ts`
- `server/src/config/nim-models.ts`
- `server/src/db/schema/nim-jobs.ts`
- `server/src/routes/nim.ts`
- `server/drizzle/0018_*.sql` (idempotent) + `meta/_journal.json` entry

**New (client):**
- `client/src/hooks/use-nim.ts`
- `client/src/components/prompt-enhancer-modal.tsx`
- `client/src/components/error-prompt-maker-modal.tsx`

**Edited (server):**
- `server/src/config/ai-models.ts` — `ProviderId` + `PROVIDER_CONFIG` add `nvidia`
- `server/src/routes/admin.ts` — provider-key allow `nvidia` (NOT paid-only)
- `server/src/routes/agents.ts` — content cap 10k→50k; `submitPromptToAgent` helper
- `server/src/db/index.ts` — register `nimJobs` schema
- `server/src/index.ts` — register `nim` routes
- `server/src/db/schema/users.ts` / `projects.ts` — (only if cascade purge needs wiring)

**Edited (client):**
- `client/src/pages/workspace.tsx` — 3 send-path interceptions; Auto-Fix 2-option window;
  `enhancerActive` lock source; job re-attach; modals mount
- `client/src/pages/admin/users.tsx`, `client/src/pages/admin/provider-keys.tsx` — `nvidia` option
- `client/src/types/index.ts` — NIM job/model client types
- `client/src/hooks/use-agent.ts` — (if a programmatic send helper is needed for enhancer confirm)

---

## 12. Build phases

- **Phase 0 — Foundation:** `nvidia` provider key (server+admin UI), `nim-models.ts`,
  `nim-client.ts`, `requireNimKey`, `nim_jobs` schema + migration, `nim.ts` route scaffold +
  registration, `use-nim.ts` skeleton + key detection. Verify slugs against live key.
- **Phase 1 — Prompt Enhancer:** engine pipelines (4 styles + refine), enhance/refine/cancel
  routes, `prompt-enhancer-modal.tsx`, intercept all 3 send paths, lock + re-attach.
- **Phase 2 — Error Prompt Maker:** 2-option window, Option A engine (agentic read loop ≤50k),
  NIM+agent model pickers, `error-fix` route + `submitPromptToAgent` + cap raise, Option B
  preserved, re-attach.

Each phase: `pnpm --filter server build` / `pnpm --filter client build` →
`./auroracraft.sh restart` → `pm2 logs auroracraft-server` → exercise via UI/curl.

---

## 13. Verification checklist

- Server `tsc` 0 new errors; client build exit 0; backend boots; routes 401 without auth and
  403 without a `nvidia` key.
- Enhancer: each of 4 styles returns a structured result; refine loop updates; Confirm&Send
  reaches the Agent; Cancel discards; refresh re-attaches the blocking modal; Force-Stop works;
  workspace locked throughout.
- Error Maker: Option A produces a ≤50k prompt grounded in real file contents, auto-sends to the
  chosen agent model, never displays the prompt, survives refresh, Force-Stop works; Option B
  behaves exactly as today.
- Timeout path shows the high-traffic message.
- No token deductions recorded for either feature.

---

## 14. Open items

- **NIM slugs** must be confirmed against the user's live key before go-live (Phase 0 step).
- Confirm the correct NIM **base URL** for the chat-completions endpoint for this account.
