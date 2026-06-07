# API Key Routing & Real-Time Billing for Paid Models

> **Audience:** any engineer or AI agent that will implement this feature.
> **Status:** specification / high-level design. No code has been written yet.
> **Scope:** how AuroraCraft routes a user's message across *multiple* admin-managed
> API keys per provider, and how it bills tokens **in real time, per upstream call**
> instead of the current estimate-then-reconcile model.
>
> This document describes **what** we want and **how** it should work end to end.
> It is grounded in the current codebase so the implementer can map every concept
> to a concrete file. Where a requirement does not map cleanly onto an existing
> capability, that gap is called out honestly in **§13 Open Decisions & Caveats**.

---

## 1. TL;DR

Today each user has **one** API key per provider, and AuroraCraft **estimates** a
message's cost up front, **pre-charges** the user, runs the agent, then **reconciles**
(refund or top-up) once at the end.

We are changing two things:

1. **Multi-key routing.** An admin can attach **many** keys to a single
   (user, provider) pair. Each key has a **weight** (priority), a **dollar limit**
   (how much provider credit it may spend), and an **enabled** flag. When the user
   talks to the AI, the keys form a **primary → fallback chain** ordered by weight.
   The chain retries, falls back, decrements limits live, auto-disables exhausted
   keys, and circuit-breaks after repeated total failure.

2. **Real-time, per-call billing.** We stop estimating. Instead, **after every
   single upstream LLM call**, we read the *actual* token usage and charge two
   independent budgets at once:
   - the **user's AuroraCraft token balance** (with the 20% platform commission), and
   - the **serving key's dollar limit** (at the *raw* provider price, no commission).

   If the user's balance hits zero mid-run, the AI is **stopped immediately**.

The same real-time billing is extended to the **Prompt Enhancer** and **Error
Prompt Maker**, which are free today and must become billable.

---

## 2. How AuroraCraft works today (the starting point)

Read this section to understand what we are changing. File references are
`path:line` and are clickable.

### 2.1 One key per provider
- Keys live in `provider_api_keys` (`server/src/db/schema/provider-api-keys.ts:11`).
  A row links a `userId` to a `providerId` and stores the secret `apiKey` plus an
  `isActive` flag. There is **no DB uniqueness constraint** on (userId, providerId);
  single-key-per-provider is enforced only in the admin route, which does
  *find-existing-then-update, else insert* (`server/src/routes/admin.ts:339`).
- `getUserProviderKeyMap(userId)` returns a flat `slug → apiKey` map
  (`server/src/utils/ai-runtime.ts:147`) — it assumes exactly one key per provider.

### 2.2 LiteLLM is the routing proxy
- For every **non-Zen** (OpenAI-compatible) provider, the agent message path starts
  a per-project **LiteLLM** proxy (`server/src/bridges/litellm-process-manager.ts`)
  and points OpenCode at it. Only the built-in **Zen** provider talks to OpenCode
  natively (`server/src/routes/agents.ts:426-468`).
- The LiteLLM config is generated per project in
  `generateLiteLLMConfig()` (`server/src/utils/litellm-config.ts:63`). It emits one
  `model_list` entry per model, keyed by the AuroraCraft model **uuid**, carrying the
  single key and the model's **per-token pricing** in `model_info`
  (`server/src/utils/litellm-config.ts:104`). A token→USD `max_budget` is set as a
  coarse safety net (`server/src/utils/litellm-config.ts:113`).
- The LiteLLM process is spawned with a stripped environment
  (`server/src/bridges/litellm-process-manager.ts:177-196`); we control its
  command line, config file, and env vars.

### 2.3 The current billing cycle (estimate → pre-charge → reconcile)
1. **Estimate.** On message receipt, `estimateMessageCost()` guesses input/output
   tokens from text length (`chars/4`) and applies pricing
   (`server/src/utils/token-service.ts:117`, `:40`).
2. **Pre-charge.** The estimate is deducted up front via `deductTokens()`
   (`server/src/routes/agents.ts:408`). A `maxOutputTokens` cap is computed from the
   remaining balance (`server/src/utils/token-service.ts:127`) and passed to OpenCode
   (`server/src/bridges/opencode.ts:867` `sendPromptAsync`).
3. **Reconcile (once).** After the *entire* OpenCode run, the executor measures the
   final assistant text with the same `chars/4` heuristic and calls
   `reconcileTokens()` to refund the overcharge or bill up to 2× the estimate
   (`server/src/agents/executor.ts:124-150`, `server/src/utils/token-service.ts:174`).

**Key limitation we are fixing:** the agent makes **many** upstream LLM calls during
one run (one per reasoning/tool step), but billing only ever looks at the **final
text once**, using a crude `chars/4` heuristic. There is no per-call accounting, no
notion of *which key paid*, and no way to stop mid-run when money runs out.

### 2.4 Prompt Enhancer & Error Prompt Maker (currently free)
- These call the provider's `/chat/completions` **directly** (not through LiteLLM)
  via `nimChat()` (`server/src/bridges/nim-client.ts:47`), orchestrated by
  `nim-engine.ts`. They resolve a **single** key
  (`resolveNimTarget` → `getUserProviderKeyMap`, `server/src/routes/nim.ts:38`).
- `nimChat` today **ignores** the `usage` object the provider returns
  (`server/src/bridges/nim-client.ts:91-103`) and **no tokens are charged**.

### 2.5 Pricing math (reused unchanged)
- `$1 = 1000 tokens` (`TOKENS_PER_USD`) with a `1.2×` commission
  (`TOKEN_MULTIPLIER`) in `server/src/config/ai-models.ts:16`.
- `calculateTokenCost(input, output, pricing, cached)` →
  `(inputCost + cachedCost + outputCost) × 1.2 × 1000`, rounded up to whole tokens
  (`server/src/config/ai-models.ts:23`). This already encodes the user-facing price.

---

## 3. What we are building (the three pillars)

### Pillar A — Multi-key routing per (user, provider)
**Paid providers only.** Admins attach multiple keys to a paid provider for a user.
Each key carries **weight**, **dollar limit**, **enabled**. At request time the enabled
keys form a strict priority chain (lowest weight = highest rank = primary; the rest are
fallbacks in weight order). The chain **retries**, **falls back**, and **circuit-breaks**.
Free providers are limited to **one key per user** and skip the chain entirely (§6.3).

### Pillar B — Real-time, per-call, dual-budget billing
No up-front estimate. After **each** upstream call we read the **real** usage and:
- charge the **user** in AuroraCraft tokens **with** commission, and
- charge the **serving key** in provider dollars **without** commission.

If the user's balance reaches zero mid-run, **kill the run immediately**.

### Pillar C — Bill the Prompt Enhancer & Error Prompt Maker
Apply the same per-call dual-budget billing (and the same key routing) to these two
features, which are free today.

---

## 4. The worked example (made precise)

This is the user's scenario, annotated so both budgets are explicit.

**Setup**
- A user buys **9000 AuroraCraft tokens** ( = **$9** of AuroraCraft credit).
- The admin holds **4 provider keys** with real provider credit of **$2 / $3 / $2 / $6**.
- The provider degrades a key to "slow as hell" once its remaining credit drops to
  **$1**, so the admin allots each key a **limit** that stops short of that floor.
- The admin attaches all four to this user, for this provider:

  | Key | Provider credit | **Limit (allotted $)** | **Weight** | Enabled |
  |-----|-----------------|------------------------|------------|---------|
  | #1  | $2              | **$1**                 | **4**      | ✓       |
  | #2  | $3              | **$2**                 | **2**      | ✓       |
  | #3  | $2              | **$1**                 | **3**      | ✓       |
  | #4  | $6              | **$5**                 | **1**      | ✓       |

**Resulting chain** (sorted by weight ascending):
`#4 ($5)  →  #2 ($2)  →  #3 ($1)  →  #1 ($1)`

- **#4 is primary** (weight 1). #2, #3, #1 are fallbacks in that order.

**What happens as the user messages the AI**

1. **No up-front charge.** LiteLLM starts. Nothing is deducted from the user balance
   or any key yet.
2. **Per-call metering.** Each upstream call's real usage is measured the moment it
   completes. Suppose the first message's underlying calls total **$1.2 of provider
   cost** on key #4:
   - **Key #4** loses $1.2 → its remaining limit becomes **$5 − $1.2 = $3.8**, persisted
     to the DB. The next message starts at **$3.8**, not $5.
   - **The user** simultaneously loses **$1.2 × 1.2 × 1000 = 1440 AuroraCraft tokens**
     (raw provider cost × commission × tokens-per-dollar). Their balance is now
     `9000 − 1440 = 7560`.
   - *(The "$1.2" is what the **key** spends; the "1440 tokens" is what the **user**
     pays. Both come from the same usage numbers — see §8.)*
3. **Limit exhaustion → disable + fall back.** When key #4's spend reaches its **$5**
   limit, the system **disables #4 in the DB** and routes onward to **#2**. Because #4
   is now disabled, the *next* message's chain starts directly at **#2 → #3 → #1**.
4. **Transient failure → fall back but DO NOT disable.** If key #4 instead hits a rate
   limit or error, it is retried **up to 10 times with a 30s delay** between attempts.
   If it still fails, the request falls back to **#2** — but #4 stays **enabled**
   (it still has budget; the failure was transient).
5. **Whole-chain failure → circuit breaker.** If #4 is rate-limited, then #2, then #3,
   then #1 all fail, the chain wraps back to #4 and tries again. This is a loop. If the
   **entire chain fails more than 2 full sweeps with not a single successful call in
   between**, the AI **stops** and shows: **"Please try again later."**
6. **User out of money → hard stop.** Independently of the keys, if the user's token
   balance reaches **0** at any point, the AI is **force-stopped mid-run** (see §8.4).

---

## 5. Two budgets, never confuse them

The feature only makes sense if you keep these two separate ledgers distinct:

| | **User token balance** | **Per-key dollar limit** |
|---|---|---|
| Unit | AuroraCraft tokens | provider US dollars |
| Whose money | the end user's purchased credit | the admin's provider credit on that key |
| Commission | **× 1.2** (platform margin) | **× 1.0** (raw, no margin) |
| Stored on | `users.aiTokens` | `provider_api_keys.usedUsd` vs `limitUsd` |
| When it hits zero | **kill the whole run** | **disable that key, fall back to the next** |
| Conversion | `tokens = ceil(rawUsd × 1.2 × 1000)` | `remaining = limitUsd − usedUsd` |

Both are debited from the **same** per-call usage numbers; only the multiplier
differs. This is the heart of the "dual pricing" requirement.

---

## 6. Data model changes

### 6.1 `provider_api_keys` — allow many rows + routing/limit fields
The table already supports multiple rows per (user, provider); we add the routing and
accounting columns and **drop the app-level single-key rule**.

Add columns (additive, idempotent migration — see CLAUDE.md "Drizzle Migration
Tracking Drift"):

| Column | Type | Meaning |
|---|---|---|
| `label` | `varchar` (nullable) | Admin-facing name to tell keys apart ("Fireworks #4 — $6 card"). |
| `weight` | `integer`, default `100` | **Lower = higher priority.** Defines chain order. |
| `limitUsd` | `double precision` (nullable) | Provider-dollar budget allotted to this key. `null` = unlimited. |
| `usedUsd` | `double precision`, default `0` | Live accumulated provider spend. **remaining = limitUsd − usedUsd**. |
| `exhaustedAt` | `timestamptz` (nullable) | Set when `usedUsd ≥ limitUsd` auto-disables the key. Distinguishes *auto-exhausted* from *admin-disabled*. |

Reuse the existing `isActive` boolean as the **admin "enabled"** switch. A key is
**usable** for routing iff:

```
isActive == true
AND mcpId IS NULL                       -- it's a provider key, not an MCP key
AND (limitUsd IS NULL OR usedUsd < limitUsd)
```

**Auto-disable on exhaustion** sets `exhaustedAt = now()` and `isActive = false`
(so every existing `isActive` filter naturally skips it). An admin **"reset usage"**
action sets `usedUsd = 0`, `exhaustedAt = null`, `isActive = true` (used when the
admin tops the provider card back up).

> **Note on free providers.** Multi-key routing is a **paid-provider-only** feature.
> A free (`isFree`) provider is restricted to **exactly one key per user** — no
> weight, no limit, no fallback chain. See §6.3 for the full rule and the
> paid→free transition that prunes extra keys.

### 6.2 New resolver replacing the flat key map
`getUserProviderKeyMap` (slug→one key) cannot express ordering, so add:

```ts
// server/src/utils/ai-runtime.ts (or a new key-router.ts)
getRoutedKeysForProvider(userId, providerId): RoutedKey[]
// returns USABLE keys (see §6.1) sorted by (weight asc, createdAt asc),
// each: { id, apiKey, weight, limitUsd, usedUsd, remainingUsd }
```

The agent path's "does the user have a key?" gate
(`server/src/routes/agents.ts:392`) becomes "does the user have **≥1 usable** key?".

### 6.3 Free vs. paid providers — key-count rules

Multi-key routing only makes sense where money is being spent, so it is gated on the
provider's `isFree` flag (`server/src/db/schema/ai-providers.ts:19`).

- **Paid provider** → **many** keys per user allowed. Full weight / limit / fallback /
  real-time billing as described throughout this doc.
- **Free provider** → **exactly one** key per user. No weight, no `limitUsd`, no chain,
  no per-call dollar accounting (cost is 0). Adding a second key must be **rejected**.

**Enforcement points:**
1. **Adding keys** (`POST /api/admin/users/:id/keys`, `server/src/routes/admin.ts:313`):
   if the target provider is free and the user already holds a key for it, reject with
   *"Free providers allow only one API key per user."* (Paid providers append a new row.)
2. **Provider made free** (the `isFree` false→true toggle in
   `PATCH /api/admin/ai/providers/:id`, `server/src/routes/ai-admin.ts:149`): this is a
   **destructive prune**. For **every user** holding keys for that provider, keep the
   single **highest-priority** key (lowest `weight`, tie-break oldest `createdAt`) and
   **delete all the others**. The surviving key keeps working as the user's lone free
   key. This runs in the same request that flips `isFree`.
3. **Provider made paid** (`isFree` true→false): no migration needed — the user's lone
   key simply becomes the first (and only, until an admin adds more) entry in its chain.

> The prune in (2) is irreversible (the deleted keys' secrets are gone). The admin UI
> should warn before toggling a populated provider to free.

These are the exact behavioral rules. "Current key" = the key serving right now.
They apply to **paid providers** only; a free provider has a single key and skips the
whole chain/retry/limit machinery (§6.3).

1. **Order.** Among **usable** keys, sort by `weight` ascending. Index 0 = **primary**;
   the rest are **fallbacks** in order. (Ties broken by `createdAt`.)
2. **Retry the current key.** On a rate-limit (429) / transient error from the current
   key, retry it **up to 10 times** with a **30-second delay** between attempts.
3. **Fall back on persistent failure.** If the current key still fails after its
   retries, advance to the next key in the chain. **Do not disable** the failed key —
   it still has budget; the failure was transient.
4. **Fall back on budget exhaustion.** The instant a key's `usedUsd` reaches `limitUsd`,
   advance to the next key **and disable the exhausted one in the DB**
   (`isActive=false`, `exhaustedAt=now()`). Subsequent messages skip it entirely.
5. **Loop the chain.** If every key in the chain fails (all rate-limited/errored),
   wrap back to the primary and try the whole chain again.
6. **Circuit breaker.** Maintain a counter of **consecutive full-chain sweeps that
   produced zero successful calls**. Any single successful call resets it to 0. If it
   exceeds **2**, abort and surface **"Please try again later."**
7. **User-balance kill (orthogonal).** If the user's balance hits 0 at any point,
   stop the run regardless of key state (see §8.4).

> **Disable vs. don't-disable — the one-line rule:**
> *Out of money on this key* → **disable** (persistent). *Key misbehaving* →
> **don't disable** (transient, will be retried next time).

---

## 8. The new billing model

### 8.1 No estimate, no pre-charge
Delete the up-front path for the new flow: `estimateMessageCost` + the pre-charge
`deductTokens` + the end-of-run `reconcileTokens` (`server/src/routes/agents.ts:396-424`,
`server/src/agents/executor.ts:124-150`). Keep only a **minimal entry gate**: refuse
to start if the user's balance is `0` (or below a small floor like the existing
`MIN_PREMIUM_BALANCE`, `server/src/utils/token-service.ts:9`).

### 8.2 Meter every call, charge both budgets
For **each** upstream call, once we know its real `usage`
(`promptTokens`, `completionTokens`, `cachedTokens`):

```
rawUsd      = providerCost(usage, model.pricing)      // NO commission
userTokens  = ceil(rawUsd × TOKEN_MULTIPLIER × TOKENS_PER_USD)   // == calculateTokenCost(...)
```

Then atomically:
- **User:** `users.aiTokens -= userTokens` (clamped at 0), write a `token_transactions`
  `deduct` row (`server/src/db/schema/provider-api-keys.ts:27`).
- **Serving key:** `provider_api_keys.usedUsd += rawUsd`; if `usedUsd ≥ limitUsd`,
  flip it to exhausted (§6.1).

Use the **real** token counts from the provider's `usage`, **not** the `chars/4`
heuristic — this is the "nano-level precision" the spec asks for. Compute **both**
numbers from the same counts with our own pricing helpers so the user charge and the
key decrement can never drift apart. Add a sibling to `calculateTokenCost`:

```ts
// server/src/config/ai-models.ts
calculateProviderCostUsd(input, output, pricing, cached?): number  // raw $, no ×1.2, no ×1000, no ceil
```

### 8.3 Where metering happens — LiteLLM becomes the meter
LiteLLM already computes accurate usage per call. We hook it:

- **Custom callback** (`async_log_success_event`) fires after every successful
  upstream call. It receives the `usage` and which **deployment/key** served the call.
  ([LiteLLM custom callbacks](https://docs.litellm.ai/docs/observability/custom_callback))
- The callback **POSTs to an internal AuroraCraft endpoint**
  `POST /internal/litellm/usage` (machine-to-machine, shared-secret header — **not**
  user-authenticated) with `{ userId, sessionId, keyId, promptTokens,
  completionTokens, cachedTokens }`.
- The endpoint runs §8.2 (dual deduction) atomically and returns
  `{ userBalanceRemaining, keyRemainingUsd, killRun }`.

**How the callback knows the identifiers:**
- `userId`, `sessionId`, the callback URL, and the shared secret are passed as **env
  vars** to the LiteLLM process when it is spawned
  (extend `server/src/bridges/litellm-process-manager.ts:177-196`).
- `keyId` is baked into each deployment's `model_info` (e.g.
  `model_info.aurora_key_id`) in the generated config, so the callback reads it from
  the served deployment.

**Streaming caveat:** the `x-litellm-response-cost` *header* is not emitted for
streaming responses, but the **`usage` object in the final chunk is** — provided we
set `general_settings.always_include_stream_usage: true` (or `stream_options:
{include_usage: true}`) in the LiteLLM config. We rely on `usage`, not the header.
([streaming usage](https://docs.litellm.ai/docs/completion/stream),
[header issue #12689](https://github.com/BerriAI/litellm/issues/12689))

### 8.4 Killing the run when the user runs out
Two layers:
- **Pre-call gate** (`async_pre_call_hook`): before each upstream call, reject if the
  user's in-process remaining ≤ 0, **or** if the chosen key is exhausted (forces
  LiteLLM's fallback). Rejecting returns a clean error rather than spending money.
  ([call hooks](https://docs.litellm.ai/docs/proxy/call_hooks))
- **Hard stop:** when `/internal/litellm/usage` detects the balance hit 0, the backend
  calls `agentExecutor.cancel(sessionId)` + `processManager.forceStop(projectDir)`
  (`server/src/bridges/opencode-process-manager.ts:461`) so OpenCode cannot continue.
- Keep `maxOutputTokens` (`server/src/bridges/opencode.ts:867`) as a **secondary**
  coarse cap derived from the current balance — belt and suspenders.

### 8.5 Mapping the routing rules onto LiteLLM
Generate **one deployment per (model × usable key)**, all sharing the same
`model_name` (= the AuroraCraft model uuid OpenCode requests), and set:
- `litellm_params.order` = the key's `weight` (strict primary→fallback escalation by
  order; 429s auto-cooldown a deployment),
- `num_retries` to honor the 10-attempt rule,
- `model_info.aurora_key_id` for the callback,
- raw per-token pricing in `model_info` (so LiteLLM's own cost is raw provider $ too).

Sketch:

```yaml
model_list:
  - model_name: <model-uuid>
    litellm_params: { model: openai/<realName>, api_key: <KEY#4>, api_base: <baseUrl>, order: 1 }
    model_info: { aurora_key_id: <id#4>, input_cost_per_token: ..., output_cost_per_token: ... }
  - model_name: <model-uuid>
    litellm_params: { model: openai/<realName>, api_key: <KEY#2>, api_base: <baseUrl>, order: 2 }
    model_info: { aurora_key_id: <id#2>, ... }
  # ...#3 (order 3), #1 (order 4)
litellm_settings:
  num_retries: 10
general_settings:
  always_include_stream_usage: true
```

This replaces the single-key emission in `generateLiteLLMConfig()`
(`server/src/utils/litellm-config.ts:71-109`).
([load balancing / order](https://docs.litellm.ai/docs/proxy/load_balancing),
[reliability / retries & fallbacks](https://docs.litellm.ai/docs/proxy/reliability))

> The **30s-fixed × 10** delay and the **2-sweep circuit breaker** do not map onto a
> single native LiteLLM knob — see §13.

---

## 9. Prompt Enhancer & Error Prompt Maker (Pillar C)

These bypass LiteLLM and call `nimChat` directly, so they get a **lighter** version of
the same logic (no proxy, single non-streaming call that already returns `usage`):

1. **Route over the chain.** Replace the single-key `resolveNimTarget`
   (`server/src/routes/nim.ts:38`) with `getRoutedKeysForProvider`. Try the primary
   key; on failure apply the same retry/fallback/circuit-breaker rules from §7.
2. **Read usage.** Extend `nimChat` to return the `usage` block it currently discards
   (`server/src/bridges/nim-client.ts:91-103`).
3. **Charge both budgets** after each successful call via the shared §8.2 routine
   (user tokens ×1.2; serving key raw $). The enhancer makes **two** calls (draft +
   finalize, `server/src/agents/nim-engine.ts:108-122`) and refine makes one more —
   **each** is metered. The error-maker makes one call.
4. **Gate + stop.** Refuse to start with a zero balance; if a mid-feature call would
   overrun the balance, stop and report it (these are short, bounded jobs, so a hard
   mid-call kill is less critical than for the agent — finishing the in-flight call
   then stopping is acceptable).

Net effect: the Enhancer/Maker stop being free; their cost is debited with the same
precision and the same dual ledgers as the agent.

---

## 10. The internal usage endpoint (contract)

```
POST /internal/litellm/usage
Headers: X-Aurora-Internal-Secret: <shared secret from env>
Body:    { userId, sessionId, keyId, promptTokens, completionTokens, cachedTokens }

→ 200 { userBalanceRemaining: number, keyRemainingUsd: number|null, killRun: boolean }
```

- **Not** behind `authMiddleware`; authenticated solely by the shared secret
  (add `LITELLM_INTERNAL_SECRET` to `server/src/env.ts:4` and `.env`).
- All mutations are **atomic SQL** (`usedUsd = usedUsd + $cost`,
  `aiTokens = GREATEST(aiTokens - $tok, 0)`) so concurrent calls cannot double-spend.
- Returns `killRun: true` once the balance is exhausted; the backend then force-stops
  the session (§8.4).
- Register in `server/src/index.ts` alongside the other routes (`:44-54`).

---

## 11. File-by-file impact map

| Area | File(s) | Change |
|---|---|---|
| Schema | `server/src/db/schema/provider-api-keys.ts` | Add `label`, `weight`, `limitUsd`, `usedUsd`, `exhaustedAt`. |
| Migration | `server/drizzle/0021_*.sql` | Idempotent `ADD COLUMN IF NOT EXISTS` (CLAUDE.md drift rule). |
| Key resolver | `server/src/utils/ai-runtime.ts` (+ maybe new `key-router.ts`) | `getRoutedKeysForProvider`; keep `getUserProviderKeyMap` only where one key is fine. |
| Pricing | `server/src/config/ai-models.ts` | Add `calculateProviderCostUsd` (raw $). |
| Billing | `server/src/utils/token-service.ts` | Add `chargeRealtimeUsage(userId, keyId, usage, pricing)`; retire estimate/reconcile for the new path. |
| LiteLLM config | `server/src/utils/litellm-config.ts` | Emit one deployment per (model×key), `order`=weight, `num_retries`, `model_info.aurora_key_id`, `always_include_stream_usage`. |
| LiteLLM process | `server/src/bridges/litellm-process-manager.ts` | Pass `AURORA_USER_ID/SESSION_ID/CALLBACK_URL/INTERNAL_SECRET` env; ship the Python callback file. |
| LiteLLM callback | new Python module in the shared venv | `async_pre_call_hook` (budget gate) + `async_log_success_event` (POST usage). |
| Internal route | new `server/src/routes/internal.ts` | `POST /internal/litellm/usage` (shared-secret). |
| Agent path | `server/src/routes/agents.ts`, `server/src/agents/executor.ts` | Remove pre-charge/reconcile; wire kill-on-exhaust; ≥1-usable-key gate. |
| NIM path | `server/src/routes/nim.ts`, `server/src/agents/nim-engine.ts`, `server/src/bridges/nim-client.ts` | Chain routing + read `usage` + per-call dual charge. |
| Admin API (keys) | `server/src/routes/admin.ts` | Keys become a **list** per provider: create/edit/remove + weight/limit/label/enabled + **reset-usage**; show `usedUsd`/`limitUsd`. **Reject a 2nd key on a free provider** (§6.3). |
| Admin API (providers) | `server/src/routes/ai-admin.ts:149` | On `isFree` false→true, **prune** every user's keys for that provider to the single highest-priority one (§6.3). |
| Admin UI | `client/src/pages/admin/users.tsx`, `client/src/hooks/use-ai-admin.ts` | `UserKeysModal` → multi-row editor per **paid** provider (weight/limit/used/enabled); **single-row** for free providers. Warn before toggling a populated provider to free (§6.3 prune). |
| Tier guard | `server/src/routes/admin.ts:200-215` | Demotion still blocked while the user holds **any** paid-provider key (now possibly several). |

---

## 12. Invariants & edge cases

- **Atomicity.** Every balance/limit mutation is a single atomic SQL update; the
  endpoint returns post-update values so the proxy's in-process counters stay correct.
- **Both ledgers from one source.** `userTokens` and `rawUsd` are always derived from
  the *same* `usage` with *one* pricing record — never two code paths.
- **Free providers are single-key** (§6.3): no chain, no limits, no dollar accounting
  (cost is 0). All routing/limit/billing logic in this doc applies to **paid**
  providers only.
- **Key disabled mid-run** → it is skipped from the *next* message's config; within the
  current run, LiteLLM's fallback handles the live switch.
- **Exhausted everything** → if no usable key remains (all exhausted), treat like the
  "no key configured" error today (`server/src/routes/agents.ts:392`): refuse with a
  clear admin-facing message.
- **Demotion safety** unchanged: a user cannot drop to free while holding any
  paid-provider key (`server/src/routes/admin.ts:200`).
- **Reconciliation removed**, so there is no "2× estimate cap" anymore — the user pays
  exactly the metered cost, no more, no less.
- **Refund on hard-kill**: if we force-stop after charging a call that never produced
  usable output, decide whether to refund that last call (see §13).

---

## 13. Open decisions & caveats (read before implementing)

These are places where the requirement does not map onto a single existing knob, or
where a product decision is needed. None block the design; each needs a choice.

1. **30s-fixed × 10 retry.** LiteLLM's retry backoff is *exponential* (≈0.2s→10s) by
   default, not a fixed 30s. Options: (a) tune LiteLLM's retry-delay envs to approximate
   it, or (b) drive the 10×30s loop from our own orchestration layer and give LiteLLM
   `num_retries: 0`. **(b) is more faithful** but more code.
   ([reliability docs](https://docs.litellm.ai/docs/proxy/reliability))
2. **Long retries vs. timeouts.** 10 × 30s = **5 minutes** of retrying a *single* call.
   That can collide with OpenCode/HTTP timeouts and the agent's overall 30-min ceiling
   (`server/src/bridges/opencode.ts:979`). We likely want a **lower default** (e.g.
   3×10s) and make it admin-configurable. Confirm the intended values.
3. **2-sweep circuit breaker.** Not native to LiteLLM (it tries the chain once).
   Implement as backend orchestration: catch the terminal LiteLLM failure, regenerate,
   re-invoke, count sweeps, stop at 2 with "Please try again later."
4. **Mid-run kill granularity.** We can stop the agent *between* upstream calls (via the
   pre-call gate + force-stop), but not interrupt a call already in flight. So the user
   can go very slightly negative on the **last** in-flight call. Decide: clamp at 0
   (absorb the overage) or allow a tiny negative. Recommended: **clamp at 0** (cost to
   the platform is bounded by one call).
5. **Distinguishing rate-limit from billing-exhaustion at the proxy.** "Disable on
   exhaustion, don't disable on rate-limit" requires the metering side (which knows
   budgets) to drive disabling — the proxy's pre-call gate disables on **our** budget
   signal, while 429s are handled as transient. Keep these two paths clearly separate.
6. **Per-call cost trust.** We compute costs from `usage` with **our** pricing rather
   than trusting LiteLLM's `response_cost`, to avoid known streaming cost-extraction
   bugs (e.g. OpenRouter [#16021], Anthropic cache [#11789]). Keep it that way.
7. **NIM hard-kill.** For the short Enhancer/Maker jobs, is finishing the in-flight call
   then stopping acceptable, or must we hard-cap mid-call? Recommended: **finish then
   stop** (jobs are bounded; complexity not worth it).
8. **Admin "reset usage" / rollover.** Confirm the operational model: do limits reset
   monthly, on admin top-up, or only manually? The schema supports manual reset; a cron
   rollover would be additive.

---

## 14. Glossary

- **Key** — one provider API secret attached to a (user, provider) pair.
- **Weight** — priority number on a key; **lower = higher rank** (primary first).
- **Limit (`limitUsd`)** — provider-dollar budget the admin allots to a key.
- **Used (`usedUsd`)** — live provider-dollar spend on a key; **remaining = limit − used**.
- **Exhausted** — `usedUsd ≥ limitUsd`; the key auto-disables and the chain falls back.
- **Chain** — the weight-ordered list of usable keys: primary → fallbacks.
- **Sweep** — one full pass through the chain; 2 failed sweeps trip the circuit breaker.
- **Raw $ (provider cost)** — upstream price with **no** commission; debits the key.
- **AuroraCraft tokens** — user-facing credit; `tokens = ceil(raw$ × 1.2 × 1000)`; debits the user.
- **Meter** — LiteLLM here, reporting per-call usage to the backend in real time.
```
