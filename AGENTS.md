# AGENTS.md

This file provides guidance to OpenCode when working with the AuroraCraft codebase.

## Language Policy
**Always respond in English.** No other languages in responses, file contents, code
comments, or any output. If the user writes in another language, acknowledge briefly
in English but respond entirely in English.

## OpenCode Mode Usage
- **Plan mode** (Tab to switch): architecture decisions, reviewing strategy,
  understanding the codebase, debugging without making changes. Use this first.
- **Build mode**: actual code changes, file edits, implementations.
- Always start in Plan for complex tasks → confirm approach → switch to Build.

## Response Quality Standards
1. Be concise but thorough. Avoid preamble. Get to the point.
2. Use tools to act, not just explain. When asked for a change, make it.
3. Prefer parallel tool calls for independent operations.
4. Show git diff on changes.
5. No summaries for trivial tasks — just do it and report done.
6. Ask for clarification when a request has multiple valid interpretations.

## Code & File Standards
1. Write clean, maintainable code. Follow existing project style and conventions.
2. Never hardcode API keys, tokens, or passwords.
3. Prefer editing existing files over creating new ones.
4. Verify before claiming success — run tests, check output, read the file.
5. Use absolute paths in tool calls.

## Git Policy
1. Never run git commit, push, reset, or rebase unless explicitly asked.
2. Always ask for confirmation before any git mutation.
3. Stage only intended files. Check `git status` and `git diff` first.

## Error Handling
- Report exact errors. Do not silently retry or obfuscate failures.
- When unsure how to proceed, stop and ask.

---

## Project Overview

AuroraCraft is an AI-powered Minecraft plugin development platform. Users describe
what they want and an AI agent (OpenCode) writes the plugin code. Supports Java &
Kotlin, Maven & Gradle, and 18 Minecraft server platforms (Paper, Purpur, Spigot,
Folia, hybrid servers, proxies, etc.).

**Tech Stack:** React 19 + Vite 7 frontend, Fastify 5 + Drizzle ORM + PostgreSQL
backend, OpenCode AI agent bridge, PM2 process management, TypeScript strict throughout.

**AI runtime is DB-driven, not hardcoded.** Providers, models, MCPs live in the DB
(`ai_providers` / `ai_models` / `mcps`, migrations 0019–0021, 0024). Managed at runtime from
Admin Panel → AI Runtime. No hardcoded model list. Source of truth:
`server/src/utils/ai-runtime.ts`. Pricing math only in `server/src/config/pricing.ts`.
Paid providers route through a per-project LiteLLM proxy with multi-key routing +
real-time per-call billing. Built-in seeded providers: OpenCode Zen (free, 2 models),
OpenRouter (paid), NVIDIA NIM (free), Fireworks AI (paid), Google AI Studio (paid) —
every built-in's free⇄paid is admin-editable at runtime except Zen, which stays free.
Built-ins other than Zen seed with no models; admins add models from the UI.

---

## Development Commands

### Workspace Structure
pnpm workspace with two packages: `client/` (frontend) and `server/` (backend).

```bash
pnpm install                   # Install all deps from root
pnpm dev                       # Both client + server in watch mode
pnpm --filter client dev       # Client only (Vite, port 5173)
pnpm --filter server dev       # Server only (tsx watch, port 3000)
pnpm build                     # Build both
pnpm --filter client build     # Client only → client/dist/
pnpm --filter server build     # Server only → server/dist/
pnpm db:generate               # Generate Drizzle migration from schema changes
pnpm db:migrate                # Run pending migrations
pnpm db:seed                   # Seed admin user + create Linux user
pnpm --filter client lint      # ESLint on client
```

### Production Management
```bash
./auroracraft.sh               # Interactive menu
./auroracraft.sh start         # Start PostgreSQL + PM2
./auroracraft.sh restart       # Full restart (loads latest code)
./auroracraft.sh stop          # Stop everything
./auroracraft.sh web           # Status, URLs, health check, logs
pm2 logs auroracraft-server --lines 50
```

### Testing a Change
```
1. Make changes
2. pnpm build  (or --filter client/server)
3. ./auroracraft.sh restart
4. pm2 logs auroracraft-server --lines 50
5. Test via UI or curl
```

---

## Architecture

### Per-User Isolation
Every registered user gets a Linux system user (`auroracraft-{username}`) with their
own home directory. OpenCode runs as that user via `runuser`, so users cannot access
each other's files or processes.

Key files:
- `server/src/db/seed.ts` — Creates DB + Linux user
- `server/src/routes/auth.ts` — Registration calls `adduser` via sudo
- `server/src/bridges/opencode-process-manager.ts` — Spawns OpenCode as user

### OpenCode Instance Lifecycle
Each AI message spawns a fresh OpenCode instance on a dynamic port (9000–9999).
Idle timeout: 120s → SIGTERM → SIGKILL → port released.

Flow:
1. Message received → allocate port
2. `runuser -l auroracraft-{user} -- opencode serve --port {port}`
3. Health check `/session` endpoint
4. Stream response via SSE
5. Idle timeout → kill → release port

Key files:
- `server/src/bridges/opencode-process-manager.ts` — spawning, ports, lifecycle
- `server/src/bridges/opencode.ts` — SSE streaming, thinking tag extraction
- `server/src/routes/agents.ts` — `/api/agents/:sessionId/message`

### AI Runtime (DB-Managed)
**Providers, models, MCPs are DB-managed — never hardcoded.**

Tables (migrations 0019–0021):
- `ai_providers`: slug, base_url, kind (openai_compatible|zen), is_free, is_active, is_builtin
- `ai_models`: provider_id FK, show_name, real_name, usages jsonb, type_tag, weight, 3-tier per-1M pricing (uncached `input_per_1m` / `cached_input_per_1m` / `output_per_1m`)
- `mcps`: name, raw OpenCode MCP config, api_type (non_api|api)

Rules: free provider → 0 cost, one key per user. Paid → multiple keys per user allowed.
Built-ins (Zen/OpenRouter/NVIDIA NIM/Fireworks AI/Google AI Studio) can't be deleted or have
endpoint edited, but their free/paid mode IS admin-editable — except Zen (always free;
bypasses LiteLLM, no billing meter). Gate is `kind !== 'zen'`, not `is_builtin`. Paid→free
prunes extra per-user keys. Pricing is 3-tier: cached input falls back to the uncached input
rate when unset (a provider reporting `cached_tokens` is never billed $0 for them).

### API Key Isolation (Per-Project)
Keys are **never** stored in the workspace tree.

1. Workspace `opencode.json`: minimal stub only (`$schema`, `permission`, `tools`, `model`)
2. Real config written to: `/var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/opencode.json` (600 perms)
3. OpenCode spawned with `HOME=/var/lib/auroracraft/configs/{user}/{linkId}`
4. Each project gets its own isolated HOME

Special case — Zen: keys written to `~/.local/share/opencode/auth.json`.
Zen models use `opencode/{model_id}` format. Never go through LiteLLM.

Key files:
- `server/src/utils/provider-config.ts` — generates isolated config files
- `server/src/bridges/opencode-process-manager.ts` — sets HOME before spawn

### API Key Routing & Real-Time Billing
Paid providers: multiple keys per user, routed by weight, billed per call in real time.

Each key has: `weight` (lower = higher priority), `limit_usd` (null = unlimited),
`used_usd`, `exhausted_at`, `is_active`. On budget exhaustion → key auto-disabled.
No usable key → 503 before spend.

Real-time dual-ledger: Python meter (`aurora_litellm_callback.py`) fires after every
call, POSTs to `POST /internal/litellm/usage`. Debits both user token balance and
key's `used_usd`. Commission: ×1.2, $1 = 1000 tokens (ceiling).

Key files:
- `server/src/utils/ai-runtime.ts` — routed-key resolvers
- `server/src/utils/token-service.ts` — `chargeRealtimeUsage` (atomic dual deduct)
- `server/src/utils/litellm-config.ts` — multi-deployment config + embedded meter
- `server/src/routes/internal.ts` — `POST /internal/litellm/usage`

### LiteLLM Integration
Proxies all paid (non-Zen) providers. Handles `/responses`→`/chat/completions`
translation, multi-key routing, and real-time billing meter. The per-project config is
scoped to the **selected model only** — cold start scales with deployment count (~10s for
a few, ~40–55s for dozens), so scoping keeps the first agent message fast. Proxy spawned
without `--detailed_debug` and with `LITELLM_LOCAL_MODEL_COST_MAP=True` (skips a ~40s
model-cost-map fetch). The meter strips OpenAI-only fields (`promptCacheKey`,
`safetyIdentifier`) that generic providers 400 on.

**CRITICAL: Never write `mcpServers` into `opencode.json`** — schema rejects it.
Register MCPs via HTTP API after instance starts.

Key files:
- `server/src/bridges/litellm-process-manager.ts` — lifecycle, config-hash reload
- `server/src/utils/litellm-config.ts` — config gen + embedded Python meter
- `server/src/routes/agents.ts` — starts LiteLLM before OpenCode for paid models

### MCP Servers (DB-Managed)
`non_api` MCPs run for everyone. `api` MCPs need per-user key; `MCP-API-Key`
placeholder substituted at runtime (`server/src/utils/mcp-runtime.ts`).
Registered on OpenCode instance via HTTP API (`server/src/utils/opencode-mcp.ts`).

### Dynamic Rules & Skills System
Every AuroraCraft project gets a custom `AGENTS.md` + 8 skill files auto-generated
based on platform, compiler, and language.

How it works:
1. User sends first message → backend reads project config
2. Loads `TEMPLATE_BASE.md` + fragments from `opencode-knowledge/rules/fragments/`
3. Replaces {SOFTWARE}, {COMPILER}, {LANGUAGE}, {API_RULES}, {BUILD_RULES}
4. Writes to: `/var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/`
5. OpenCode auto-discovers via HOME directory

Key file: `server/src/utils/opencode-knowledge.ts`

Knowledge base structure:
```
opencode-knowledge/
├── rules/
│   ├── TEMPLATE_BASE.md
│   └── fragments/
│       ├── paper-api.md
│       ├── folia-api.md
│       ├── spigot-api.md
│       ├── purpur-api.md
│       ├── velocity-api.md
│       ├── bungeecord-api.md
│       ├── maven-build.md
│       ├── gradle-build.md
│       ├── java-rules.md
│       └── kotlin-rules.md
└── skills/
    ├── database-setup/
    ├── event-handling/
    ├── command-framework/
    ├── config-management/
    ├── async-operations/
    ├── gui-inventory/
    ├── scheduler-tasks/
    └── paper-components/
```

### Thinking Tag Parsing
Some models (DeepSeek via Fireworks/Bluesminds) emit reasoning as plain text.
Bridge parses three formats: `<thinking>`, `<reasoning>`, `<think>`.
Key file: `server/src/bridges/opencode.ts` — `parseThinkingTags()`

### Model Selection Persistence
Workspace remembers chosen model per project in localStorage under
`auroracraft:model:{projectId}`. Validated on page load against the available model list (`GET /api/ai/models`).
Key file: `client/src/pages/workspace.tsx`

### Graphify Token Savings (Product Feature — Paid Only)
End-user feature: paid users build a knowledge graph of their plugin project.
Build command: `cd <workspace> && rm -rf graphify-out && graphify update . --force`
Never use `graphify extract` (triggers paid LLM pass).
GEMINI_API_KEY / GOOGLE_API_KEY must NEVER be set in server env.
Key file: `server/src/utils/graphify-service.ts`

### Shared Caches
| Cache | Location | Per-User Symlink |
|---|---|---|
| OpenCode plugins | /var/lib/opencode/shared/node_modules | ~/.config/opencode/shared/node_modules |
| Gradle deps | /var/lib/gradle/shared | ~/.gradle/caches |
| Maven artifacts | /var/lib/maven/shared | ~/.m2/repository |
| Graphify venv | /var/lib/graphify/shared/venv | /usr/local/bin/graphify |

**Shared caches are `777` + builds run under `umask 0000`.** Each user runs as its own UID, so a shared Maven/Gradle cache only works if every entry is world-writable. `initializeSharedCaches()` does `chmod -R 777` on startup (repairing stale `755` dirs an earlier user created) and the OpenCode spawn is prefixed `umask 0000` so new `mvn`/`gradle` cache dirs stay world-writable. Without both, the 2nd user to build hits `cannot write to /var/lib/maven/shared/repository/<artifact>` (same for `/var/lib/gradle/shared/caches`). Never lower these to `755`.

### graphify (Dev Tooling — For THIS Repo)
> Different from the end-user Graphify product feature.

When user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` first.
- `graphify query "<question>"` for codebase questions
- `graphify path "<A>" "<B>"` for relationships
- `graphify explain "<concept>"` for concepts
- `graphify update .` after modifying code (AST-only, 0 tokens)

---

## Key Patterns

### Database Schema
- `server/src/db/schema/users.ts` — accounts, roles, token balances
- `server/src/db/schema/projects.ts` — metadata, software type, language, compiler, graphify state
- `server/src/db/schema/agent-sessions.ts` — OpenCode session tracking
- `server/src/db/schema/agent-messages.ts` — chat history, parts (text/thinking/tool)
- `server/src/db/schema/ai-providers.ts`, `ai-models.ts`, `mcps.ts` — DB-driven AI runtime
- `server/src/db/schema/provider-api-keys.ts` — per-user secrets, multi-key routing fields

### Frontend State
- `client/src/stores/auth-store.ts` — Zustand auth store
- `client/src/hooks/use-projects.ts` — TanStack Query project CRUD
- `client/src/hooks/use-agent.ts` — SSE streaming, message sending
- `client/src/hooks/use-admin.ts` — admin panel data
- `client/src/hooks/use-ai-admin.ts` — providers/models/MCPs CRUD
- `client/src/hooks/use-graphify.ts` — graphify enable/remove/status

### API Routes
- `server/src/routes/auth.ts` — login, register, logout, GitHub OAuth
- `server/src/routes/projects.ts` — CRUD, file tree, download, fork
- `server/src/routes/agents.ts` — create session, send message (SSE), stop
- `server/src/routes/admin.ts` — user management, token grants, multi-key CRUD
- `server/src/routes/ai-admin.ts` — provider/model/MCP CRUD
- `server/src/routes/internal.ts` — POST /internal/litellm/usage (machine-to-machine)
- `server/src/routes/graphify.ts` — enable/remove/status + graph.html viewer
- `server/src/routes/coderabbit.ts` — admin browser-OAuth login (initiate/complete/revoke) + per-project code review

---

## Common Gotchas

### OpenCode Global Accessibility
Must be at `/usr/local/bin/opencode`. A binary inside `/root/.nvm/` or
`/root/.local/share/pnpm/` is inaccessible to `auroracraft-{username}` users.

### MCP Config Validation
Never write `mcpServers` into `opencode.json` — OpenCode schema rejects it with
`ConfigInvalidError: Unrecognized key: mcpServers`. Register via HTTP API after start.

### Zen Model ID Format
Always `opencode/model-id` (e.g. `opencode/deepseek-v4-flash-free`).
Never `opencode/opencode/` or `zen/` prefixes.

### CodeRabbit Login Is Browser-OAuth, Not API Key
Admin grants CodeRabbit per user via `coderabbit auth login --agent` driven inside **tmux**
(`server/src/routes/coderabbit.ts`); never `--api-key`. Parse the line-delimited JSON stream.
Give the admin the `fallbackAuthUrl` (`coderabbit-cli://auth-callback`) — `authUrl`'s
`http://127.0.0.1:<port>/callback` localhost server is unreachable from a remote browser.
The CLI **exits right after** processing the pasted callback, so capture the stream with
`tmux pipe-pane` to a logfile (not `capture-pane`, which fails once the pane is gone). Submit
the pasted token/callback with `send-keys -l` via `execFile` (literal, no shell). Truth check:
`coderabbit auth status --agent` → `{"authenticated":true}`. No keyring needed — file fallback
at `~/.coderabbit/auth.json` (chown to the user so `runuser` reviews can read it). Requires tmux.

### TypeScript Build Errors
`server/tsconfig.json` uses `noEmitOnError: false` — do NOT change this.

### PM2 Script Path
`ecosystem.config.cjs` must point to the direct `.mjs` tsx entry point.
If backend fails to start, verify the `script` field matches installed tsx version.

### Multi-Key Unique Index
Migration `0021_api_key_routing.sql` drops the `UNIQUE(user_id, provider)` index.
If adding a 2nd key fails with duplicate constraint, 0021 wasn't applied.

### Drizzle Migration Tracking Drift
Recent migrations (0017, 0019–0021) are idempotent. If tracking drifted, apply via
`psql -1 -f` and backfill tracking rows manually.

### Graphify Build Must Stay AST-Only
Build command: `graphify update . --force` (no-LLM path).
Never use `graphify extract`. Never set GEMINI_API_KEY or GOOGLE_API_KEY in server env.

### aurora-sandbox Not Currently Wired
Wrapper declared but not passed to OpenCode spawn. Do not rely on it for command gating.
Feature-level gating is done by skill presence, not the sandbox.

### OpenAI-Compatible Providers — Coverage & Upstream Limits
All 3 surfaces work with any OpenAI-compatible provider (Agent via LiteLLM; Prompt Enhancer +
Error Prompt Maker via direct `/chat/completions` in `chat-completions-client.ts`). Upstream
limits found in testing (NOT AuroraCraft bugs):
- **Google AI Studio**: base `…/v1beta/openai`, real names **without** the `models/` prefix
  (e.g. `gemini-3.5-flash`); free `AQ.` keys are 429-quota-limited under load.
- **Groq** free tier = 8000 TPM (counts `max_tokens`): works for the prompt tools, but 429s
  the Agent (big system prompt). Needs a higher Groq tier for agent use.
- **Gemini 3.x preview** (incl. via Bluesminds, which proxies Google) is capacity-flaky
  (503/504) — `gemini-2.5-flash` is a reliable fallback.

### Token Caps
Prompt tools: `ENHANCE_MAX_TOKENS=4096`, `FIX_MAX_TOKENS=6000` (`prompt-tools-engine.ts`) —
under low TPM ceilings. Agent: `calculateMaxOutputTokens()` clamped to
`MAX_AGENT_OUTPUT_TOKENS=32768` (`token-service.ts`) — the balance-derived value could
otherwise balloon to tens of millions and break TPM-limited providers.

---

## Deployment Notes

- Server must run as root (adduser, userdel, chmod, chown, runuser)
- PostgreSQL must start before PM2 — auroracraft.sh handles this
- Shared caches before first registration (all 777):
  - /var/lib/opencode/shared
  - /var/lib/gradle/shared
  - /var/lib/maven/shared
- Isolated config base: `mkdir -p /var/lib/auroracraft/configs && chmod 711`
- OpenCode cleanup requires sqlite3 (conversation history deletion)
- Java, Maven, Gradle must be installed (supports Java 8/11/17/21/25)
- LiteLLM required for paid providers: /var/lib/litellm/shared/venv/bin/litellm
  (needs httpx in that venv for real-time meter)
- Graphify optional: /var/lib/graphify/shared/venv, python3-venv required
- Knowledge base must be present: /root/AuroraCraft/opencode-knowledge/

---

## UI Generation — OpenDesign Skills

The `linear-app` design system is **auto-loaded** via `opencode.json` instructions.
It is always in context — do not re-read it unless verifying a specific token.

100+ additional design systems available in `./design-systems/` including:
`claude`, `cursor`, `notion`, `figma`, `shadcn`, `vercel`, `stripe`, `openai`,
`github`, `discord`, `shopify`, `figma`, `framer`, `linear-app`, and many more.
To use a specific one: read `./design-systems/{name}/DESIGN.md`

### CRITICAL: Before ANY UI work — load the skill first

Use the `skill` tool BEFORE writing any component, page, or design.
Do NOT write UI without loading the relevant skill first.

| Task | Skill to load |
|---|---|
| Landing page, hero, pricing | `saas-landing` |
| Admin panel, dashboards, stats | `dashboard` |
| Mobile screens, bottom nav | `mobile-app` |
| Web app, SPA, prototype | `web-prototype` |
| Slide deck, presentation | `deck` |
| Pricing page | `pricing-page` |
| Poster, hero image | `poster-hero` |
| Gamified UI | `gamified-app` |

### UI Rules (enforced — no exceptions)
- No generic Bootstrap, MUI, or default-styled shadcn output
- No lorem ipsum — real content, real data shapes
- Production-ready code, mobile responsive always
- Senior dev quality: pixel-precise, real interactions, real states
- Follow the loaded design system strictly
- Loading, error, and empty states must be implemented
