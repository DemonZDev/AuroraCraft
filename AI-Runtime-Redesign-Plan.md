# AI Runtime Redesign — Implementation Plan

Full control over **AI Providers**, **AI Models**, and **MCPs** from the Admin panel.
Replaces the hardcoded `config/ai-models.ts` + `config/nim-models.ts` + Firecrawl-only MCP.

**Decisions locked:** Clean-slate (new tables start empty) · Zen kept as a built-in free provider (seeded).

---

## 1. Database (new migration `0019`, idempotent, non-destructive)

### `ai_providers`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(100) | admin label, e.g. "Fireworks AI" |
| slug | varchar(60) unique | auto-derived machine id used in configs/keys |
| base_url | text | OpenAI-compatible endpoint ('' for built-in Zen) |
| kind | enum `ai_provider_kind` (`openai_compatible`\|`zen`) | |
| is_free | boolean | free → models cost 0 tokens; no per-user paid gate |
| is_active | boolean | inactive ⇒ all its models hidden from every selector |
| is_builtin | boolean | Zen: cannot delete or edit endpoint |

### `ai_models`
| col | type | notes |
|---|---|---|
| id | uuid PK | client sends this id to pick a model |
| provider_id | uuid FK → ai_providers ON DELETE CASCADE | |
| show_name | varchar(100) | "GLM-5.1" |
| real_name | varchar(200) | upstream id, e.g. `accounts/fireworks/models/glm-5p1` |
| description | text | |
| usages | text[] | any of `agent`, `prompt_enhancer`, `error_prompt_maker` |
| type_tag | varchar(40) | "fast"/"slow"/… (discriminates same show_name across providers) |
| weight | integer | smaller = higher in selector |
| input_per_1m / output_per_1m / cached_input_per_1m | double precision | only meaningful when provider is paid |
| is_active | boolean | |

**Validation rule:** within the same (`show_name`, usage), `type_tag` must be unique **and** `weight` must be unique. Enforced in the route (load siblings, compare in JS).

### `mcps`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(100) | admin label only |
| config | text | raw OpenCode MCP JSON |
| api_type | enum `mcp_api_type` (`non_api`\|`api`) | |
| is_active | boolean | |

`api` ⇒ config contains literal `MCP-API-Key`, replaced per-user at registration.

### `provider_api_keys` (additive ALTER)
- add `provider_id` uuid FK → ai_providers ON DELETE CASCADE (nullable)
- add `mcp_id` uuid FK → mcps ON DELETE CASCADE (nullable)
- `provider` varchar → DROP NOT NULL (legacy rows preserved; new rows use FKs)

### Seed (in migration)
Built-in Zen provider (`slug=opencode`, kind `zen`, free, builtin) + its 2 agent models
(DeepSeek V4 Flash, Nemotron 3 Super). `ON CONFLICT DO NOTHING` so it's safe to re-run.

---

## 2. Backend service — `server/src/utils/ai-runtime.ts` (new)
Single source of truth that loads from DB and replaces hardcoded config:
- `listModelsForUsage(usage, tier)` — active model+provider, tier-gated (free users → free providers only), ordered by weight
- `resolveModel(id)` → `{ model, provider, pricing }`
- `getUserProviderKeyMap(userId)` (slug→key) · `getUserMcpKeyMap(userId)` (mcpId→key)
- `pricingFromModel(row)` → reuses `calculateTokenCost` / `TOKEN_MULTIPLIER` (kept in `config/ai-models.ts`)
- Zen special-case (auth.json, `opencode/` id, optional per-user key)

`token-service.ts`, `litellm-config.ts`, `provider-config.ts` switch from `AIModelDef` to DB rows.

## 3. Admin routes — `server/src/routes/admin.ts`
CRUD (create/edit/enable/disable/delete) for **providers**, **models** (with the dup tag/weight check),
**mcps**. Delete provider → cascade models + all users' keys for it. Rework per-user keys:
- `GET …/keys` returns two groups: **AI providers** (every provider, key masked or empty) and **MCPs** (api-type only)
- set/edit/remove by `provider_id` or `mcp_id`; key never returned in full (first 8 + last 4 only)
- paid provider key requires paid user; demotion blocked if user holds any paid-provider key

## 4. Wire execution paths
- `agents.ts` — resolve model+provider from DB by id; LiteLLM for paid non-Zen
- `litellm-config.ts` / `provider-config.ts` — build from DB rows + provider.base_url
- `bridges/opencode.ts` — register **all active MCPs** (sub `MCP-API-Key` from user key for `api` MCPs), not just Firecrawl
- `nim.ts` / `nim-engine.ts` / `nim-client.ts` — enhancer & error-maker models from DB (`usage`), base_url + per-user key per model (any provider, not just NVIDIA)
- `/api/ai/models` + `/api/nim/models` served from DB

## 5. Frontend
- `admin/ai-runtime.tsx` — Providers / Models / MCPs management sections
- `admin/users.tsx` — per-user keys split into **AI Model Providers** + **MCPs**
- `workspace.tsx` agent selector, prompt-enhancer modal, error-maker modal — fetch lists from API, tag-driven
- remove dead `admin/provider-keys.tsx` + static `AI_MODELS` in `types/index.ts`

---

## Sequencing & safety
Build order = tasks 1→6. After each backend phase: `pnpm --filter server build`. After frontend: `pnpm --filter client build`.
**I will not apply the migration or restart PM2** — schema files + idempotent SQL are written and built; you apply `pnpm db:migrate` (or `psql -1 -f`) + `./auroracraft.sh restart` when ready. New tables are additive; existing data untouched (old per-user keys become orphaned until re-added, per clean-slate).
