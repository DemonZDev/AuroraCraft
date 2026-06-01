import type { ModelPricing } from './ai-models.js'

/**
 * AI Assistant model catalog (NVIDIA NIM). Kept SEPARATE from AI_MODELS so these
 * models appear ONLY in the Assistant picker, never in the Agent's model list.
 *
 * `nimModelId` slugs were CONFIRMED against the live NVIDIA NIM catalog
 * (GET https://integrate.api.nvidia.com/v1/models) on 2026-06-01 — all 6 exist.
 * `pricing` is the AuroraCraft charge (USD per 1M tokens, same shape as ai-models.ts,
 * billed via token-service with the 1.2x platform multiplier) — tune as a business
 * decision; the user's own NIM key absorbs NVIDIA's actual inference cost.
 */
export interface AssistantModelDef {
  id: string // stable internal id (stored in projects.assistantModel)
  name: string // user-facing label
  nimModelId: string // TODO: confirm real NVIDIA NIM model slug
  description: string
  pricing: ModelPricing // USD per 1M tokens; billed via token-service like Agent models
  isDefault?: boolean
}

// Slugs verified live (NIM /v1/models, 2026-06-01). `step-3.7-flash` and `deepseek-*`
// are reasoning models (emit a separate `reasoning_content`); the engine uses a high
// max_tokens so they finish reasoning and produce a final `content`.
export const ASSISTANT_MODELS: AssistantModelDef[] = [
  { id: 'kimi-k2.6', name: 'Kimi K2.6', nimModelId: 'moonshotai/kimi-k2.6', description: 'High-quality reasoning.', pricing: { inputPer1M: 0.95, outputPer1M: 4.0 } },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', nimModelId: 'minimaxai/minimax-m2.7', description: 'Balanced quality and speed.', pricing: { inputPer1M: 0.30, outputPer1M: 1.20 } },
  { id: 'step-3.7-flash', name: 'Step 3.7 Flash', nimModelId: 'stepfun-ai/step-3.7-flash', description: 'Fast reasoning default for the Assistant.', pricing: { inputPer1M: 0.20, outputPer1M: 0.80 }, isDefault: true },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', nimModelId: 'deepseek-ai/deepseek-v4-pro', description: 'Deep analysis.', pricing: { inputPer1M: 1.74, outputPer1M: 3.48 } },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', nimModelId: 'deepseek-ai/deepseek-v4-flash', description: 'Fast DeepSeek.', pricing: { inputPer1M: 0.27, outputPer1M: 1.10 } },
  { id: 'glm-5.1', name: 'GLM-5.1', nimModelId: 'z-ai/glm-5.1', description: 'Strong general model.', pricing: { inputPer1M: 1.40, outputPer1M: 4.40 } },
]

export const DEFAULT_ASSISTANT_MODEL = 'step-3.7-flash'

export function getAssistantModel(id: string): AssistantModelDef | undefined {
  return ASSISTANT_MODELS.find((m) => m.id === id)
}

export function assistantModelOrDefault(id: string | null | undefined): AssistantModelDef {
  return getAssistantModel(id ?? '') ?? getAssistantModel(DEFAULT_ASSISTANT_MODEL)!
}
