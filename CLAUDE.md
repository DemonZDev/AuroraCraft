# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Policy
**You MUST always respond in English.** Do not use Chinese, Japanese, Korean, or any other non-English language in your responses, file contents, code comments, or any output. This is a strict requirement. If the user writes in another language, you may acknowledge it briefly in English, but your substantive response must be entirely in English.

## Response Quality Standards
1. **Be concise but thorough.** Avoid unnecessary preamble. Get to the point quickly.
2. **Use tools to act, not just explain.** When the user asks for a change, make the change.
3. **Follow AGENTS.md conventions.** Read `AGENTS.md` in the project root before starting work.
4. **Prefer parallel tool calls.** When multiple operations are independent, call them in parallel.
5. **Show git diff on changes.** When modifying files, show what changed in your response.
6. **No summaries for simple tasks.** If the task is trivial, just do it and report completion.
7. **Ask for clarification when ambiguous.** If a request has multiple interpretations, ask rather than guess.

## Code & File Standards
1. **Write clean, maintainable code.** Follow existing project style and conventions.
2. **Never commit secrets.** Do not hardcode API keys, tokens, or passwords.
3. **Prefer editing existing files.** Only create new files when explicitly needed.
4. **Verify before claiming success.** Run tests, check output, or read the modified file.
5. **Use absolute paths in tool calls.** When tools require absolute paths, use them.

## Git Policy
1. **Never run git commit, push, reset, or rebase unless explicitly asked.**
2. **Always ask for confirmation before git mutations**, even if previously confirmed.
3. **Stage only intended files.** Check `git status` and `git diff` before any commit.

## Error Handling
- If a tool fails, report the exact error. Do not silently retry or obfuscate failures.
- When unsure how to proceed, stop and ask the user for clarification.

---

## Project Overview

AuroraCraft is an AI-powered Minecraft plugin development platform. Users describe what they want, and an AI agent (OpenCode) writes the plugin code. The platform supports Java & Kotlin, Maven & Gradle, and 18 different Minecraft server platforms (Paper, Purpur, Spigot, Folia, hybrid servers, proxies, etc.).

**Tech Stack:** React 19 + Vite 7 frontend, Fastify 5 + Drizzle ORM + PostgreSQL backend, OpenCode AI agent bridge, PM2 process management, TypeScript strict mode throughout.

**AI runtime is DB-driven, not hardcoded (read this first).** AI providers, models, and MCP servers live in the database (`ai_providers` / `ai_models` / `mcps`, migrations 0019–0021) and are managed at runtime from **Admin Panel → AI Runtime** — there is no hardcoded model list to edit. `server/src/config/ai-models.ts` now holds ONLY pricing math; the data source is `server/src/utils/ai-runtime.ts`. Paid providers route through a per-project **LiteLLM proxy** with **multi-key routing + real-time per-call billing** (a user can hold many keys per paid provider, each weighted with a dollar limit). See [API Key Routing & Real-Time Billing](#api-key-routing--real-time-billing) below. Built-in seeded providers: OpenCode Zen (free, 2 models), OpenRouter (paid), NVIDIA NIM (free).

## Development Commands

### Workspace Structure
This is a pnpm workspace with two packages: `client/` (frontend) and `server/` (backend).

```bash
# Install all dependencies (run from root)
pnpm install

# Development (both services)
pnpm dev                    # Starts both client and server in watch mode
pnpm --filter client dev    # Client only (Vite dev server on port 5173)
pnpm --filter server dev    # Server only (tsx watch on port 3000)

# Build
pnpm build                  # Builds both client and server
pnpm --filter client build  # Client only → client/dist/
pnpm --filter server build  # Server only → server/dist/

# Database
pnpm db:generate            # Generate Drizzle migration from schema changes
pnpm db:migrate             # Run migrations
pnpm db:seed                # Seed admin user + create Linux user

# Linting
pnpm --filter client lint   # ESLint on client code
```

### Production Management
```bash
./auroracraft.sh            # Interactive menu
./auroracraft.sh start      # Start PostgreSQL + PM2 backend
./auroracraft.sh restart    # Full restart (loads latest code)
./auroracraft.sh stop       # Stop everything
./auroracraft.sh web        # Status, URLs, health check, logs
```

### Testing a Change
```bash
# 1. Make code changes
# 2. Build
pnpm build
# 3. Restart
./auroracraft.sh restart
# 4. Check logs
./auroracraft.sh web
pm2 logs auroracraft-server --lines 50
```

## Architecture

### Per-User Isolation
Every registered user gets a Linux system user (`auroracraft-{username}`) with their own home directory (`/home/auroracraft-{username}/`). OpenCode instances run as that user via `runuser`, so users cannot access each other's files or processes.

**Key files:**
- `server/src/db/seed.ts` — Creates both DB user and Linux user
- `server/src/routes/auth.ts` — Registration endpoint calls `adduser` via sudo
- `server/src/bridges/opencode-process-manager.ts` — Spawns OpenCode as the user

### OpenCode Instance Lifecycle
Each AI message spawns a fresh OpenCode instance on a dynamic port (9000-9999). The instance runs until idle timeout (120s), then is killed and the port is released.

**Flow:**
1. User sends message → backend allocates port
2. Spawns OpenCode via `runuser -l auroracraft-{user} -- opencode serve --port {port}`
3. Waits for `/session` endpoint to respond (health check)
4. Streams AI response via SSE
5. Idle timeout → SIGTERM → SIGKILL → port released

**Key files:**
- `server/src/bridges/opencode-process-manager.ts` — Process spawning, port allocation, lifecycle
- `server/src/bridges/opencode.ts` — SSE streaming, message parsing, thinking tag extraction
- `server/src/routes/agents.ts` — `/api/agents/:sessionId/message` endpoint

### AI Runtime (Admin-Managed: Providers, Models, MCPs)
**Providers, models, and MCPs are DB-managed — never hardcoded.** Added/edited at runtime from Admin Panel → AI Runtime; no code edits, no redeploy. (Old hardcoded `config/ai-models.ts` data + `config/nim-models.ts` were removed in the AI Runtime redesign, migration 0019.)

**Tables (migrations 0019–0021):**
- `ai_providers` (`slug`, `base_url`, `kind` `openai_compatible|zen`, `is_free`, `is_active`, `is_builtin`) — `server/src/db/schema/ai-providers.ts`
- `ai_models` (`provider_id` FK, `show_name`, `real_name` upstream id, `usages` jsonb `agent|prompt_enhancer|error_prompt_maker`, `type_tag`, `weight`, per-1M pricing) — `ai-models.ts`
- `mcps` (`name`, raw OpenCode MCP `config`, `api_type` `non_api|api`) — `mcps.ts`

**Rules:** provider `is_free` ⇒ models cost 0 tokens, any user may hold a key, **one key per user**; paid ⇒ keys require paid users and **multiple keys per user** allowed. Within (`show_name`, overlapping usage), `type_tag` AND `weight` must be unique. Built-ins (Zen/OpenRouter/NVIDIA NIM, `is_builtin`) can't be deleted and their endpoint can't be edited. Demotion to free blocked while a user holds any paid-provider key.

**Single source of truth:** `server/src/utils/ai-runtime.ts` (`resolveModelById`, `listModelsForUsage`, `getRoutedKeysForProvider`, `getUserRoutedKeysByProvider`, `getUserProviderKeyMap`). MCP resolution: `server/src/utils/mcp-runtime.ts`. Admin CRUD: `server/src/routes/ai-admin.ts`.

### API Key Isolation (Per-Project)
Provider API keys are **never stored in the workspace tree**. They are isolated per-project to prevent exposure through the code editor.

**How it works:**
1. Workspace `opencode.json` contains only a minimal stub (`$schema`, `permission`, `tools`, `model`) — no secrets
2. Real provider config (with API key, or the LiteLLM master key) is written to `/var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/opencode.json` (600 perms, user-only)
3. OpenCode is spawned with `HOME=/var/lib/auroracraft/configs/{user}/{linkId}` so it reads the isolated config
4. Each project gets its own isolated `HOME`, preventing concurrent projects from interfering

**Key files:**
- `server/src/utils/provider-config.ts` — Generates isolated config files
- `server/src/bridges/opencode-process-manager.ts` — Sets `HOME` env var before spawning

**Special case — OpenCode Zen:** Zen API keys are written to `~/.local/share/opencode/auth.json` (not `opencode.json`). Zen models use the `opencode/{model_id}` format (e.g., `opencode/deepseek-v4-flash-free`) and resolve natively in OpenCode — they do NOT go through LiteLLM.

### API Key Routing & Real-Time Billing
For **paid providers**, a user can hold multiple keys and AuroraCraft routes across them while billing **per upstream call in real time** (this replaced the old estimate→pre-charge→reconcile cycle entirely).

**Routing chain:** each key (`provider_api_keys`) has `weight` (lower = higher priority), `limit_usd` (null = unlimited), live `used_usd`, `exhausted_at`, `is_active`. Usable keys (active + under-budget) are ordered by weight and emitted as one LiteLLM **deployment per key** (`order` = position). On rate-limit/error → retry (`LITELLM_NUM_RETRIES`) then fall back, key stays enabled. On budget exhaustion (`used_usd ≥ limit_usd`) → key auto-disabled + chain falls back. No usable key → request refused (503) before spend. **Free providers do NOT route** — single key, no chain.

**Real-time dual-ledger billing:** a Python meter (`aurora_litellm_callback.py`, embedded in `litellm-config.ts` and shipped into each project's LiteLLM config dir) fires after every successful call and POSTs real usage to `POST /internal/litellm/usage` (shared-secret, `server/src/routes/internal.ts`). Each call debits BOTH ledgers from the same usage: the **user's token balance** (`calculateTokenCost` = ×1.2 commission ×1000) and the **serving key's `used_usd`** (raw provider $, no commission). If balance hits 0 mid-run, the meter's pre-call hook refuses further calls AND the backend force-stops OpenCode. Balance is clamped at 0 (never negative). Same metering applies to the **Prompt Enhancer + Error Prompt Maker** (`nim-engine.ts` `meteredNimChat`, direct provider calls over the chain, not LiteLLM).

**Pricing math** (`server/src/config/ai-models.ts`): `$1 = 1000 tokens`, `TOKEN_MULTIPLIER = 1.2`. `calculateTokenCost(in,out,pricing,cached)` = user charge (×1.2 ×1000, ceil). `calculateProviderCostUsd(...)` = raw $ for the key ledger. Both from the same token counts; only the multiplier differs. Free-provider models always cost 0.

**Key files:**
- `server/src/utils/ai-runtime.ts` — routed-key resolvers
- `server/src/utils/token-service.ts` — `chargeRealtimeUsage` (atomic dual deduct, auto-disable, killRun)
- `server/src/utils/litellm-config.ts` — multi-deployment config + embedded meter; `litellm-process-manager.ts` passes `AURORA_*` env + config-hash reload
- `server/src/routes/internal.ts` — `POST /internal/litellm/usage`
- `server/src/routes/agents.ts` — entry gate (≥1 usable key + min balance), no pre-charge/reconcile
- `server/src/routes/admin.ts` — per-user multi-key CRUD (append/PATCH/reset-usage/delete-by-keyId)

### MCP Servers (Admin-Managed — Firecrawl Is Just One Example)
MCPs are DB-managed (Admin Panel → AI Runtime → MCPs), no longer Firecrawl-only or hardcoded. `non_api` MCPs run for everyone; `api` MCPs need a per-user key and substitute the literal `MCP-API-Key` placeholder in the config at runtime (`server/src/utils/mcp-runtime.ts`). Resolved per message in `agents.ts` (`buildUserMcpServers`) and registered on the OpenCode instance via the HTTP API (`server/src/utils/opencode-mcp.ts`). **Never** write `mcpServers` into `opencode.json` — OpenCode's schema rejects it; register via HTTP API after start. Firecrawl web search is the canonical `api` example.

### AI Agent Sandbox
All AI-generated commands run through a sandboxed wrapper (`/usr/local/bin/aurora-sandbox`) that enforces security boundaries.

**Blocked:** `curl`, `wget`, `ssh`, `sudo`, `rm -rf /`, `eval`, `mount`, `docker`, and any command reading `/etc/passwd`, `/etc/shadow`, or `opencode.json`.

**Filesystem restriction:** AI can only access files within the project directory, `/tmp`, and shared Maven/Gradle caches.

**Build tool restriction:** If a project is configured for Maven, `gradle` commands are blocked; if Gradle, `mvn` commands are blocked.

**Java version isolation:** Projects can specify a target Java version (8, 11, 17, 21, or 25). The sandbox sets `JAVA_HOME` to the appropriate JDK before running commands.

**⚠️ Current wiring (important):** OpenCode is spawned directly with `OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS=true`. The `sandboxPath` constant is declared in `opencode-process-manager.ts` but is **not currently passed to the spawn command** (verified — the wrapper is defined but not on the command path). Treat `aurora-sandbox` as the *intended* policy, not an active runtime guard. Do **not** edit it to gate a feature's commands expecting enforcement — feature-level gating (e.g. Graphify) is done by **skill presence** instead. Hardening this (wiring the wrapper, or an isolated `tool.execute.before` plugin) is a separate effort.

### Graphify Token Savings (Product Feature — Paid-Only)

> Not to be confused with the **dev-tooling** graphify at the end of this file (which Claude Code uses to navigate *this* repo). This section is the **end-user product feature**: paid AuroraCraft users build a knowledge graph of *their own* plugin project so the AI agent reads fewer files and spends fewer tokens.

Paid users click **"Save tokens using Graphify"** in the workspace to build a per-project code knowledge graph (`graph.json` + `graph.html`). **Builds cost 0 AuroraCraft tokens** — plugin projects are code-only, so Graphify runs AST-only structural extraction and skips its paid LLM semantic pass entirely.

**How it works:**
1. Build command, run as the project's Linux user: `cd <workspace> && rm -rf graphify-out && graphify update . --force` — a **full rebuild** (delete + re-extract, not incremental). `update` is the no-LLM path; **never** use `graphify extract` (pulls in an LLM backend).
2. On success a per-project **`graphify-navigation`** OpenCode skill is written so the agent runs `graphify query/path/explain/affected` (all local, 0 tokens, no network).
3. **Rebuild trigger:** only when the OpenCode session ends (idle timeout) — wired into `cleanupInstance()` in the process manager, which fire-and-forgets `onSessionEnd(directory)`.
4. **Re-enable on workspace open:** `GET /api/projects/:id` calls `reconcileOnWorkspaceOpen()`; if the user is paid + enabled + status `none`, it atomically claims (`none`→`building`) and rebuilds (lazy re-promotion).
5. **Viewer:** `GET /api/projects/:id/graphify/graph.html` streams the graph; the frontend renders it as a web view **inside the editor panel** (sentinel `selectedFile = '__graphify_graph_view__'`), not a modal. Opening `graphify-out/graph.html` from the file tree still shows raw HTML.

**State on `projects` (migration `0017`):**
- `graphifyEnabled` (boolean, *intent*) — set by "Save tokens"; **preserved across tier demotion**; cleared only by explicit "Remove Graphify".
- `graphifyStatus` (enum `none|building|ready|failed`) + `graphifyBuiltAt` (timestamp).

**Tier transitions** (`PATCH /api/admin/users/:id/tier`):
- paid→free: `cleanupUserGraphify()` deletes artifacts + skill from all the user's projects but **keeps `graphifyEnabled`**.
- free→paid: `markUserForRebuild()` resets enabled projects to status `none` so they rebuild lazily on next workspace open.

**Isolation & no-merge:** the graph lives in the user-owned workspace (`<workspace>/graphify-out/`); the `graphify-navigation` skill lives in the isolated HOME at `.config/opencode/skills/graphify-navigation/` **alongside** (never merged into) the Minecraft `AGENTS.md` and 8 skills. Removal deletes **only** that one skill dir, never the parent.

**Command gating = skill presence.** The agent uses graphify only while the skill is present (enabled); the read-only subcommands also self-gate (they need `graphify-out/graph.json`, absent when disabled). `aurora-sandbox` is **not** relied on (see the wiring note above).

**Key files:**
- `server/src/utils/graphify-service.ts` — the **only** place that shells out to `graphify`: build/remove, skill write/remove, per-project lock, and the four reconcilers (`onSessionEnd`, `reconcileOnWorkspaceOpen`, `cleanupUserGraphify`, `markUserForRebuild`)
- `server/src/routes/graphify.ts` — `GET`/`POST`/`DELETE /api/projects/:id/graphify` + `GET …/graph.html`
- `client/src/components/graphify-controls.tsx`, `client/src/hooks/use-graphify.ts` — paid-gated buttons + viewer
- `opencode-knowledge/skills/graphify-navigation/SKILL.md` — the isolated skill (NOT added to `skillsToCopy` in `opencode-knowledge.ts`)

**Shared install:** `graphify` is a Python CLI in a shared venv at `/var/lib/graphify/shared/venv`, symlinked to `/usr/local/bin/graphify` (globally accessible to all `auroracraft-{user}` users, like OpenCode/LiteLLM; requires `python3-venv`).

**Critical:** never set `GEMINI_API_KEY` / `GOOGLE_API_KEY` in the server environment — they are the only keys graphify reads, and their presence would turn a free AST build into a paid LLM build. The build command unsets them defensively.

### Shared Caches
OpenCode plugins, Gradle dependencies, and Maven artifacts are shared across all users to prevent storage duplication. Every `auroracraft-{username}` user has symlinks pointing to shared directories:

| Cache | Location | Per-User Symlink |
|-------|----------|------------------|
| OpenCode plugins | `/var/lib/opencode/shared/node_modules` | `~/.config/opencode/shared/node_modules` |
| Gradle dependencies | `/var/lib/gradle/shared` | `~/.gradle/caches` |
| Maven artifacts | `/var/lib/maven/shared` | `~/.m2/repository` |
| Graphify CLI (Python venv) | `/var/lib/graphify/shared/venv` | global `/usr/local/bin/graphify` (no per-user symlink) |

**Permissions:** Shared directories use `777` permissions because each user runs as their own UID. A group-based approach would require `sg` on every `runuser` call, which is fragile. (The Graphify venv is `755` — read-only/execute for all users — since nothing writes into it; per-project graphs are written into each user's own workspace.)

**Setup:** Symlinks are automatically created during user registration by `server/src/utils/shared-cache.ts`. The shared directories must be initialized before the first user registration (see README Step 15).

## Key Patterns

### Database Schema
- **Users:** `server/src/db/schema/users.ts` — User accounts, roles (admin/user), token balances
- **Projects:** `server/src/db/schema/projects.ts` — Project metadata, software type, language, compiler, bridge, visibility, Graphify state (`graphifyEnabled`, `graphifyStatus`, `graphifyBuiltAt`)
- **Agent Sessions:** `server/src/db/schema/agent-sessions.ts` — OpenCode session tracking, model, provider, speed
- **Agent Messages:** `server/src/db/schema/agent-messages.ts` — Chat history, role (user/assistant), parts (text/thinking/tool)
- **AI Providers / Models / MCPs:** `server/src/db/schema/ai-providers.ts`, `ai-models.ts`, `mcps.ts` — admin-managed AI runtime (DB-driven, not hardcoded)
- **Provider API Keys:** `server/src/db/schema/provider-api-keys.ts` — per-user secrets linked by `provider_id` OR `mcp_id`; multi-key routing fields (`weight`, `limit_usd`, `used_usd`, `exhausted_at`, `label`). One key/user for free providers; many for paid (the routing chain)

**Migrations:** SQL files in `server/drizzle/` are applied in order. The journal (`server/drizzle/meta/_journal.json`) tracks which migrations have been applied.

### Frontend State Management
- **Auth:** `client/src/stores/auth-store.ts` — Zustand store for user session, login/logout
- **Projects:** `client/src/hooks/use-projects.ts` — TanStack Query hooks for project CRUD
- **Agent:** `client/src/hooks/use-agent.ts` — SSE streaming, message sending, session management
- **Admin:** `client/src/hooks/use-admin.ts` — Admin panel data fetching (users, projects, stats)
- **AI Runtime (admin):** `client/src/hooks/use-ai-admin.ts` — providers/models/MCPs CRUD + per-user multi-key mutations (used by `pages/admin/ai-runtime.tsx` and the `UserKeysModal` in `pages/admin/users.tsx`); `use-ai-models.ts` — model list for the workspace picker (model ids are `ai_models` UUIDs, not slugs)
- **Graphify:** `client/src/hooks/use-graphify.ts` — Enable/remove/status with build polling (paid-only); buttons + viewer in `client/src/components/graphify-controls.tsx`

### API Routes
- **Auth:** `server/src/routes/auth.ts` — Login, register, logout, GitHub OAuth
- **Projects:** `server/src/routes/projects.ts` — CRUD, file tree, download, fork, community features
- **Agents:** `server/src/routes/agents.ts` — Create session, send message (SSE), stop session; resolves model + routed keys, provisions LiteLLM
- **Admin:** `server/src/routes/admin.ts` — User management, token grants/deductions, **per-user multi-key CRUD** (provider keys with weight/limit/label, reset-usage, delete-by-keyId; MCP keys), stats
- **AI Runtime (admin):** `server/src/routes/ai-admin.ts` — CRUD for providers / models / MCPs (`/api/admin/ai/...`); paid→free provider toggle prunes extra keys
- **Internal (machine-to-machine):** `server/src/routes/internal.ts` — `POST /internal/litellm/usage` real-time meter (shared-secret, not auth-middleware)
- **NIM (enhancer/maker):** `server/src/routes/nim.ts` — Prompt Enhancer + Error Prompt Maker jobs (now billed per call over the key chain)
- **CodeRabbit:** `server/src/routes/coderabbit.ts` — AI code review for uncommitted changes
- **GitHub:** `server/src/routes/github.ts` — OAuth callback, repo import
- **Graphify:** `server/src/routes/graphify.ts` — Enable/remove/status + `graph.html` viewer (paid-only)

### Thinking Tag Parsing
Some models (DeepSeek via Fireworks/Blueminds) emit reasoning as plain text rather than native reasoning parts. The bridge parses three formats automatically:
- `<thinking>...</thinking>` — Generic thinking tags
- `<reasoning>...</reasoning>` — Generic reasoning tags
- `<think>...</think>` — DeepSeek native format

**Key file:** `server/src/bridges/opencode.ts` — `parseThinkingTags()` function

### Model Selection Persistence
The workspace remembers the chosen AI model and speed per project across page refreshes. Selection is saved to `localStorage` under key `auroracraft:model:{projectId}`. On page load, the saved model is validated against the project's bridge (Kiro vs OpenCode).

**Key file:** `client/src/pages/workspace.tsx` — `useEffect` hook loads saved model from localStorage

## Common Gotchas

### TypeScript Build Errors
The server build uses `noEmitOnError: false` in `server/tsconfig.json` because pre-existing type errors in legacy files (`coderabbit.ts`, `users.ts`) would otherwise block all builds. The server still compiles successfully despite these warnings. **Do not change this setting** unless you fix all type errors first.

### PM2 Script Path
The `ecosystem.config.cjs` file must point to the **direct `.mjs` entry point** of tsx, not the shell wrapper. If the backend fails to start, check that the `script` field matches your installed tsx version:
```js
script: '/root/AuroraCraft/node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs',
```

### OpenCode Global Accessibility
OpenCode must be installed in a globally accessible location (`/usr/local/bin/opencode`) so it can be executed by all `auroracraft-{username}` users. A binary inside `/root/.nvm/...` or `/root/.local/share/pnpm/...` is **inaccessible** to other users.

### Project Deletion Foreign Key
`token_transactions.session_id` must reference `agent_sessions(id)` with `ON DELETE SET NULL` (not `ON DELETE NO ACTION`). Otherwise, deleting a project fails because sessions are cascade-deleted but transactions still reference them. Migration `0014_fix_token_transactions_fk.sql` fixes this.

### MCP Config Validation
Never write `mcpServers` into `opencode.json` — OpenCode's schema rejects it (`ConfigInvalidError: Unrecognized key: mcpServers`). Register MCP servers via the HTTP API (`POST /mcp`) after the instance starts. Applies to every MCP, not just Firecrawl.

### Zen Model ID Format
Zen models always use the `opencode/` prefix (e.g., `opencode/deepseek-v4-flash-free`). Never use `opencode/opencode/` or `zen/` prefixes.

### LiteLLM Integration (Multi-Key Routing + Real-Time Meter)
LiteLLM proxies **all paid (non-Zen) OpenAI-compatible providers** — it handles `/responses`→`/chat/completions` translation, ordered multi-key routing, and hosts the real-time billing meter. Zen bypasses it (native `opencode/<id>`).

**How it works:**
1. On a paid-model message, the backend builds a per-project `litellm.yaml` with **one deployment per usable key** (ordered by weight via `order`), each carrying `model_info.aurora_key_id` + raw per-token pricing, plus `num_retries` and the meter callback.
2. The meter (`aurora_litellm_callback.py`) is shipped into the project's config dir; `litellm-process-manager` passes `AURORA_USER_ID/PROJECT_DIR/CALLBACK_BASE/INTERNAL_SECRET` env so it can POST usage back.
3. LiteLLM is spawned per-project on a dynamic port; OpenCode routes through it. The proxy is restarted when the config hash changes (e.g. a key exhausted and dropped out).
4. After each call the meter reports usage → backend bills user + key in real time (see [API Key Routing & Real-Time Billing](#api-key-routing--real-time-billing)). There is **no** LiteLLM-level `max_budget` / token-USD safety net anymore — the meter is the enforcement.

**Key files:**
- `server/src/bridges/litellm-process-manager.ts` — process lifecycle, `AURORA_*` env, config-hash reload
- `server/src/utils/litellm-config.ts` — multi-deployment config gen + embedded Python meter + master key persistence
- `server/src/routes/agents.ts` — starts LiteLLM before OpenCode for paid models (passes the routed key set)

**Installation:** shared Python venv at `/var/lib/litellm/shared/venv/bin/litellm` (globally accessible). **Requires `httpx`** in that venv for the meter (README Step 15.7). Env: `LITELLM_PORT_MIN/MAX`, `LITELLM_IDLE_TIMEOUT`, `LITELLM_NUM_RETRIES`, optional `LITELLM_INTERNAL_SECRET` (falls back to `SESSION_SECRET`).

### Dynamic Rules & Skills System
Every AuroraCraft project gets a custom `AGENTS.md` rule file and 8 skill files auto-generated based on the selected platform, compiler, and language.

**How it works:**
1. User sends first AI message on a project
2. Backend reads project config (software, compiler, language, Java version)
3. Loads `TEMPLATE_BASE.md` + relevant fragments from `opencode-knowledge/rules/fragments/`
4. Replaces placeholders (`{SOFTWARE}`, `{COMPILER}`, `{LANGUAGE}`, `{API_RULES}`, `{BUILD_RULES}`, etc.)
5. Writes to per-project isolated HOME: `/var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/AGENTS.md` and `skills/`
6. OpenCode auto-discovers and loads on startup via HOME directory

**Knowledge Base Structure:**
```
opencode-knowledge/
├── rules/
│   ├── TEMPLATE_BASE.md         ← 14-section template with {PLACEHOLDERS}
│   └── fragments/
│       ├── paper-api.md         ← Paper/Paper-fork API rules
│       ├── folia-api.md         ← Folia regionized threading rules
│       ├── spigot-api.md        ← Spigot legacy ChatColor rules
│       ├── purpur-api.md        ← Purpur extension rules
│       ├── velocity-api.md      ← Velocity proxy API rules
│       ├── bungeecord-api.md    ← BungeeCord proxy API rules
│       ├── maven-build.md       ← Maven build system rules
│       ├── gradle-build.md      ← Gradle build system rules
│       ├── java-rules.md        ← Java 21 patterns
│       └── kotlin-rules.md      ← Kotlin patterns
└── skills/                      ← 8 OpenCode-compatible SKILL.md files
    ├── database-setup/
    ├── event-handling/
    ├── command-framework/
    ├── config-management/
    ├── async-operations/
    ├── gui-inventory/
    ├── scheduler-tasks/
    └── paper-components/
```

**Key file:** `server/src/utils/opencode-knowledge.ts` — Generates and writes per-project rules and skills

**AI Error Prevention:** The rules template includes quantified AI mistake frequencies (e.g., 78% synchronous DB queries, 64% unthrottled PlayerMoveEvent) to help the AI self-audit.

### Graphify Builds Must Stay AST-Only (0 tokens)
The Graphify build command is `graphify update . --force` (the no-LLM path) and **unsets** `GEMINI_API_KEY`/`GOOGLE_API_KEY` first. Never set those keys in the server environment and never switch to `graphify extract` — either would trigger a paid LLM semantic pass. Code-only plugin projects skip the LLM pass automatically. Empty projects (no `.java`/`.kt`) make `graphify update` exit non-zero ("No code files found") → status `failed`; this is expected and does not retry-loop.

### Graphify Viewer Needs the unpkg CDN (CSP)
`graph.html` loads the `vis-network` library from `https://unpkg.com`. The `GET /api/projects/:id/graphify/graph.html` route **must** send a CSP that allows `https://unpkg.com` in `script-src`/`style-src`/`font-src`, or the graph renders blank. The viewer is embedded via a `sandbox="allow-scripts"` iframe (graph data is inline, no fetch needed).

### aurora-sandbox Is Not Currently Wired
See Architecture → AI Agent Sandbox. The wrapper is declared but not passed to the OpenCode spawn, so editing it does **not** change runtime behavior. Don't rely on it for command gating.

### Multi-Key Requires the Legacy Unique Index Dropped
There was a `UNIQUE(user_id, provider)` index on `provider_api_keys` (migration 0012) that blocks a second key per provider. Migration `0021_api_key_routing.sql` **drops it** (`DROP INDEX IF EXISTS idx_provider_api_keys_user_provider`) so paid providers can hold multiple keys. If adding a 2nd key fails with `duplicate key value violates unique constraint "idx_provider_api_keys_user_provider"`, 0021 wasn't applied — apply it via `psql -1 -f`. Single-key-per-user for **free** providers is now enforced in the admin route (`admin.ts`), not the DB.

### Drizzle Migration Tracking Drift
`drizzle.__drizzle_migrations` tracks applied migrations by `created_at`; the migrator decides what to run from `MAX(created_at)`. On this deployment some migrations were applied manually via `psql`, so the tracking lagged behind the real schema and `pnpm db:migrate` could try to re-run them and fail with "already exists". All recent migrations (AI Runtime `0019`/`0020`/`0021`, Graphify `0017`) are written **idempotent** (`DO $$ … duplicate_object`, `ADD COLUMN IF NOT EXISTS`, `DROP INDEX IF EXISTS`, `INSERT … ON CONFLICT DO NOTHING`); when tracking is drifted, apply via `psql -1 -f` and backfill tracking rows manually (hash = `sha256sum` of the file, `created_at` = the `when` in `_journal.json`). Fresh databases are unaffected. (See README Step 12.)

## Deployment Notes

- **Server must run as root** or have passwordless sudo for `adduser`, `userdel`, `chmod`, `chown`, `runuser` (required for per-user isolation)
- **PostgreSQL must start before PM2** — `auroracraft.sh start` handles this automatically
- **Shared caches must be initialized** before first user registration (see README Step 15):
  - `/var/lib/opencode/shared` (777 permissions)
  - `/var/lib/gradle/shared` (777 permissions)
  - `/var/lib/maven/shared` (777 permissions)
- **Isolated config base directory** must exist: `mkdir -p /var/lib/auroracraft/configs && chmod 711 /var/lib/auroracraft/configs`
- **OpenCode cleanup requires sqlite3** — used to delete conversation history when projects are deleted
- **Java, Maven, Gradle must be installed** for plugin compilation (supports Java 8/11/17/21/25)
- **CodeRabbit CLI is optional** but required for code review feature (installed at `/usr/local/bin/coderabbit`)
- **LiteLLM is required for ALL paid providers** (installed at `/var/lib/litellm/shared/venv/bin/litellm`; needs `httpx` in that venv for the real-time meter). Without it, paid-model messages fail; free Zen models still work. See README Step 15.7.
- **Graphify is optional** but required for the "Save tokens using Graphify" feature (shared Python venv at `/var/lib/graphify/shared/venv`, symlinked to `/usr/local/bin/graphify`; needs `python3-venv`). See README Step 15.6. If absent, enabling Graphify just sets status `failed` — everything else works.
- **Knowledge base must be present** at `/root/AuroraCraft/opencode-knowledge/` (ships with source code, no manual setup needed)

## Testing Changes

When modifying backend code:
1. Make changes
2. `pnpm --filter server build`
3. `./auroracraft.sh restart`
4. Check logs: `pm2 logs auroracraft-server --lines 50`
5. Test the affected endpoint via the UI or `curl`

When modifying frontend code:
1. Make changes
2. `pnpm --filter client build`
3. `./auroracraft.sh restart` (backend serves the static files)
4. Hard refresh browser (Ctrl+Shift+R) to clear cache

When modifying database schema:
1. Edit schema files in `server/src/db/schema/`
2. `pnpm db:generate` — creates migration SQL
3. Review the generated SQL in `server/drizzle/`
4. `pnpm db:migrate` — applies migration
5. Restart server

## Supported Platforms

AuroraCraft supports **18 Minecraft server platforms** across 4 categories:

**Game Servers:** Paper, Purpur, Pufferfish, Folia, Spigot, Leaf, Leaves, DivineMC, Pluto, ASPaper

**Hybrid Servers (Mods + Plugins):** Mohist, Arclight, Magma, Youer

**Proxy Servers:** Velocity, BungeeCord, Waterfall, Velocity-CTD

Each platform gets tailored API rules, threading models, and build configurations via the dynamic rules system.

## graphify Integration

> **Scope:** this section is the **dev-tooling** graphify that Claude Code uses to navigate *this* repository's own code while you work on it. It is unrelated to the end-user **product feature** "Save tokens using Graphify" (documented under Architecture → Graphify Token Savings), which builds graphs for AuroraCraft users' plugin projects.

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

**Rules:**
- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists
- Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost)
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context
