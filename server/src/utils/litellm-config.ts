import { writeFile, readFile, mkdir, chmod } from 'fs/promises'
import { createHash, randomBytes } from 'crypto'
import { env } from '../env.js'
import type { ResolvedModel, RoutedKey } from './ai-runtime.js'
import { getProjectConfigDirectory } from './provider-config.js'

// The real-time meter module shipped next to each project's config (see §8.5).
const CALLBACK_MODULE = 'aurora_litellm_callback'
const CALLBACK_INSTANCE = `${CALLBACK_MODULE}.proxy_handler_instance`

export interface LiteLLMModelMapping {
  model_name: string
  litellm_params: {
    model: string
    api_key: string
    api_base?: string
    // Lower order = higher priority. LiteLLM tries order=1, retries, then order=2…
    order?: number
  }
  model_info: {
    // AuroraCraft identifiers the meter reads back to attribute + charge each call.
    aurora_key_id?: string
    aurora_model_id?: string
    input_cost_per_token: number
    output_cost_per_token: number
  }
}

export interface LiteLLMConfig {
  model_list: LiteLLMModelMapping[]
  general_settings: {
    master_key: string
  }
  litellm_settings?: {
    callbacks?: string[]
  }
  router_settings?: {
    num_retries?: number
    routing_strategy?: string
  }
}

/**
 * Read or generate a persistent master key for a project's LiteLLM proxy.
 * Keys are stored in the isolated config directory and reused across restarts
 * so OpenCode's cached provider config stays valid.
 */
export async function getOrCreateLiteLLMMasterKey(projectDir: string): Promise<string> {
  const configDir = getProjectConfigDirectory(projectDir)
  const keyPath = `${configDir}/.litellm-master-key`

  try {
    const existing = await readFile(keyPath, 'utf8')
    if (existing.trim().startsWith('sk-litellm-')) {
      return existing.trim()
    }
  } catch {
    // File doesn't exist or unreadable — generate new key
  }

  const key = `sk-litellm-${createHash('sha256').update(projectDir + randomBytes(16).toString('hex')).digest('hex').slice(0, 32)}`
  await mkdir(configDir, { recursive: true })
  await writeFile(keyPath, key, 'utf8')
  await chmod(keyPath, 0o600)
  return key
}

/**
 * Generate the per-project LiteLLM proxy config.
 *
 * For each non-Zen model the user can run, emit **one deployment per usable key** of
 * that model's provider — all sharing the model's uuid as `model_name`, ordered by the
 * key's priority (lower weight = lower `order` = tried first). LiteLLM tries order=1,
 * retries it (`router_settings.num_retries`), 429-cooldowns it, then escalates to
 * order=2, and so on (primary → fallback chain, routing.md §7/§8.5).
 *
 * Each deployment carries the AuroraCraft key/model ids in `model_info` so the meter
 * (aurora_litellm_callback.py) can attribute every call to the right key and charge it
 * in real time. Pricing is the **raw** provider per-token cost — the meter recomputes
 * the user's commissioned token charge itself.
 */
export async function generateLiteLLMConfig(
  projectDir: string,
  models: ResolvedModel[],
  keysByProvider: Record<string, RoutedKey[]>,
  _availableTokens: number,
): Promise<LiteLLMConfig> {
  const modelList: LiteLLMModelMapping[] = []

  for (const model of models) {
    // Zen bypasses LiteLLM entirely; a provider with no base URL can't be proxied.
    if (model.provider.kind === 'zen') continue
    if (!model.provider.baseUrl) continue

    const keys = keysByProvider[model.provider.id] ?? []
    if (keys.length === 0) continue // no usable key → this model isn't offered

    const inputCostPerToken = model.pricing.inputPer1M / 1_000_000
    const outputCostPerToken = model.pricing.outputPer1M / 1_000_000

    // OpenRouter uses its native prefix so LiteLLM handles its routing internally.
    const isOpenRouter = model.provider.slug === 'openrouter'
    const upstreamModel = isOpenRouter ? `openrouter/${model.realName}` : `openai/${model.realName}`

    keys.forEach((key, idx) => {
      modelList.push({
        model_name: model.id,
        litellm_params: {
          model: upstreamModel,
          api_key: key.apiKey,
          ...(isOpenRouter ? {} : { api_base: model.provider.baseUrl }),
          order: idx + 1, // keys are pre-sorted by weight asc → 1 = primary
        },
        model_info: {
          aurora_key_id: key.id,
          aurora_model_id: model.id,
          input_cost_per_token: inputCostPerToken,
          output_cost_per_token: outputCostPerToken,
        },
      })
    })
  }

  const masterKey = await getOrCreateLiteLLMMasterKey(projectDir)

  return {
    model_list: modelList,
    general_settings: { master_key: masterKey },
    litellm_settings: { callbacks: [CALLBACK_INSTANCE] },
    router_settings: {
      num_retries: env.LITELLM_NUM_RETRIES,
      routing_strategy: 'simple-shuffle',
    },
  }
}

/**
 * Write the LiteLLM config.yaml AND the real-time meter module to the isolated
 * per-project config directory (which is also the proxy's cwd, so the module is
 * importable by name).
 */
export async function writeLiteLLMConfig(
  projectDir: string,
  config: LiteLLMConfig,
): Promise<string> {
  const configDir = getProjectConfigDirectory(projectDir)
  await mkdir(configDir, { recursive: true })
  await chmod(configDir, 0o700)

  // Ship the meter alongside the config so LiteLLM can `import aurora_litellm_callback`.
  await writeFile(`${configDir}/${CALLBACK_MODULE}.py`, AURORA_CALLBACK_PY, 'utf8')

  const configPath = `${configDir}/litellm.yaml`
  await writeFile(configPath, convertToYAML(config), 'utf8')
  await chmod(configPath, 0o600)

  return configPath
}

/** Minimal YAML serializer — sufficient for the LiteLLM config we generate. */
function convertToYAML(config: LiteLLMConfig): string {
  const lines: string[] = []

  lines.push('model_list:')
  for (const m of config.model_list) {
    lines.push('  - model_name: ' + m.model_name)
    lines.push('    litellm_params:')
    lines.push('      model: ' + m.litellm_params.model)
    lines.push('      api_key: ' + m.litellm_params.api_key)
    if (m.litellm_params.api_base) lines.push('      api_base: ' + m.litellm_params.api_base)
    if (m.litellm_params.order !== undefined) lines.push('      order: ' + m.litellm_params.order)
    lines.push('    model_info:')
    if (m.model_info.aurora_key_id) lines.push('      aurora_key_id: ' + m.model_info.aurora_key_id)
    if (m.model_info.aurora_model_id) lines.push('      aurora_model_id: ' + m.model_info.aurora_model_id)
    lines.push('      input_cost_per_token: ' + m.model_info.input_cost_per_token)
    lines.push('      output_cost_per_token: ' + m.model_info.output_cost_per_token)
  }

  lines.push('general_settings:')
  lines.push('  master_key: ' + config.general_settings.master_key)

  if (config.litellm_settings?.callbacks?.length) {
    lines.push('litellm_settings:')
    lines.push('  callbacks:')
    for (const cb of config.litellm_settings.callbacks) lines.push('    - ' + cb)
  }

  if (config.router_settings) {
    lines.push('router_settings:')
    if (config.router_settings.num_retries !== undefined) lines.push('  num_retries: ' + config.router_settings.num_retries)
    if (config.router_settings.routing_strategy) lines.push('  routing_strategy: ' + config.router_settings.routing_strategy)
  }

  return lines.join('\n') + '\n'
}

// ── The real-time meter (Python) ─────────────────────────────────────────────
// Static module; per-project identity comes from env vars set when the proxy is
// spawned (AURORA_USER_ID / AURORA_PROJECT_DIR / AURORA_CALLBACK_BASE /
// AURORA_INTERNAL_SECRET). It POSTs each call's usage to /internal/litellm/usage and
// refuses new calls once the user balance is known to be zero. See routing.md §8.
const AURORA_CALLBACK_PY = `"""AuroraCraft real-time usage meter for the LiteLLM proxy.

One proxy == one project == one user. After each upstream call this reports the real
token usage to the AuroraCraft backend, which charges the user's token balance and the
serving API key's dollar limit, and force-stops the agent when the user runs out.

Identity comes from the environment; per-call key/model ids come from each deployment's
model_info (set by litellm-config.ts).
"""
import os
import httpx
from litellm.integrations.custom_logger import CustomLogger

_USER_ID = os.environ.get("AURORA_USER_ID", "")
_PROJECT_DIR = os.environ.get("AURORA_PROJECT_DIR", "")
_BASE = os.environ.get("AURORA_CALLBACK_BASE", "http://127.0.0.1:3000")
_SECRET = os.environ.get("AURORA_INTERNAL_SECRET", "")
_USAGE_URL = _BASE.rstrip("/") + "/internal/litellm/usage"

# Last known remaining AuroraCraft balance for this user (updated after each call).
_balance = {}


def _model_info(kwargs):
    lp = kwargs.get("litellm_params") or {}
    mi = lp.get("model_info") or {}
    if mi:
        return mi
    meta = lp.get("metadata") or {}
    return meta.get("model_info") or {}


def _get(o, k):
    if o is None:
        return None
    if isinstance(o, dict):
        return o.get(k)
    return getattr(o, k, None)


def _usage_tokens(kwargs, response_obj):
    usage = _get(response_obj, "usage")
    if usage is None:
        slo = kwargs.get("standard_logging_object") or {}
        return int(slo.get("prompt_tokens") or 0), int(slo.get("completion_tokens") or 0), 0
    prompt = int(_get(usage, "prompt_tokens") or 0)
    completion = int(_get(usage, "completion_tokens") or 0)
    cached = 0
    details = _get(usage, "prompt_tokens_details")
    if details is not None:
        cached = int(_get(details, "cached_tokens") or 0)
    return prompt, completion, cached


def _payload(kwargs, response_obj):
    mi = _model_info(kwargs)
    model_id = mi.get("aurora_model_id")
    if not model_id:
        return None
    prompt, completion, cached = _usage_tokens(kwargs, response_obj)
    return {
        "userId": _USER_ID,
        "modelId": model_id,
        "keyId": mi.get("aurora_key_id"),
        "projectDir": _PROJECT_DIR,
        "inputTokens": prompt,
        "outputTokens": completion,
        "cachedTokens": cached,
    }


class AuroraUsageLogger(CustomLogger):
    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        try:
            payload = _payload(kwargs, response_obj)
            if payload is None:
                return
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(_USAGE_URL, json=payload, headers={"X-Aurora-Internal-Secret": _SECRET})
                if r.status_code == 200:
                    rem = r.json().get("userBalanceRemaining")
                    if isinstance(rem, (int, float)) and rem >= 0:
                        _balance[_USER_ID] = rem
        except Exception as e:
            print("[aurora-meter] usage report failed:", e)

    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        try:
            payload = _payload(kwargs, response_obj)
            if payload is None:
                return
            httpx.post(_USAGE_URL, json=payload, headers={"X-Aurora-Internal-Secret": _SECRET}, timeout=10.0)
        except Exception as e:
            print("[aurora-meter] usage report failed:", e)

    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        # Kill switch: once the user balance is known to be zero, refuse new calls so
        # the agent stops spending (belt-and-suspenders with the server-side force-stop).
        rem = _balance.get(_USER_ID)
        if rem is not None and rem <= 0:
            raise Exception("AuroraCraft: token balance exhausted - generation stopped.")
        return data


proxy_handler_instance = AuroraUsageLogger()
`
