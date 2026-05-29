import { writeFile, readFile, mkdir, chmod } from 'fs/promises'
import { createHash, randomBytes } from 'crypto'
import type { AIModelDef, ProviderId } from '../config/ai-models.js'
import { getModelPricing, TOKEN_MULTIPLIER, TOKENS_PER_USD } from '../config/ai-models.js'
import { getProjectConfigDirectory } from './provider-config.js'

export interface LiteLLMModelMapping {
  model_name: string
  litellm_params: {
    model: string
    api_key: string
    api_base: string
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
  models: AIModelDef[],
  providerKeys: Record<string, string>,
  availableTokens: number,
): Promise<LiteLLMConfig> {
  const modelList: LiteLLMModelMapping[] = []

  for (const model of models) {
    // Only include premium models (not free/zen)
    if (model.minTier === 'free') continue

    // Find the provider that has an API key available
    const provider = model.providers.find(p =>
      p.requiresApiKey && providerKeys[p.id]
    ) || model.providers.find(p => !p.requiresApiKey)

    if (!provider) continue
    if (provider.id === 'opencode') continue // Zen models bypass LiteLLM

    const apiKey = providerKeys[provider.id]
    if (!apiKey) continue

    const pricing = getModelPricing(model, provider.id)

    // LiteLLM uses cost per token (not per 1M)
    const inputCostPerToken = pricing.inputPer1M / 1_000_000
    const outputCostPerToken = pricing.outputPer1M / 1_000_000

    // Determine the correct api_base for this provider
    let apiBase: string
    switch (provider.id) {
      case 'fireworks':
        apiBase = 'https://api.fireworks.ai/inference/v1'
        break
      case 'bluesminds':
        apiBase = 'https://api.bluesminds.com/v1'
        break
      case 'modal':
        apiBase = 'https://api.us-west-2.modal.direct/v1'
        break
      default:
        continue
    }

    // Build the upstream model string for LiteLLM
    // Format: openai/{model_id} for OpenAI-compatible endpoints
    const upstreamModel = `openai/${provider.modelId}`

    modelList.push({
      model_name: model.id, // AuroraCraft model ID (e.g., 'kimi-k2.6')
      litellm_params: {
        model: upstreamModel,
        api_key: apiKey,
        api_base: apiBase,
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
    lines.push('      api_base: ' + model.litellm_params.api_base)
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
