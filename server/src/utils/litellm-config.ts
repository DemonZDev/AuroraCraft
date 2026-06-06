import { writeFile, readFile, mkdir, chmod } from 'fs/promises'
import { createHash, randomBytes } from 'crypto'
import { TOKEN_MULTIPLIER, TOKENS_PER_USD } from '../config/ai-models.js'
import type { ResolvedModel } from './ai-runtime.js'
import { getProjectConfigDirectory } from './provider-config.js'

export interface LiteLLMModelMapping {
  model_name: string
  litellm_params: {
    model: string
    api_key: string
    api_base?: string
  }
  model_info: {
    input_cost_per_token: number
    output_cost_per_token: number
  }
}

export interface LiteLLMConfig {
  model_list: LiteLLMModelMapping[]
  general_settings: {
    master_key: string
    database_url?: string
    max_budget?: number
  }
  litellm_settings?: {
    success_callback?: string[]
    failure_callback?: string[]
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
 * Generate a LiteLLM Proxy config.yaml for a specific project/user.
 * Maps AuroraCraft model IDs to upstream provider routes with proper
 * API keys, custom pricing, and a safety-net budget.
 */
export async function generateLiteLLMConfig(
  projectDir: string,
  models: ResolvedModel[],
  providerKeys: Record<string, string>,
  availableTokens: number,
): Promise<LiteLLMConfig> {
  const modelList: LiteLLMModelMapping[] = []

  for (const model of models) {
    // Only non-Zen OpenAI-compatible models route through LiteLLM.
    // Zen models (opencode/<id> format) bypass it entirely.
    if (model.provider.kind === 'zen') continue
    if (!model.provider.baseUrl) continue

    const apiKey = providerKeys[model.provider.slug]
    if (!apiKey) continue

    // LiteLLM uses cost per token (not per 1M)
    const inputCostPerToken = model.pricing.inputPer1M / 1_000_000
    const outputCostPerToken = model.pricing.outputPer1M / 1_000_000

    // Upstream model string: openai/<realName> with api_base works for most
    // OpenAI-compatible providers (Fireworks, Bluesminds, NVIDIA NIM).
    // OpenRouter uses the native openrouter/ prefix so LiteLLM can handle
    // rate limiting, load balancing, and fallback routing internally.
    // NVIDIA NIM (integrate.api.nvidia.com) is a plain OpenAI-compatible
    // endpoint — no special prefix needed.
    const isOpenRouter = model.provider.slug === 'openrouter'
    const upstreamModel = isOpenRouter
      ? `openrouter/${model.realName}`
      : `openai/${model.realName}`

    modelList.push({
      model_name: model.id,
      litellm_params: {
        model: upstreamModel,
        api_key: apiKey,
        // OpenRouter: let LiteLLM's native openrouter integration handle routing,
        // rate limiting, and provider fallback internally (no explicit api_base needed).
        ...(isOpenRouter ? {} : { api_base: model.provider.baseUrl }),
      },
      model_info: {
        input_cost_per_token: inputCostPerToken,
        output_cost_per_token: outputCostPerToken,
      },
    })
  }

  // Convert tokens to USD budget for LiteLLM safety net
  // tokens / TOKENS_PER_USD / TOKEN_MULTIPLIER = max USD we can spend
  const maxBudget = availableTokens > 0
    ? availableTokens / TOKENS_PER_USD / TOKEN_MULTIPLIER
    : 0

  // Use a persistent master key so OpenCode's cached config remains valid
  const masterKey = await getOrCreateLiteLLMMasterKey(projectDir)

  const config: LiteLLMConfig = {
    model_list: modelList,
    general_settings: {
      master_key: masterKey,
      max_budget: maxBudget > 0 ? maxBudget : undefined,
    },
  }

  return config
}

/**
 * Write the LiteLLM config.yaml to the isolated per-project config directory.
 */
export async function writeLiteLLMConfig(
  projectDir: string,
  config: LiteLLMConfig,
): Promise<string> {
  const configDir = getProjectConfigDirectory(projectDir)
  await mkdir(configDir, { recursive: true })
  await chmod(configDir, 0o700)

  const configPath = `${configDir}/litellm.yaml`
  const yamlContent = convertToYAML(config)
  await writeFile(configPath, yamlContent, 'utf8')
  await chmod(configPath, 0o600)

  return configPath
}

/**
 * Convert a LiteLLMConfig object to YAML string.
 * Simple YAML serializer — sufficient for LiteLLM config.
 */
function convertToYAML(config: LiteLLMConfig): string {
  const lines: string[] = []

  // Model list
  lines.push('model_list:')
  for (const model of config.model_list) {
    lines.push('  - model_name: ' + model.model_name)
    lines.push('    litellm_params:')
    lines.push('      model: ' + model.litellm_params.model)
    lines.push('      api_key: ' + model.litellm_params.api_key)
    if (model.litellm_params.api_base) {
      lines.push('      api_base: ' + model.litellm_params.api_base)
    }
    lines.push('    model_info:')
    lines.push('      input_cost_per_token: ' + model.model_info.input_cost_per_token)
    lines.push('      output_cost_per_token: ' + model.model_info.output_cost_per_token)
  }

  // General settings
  lines.push('general_settings:')
  lines.push('  master_key: ' + config.general_settings.master_key)
  if (config.general_settings.max_budget !== undefined) {
    lines.push('  max_budget: ' + config.general_settings.max_budget)
  }

  // LiteLLM settings (optional)
  if (config.litellm_settings) {
    lines.push('litellm_settings:')
    if (config.litellm_settings.success_callback) {
      lines.push('  success_callback:')
      for (const cb of config.litellm_settings.success_callback) {
        lines.push('    - ' + cb)
      }
    }
    if (config.litellm_settings.failure_callback) {
      lines.push('  failure_callback:')
      for (const cb of config.litellm_settings.failure_callback) {
        lines.push('    - ' + cb)
      }
    }
  }

  return lines.join('\n') + '\n'
}
