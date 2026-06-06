// Pure pricing math for AuroraCraft's token economy.
//
// The provider/model *data* now lives in the database (see utils/ai-runtime.ts and the
// ai_providers / ai_models tables). This file keeps only the provider-agnostic pricing
// helpers, which are reused by token-service.ts and litellm-config.ts.

export type Speed = 'fast' | 'slow' | 'rate_limited'
export type UserTier = 'free' | 'paid'

export interface ModelPricing {
  inputPer1M: number
  cachedInputPer1M?: number
  outputPer1M: number
}

export const TOKEN_MULTIPLIER = 1.2
export const TOKENS_PER_USD = 1000

/**
 * Total AuroraCraft token cost for a request, given the model's pricing.
 * $1 = 1000 tokens, with a 20% platform commission (TOKEN_MULTIPLIER).
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
  cachedInputTokens?: number,
): number {
  const uncachedInputTokens = Math.max(0, inputTokens - (cachedInputTokens ?? 0))
  const inputCost = (uncachedInputTokens / 1_000_000) * pricing.inputPer1M
  const cachedCost = cachedInputTokens && pricing.cachedInputPer1M
    ? (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M
    : 0
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M
  const totalCost = (inputCost + cachedCost + outputCost) * TOKEN_MULTIPLIER * TOKENS_PER_USD
  return Math.ceil(totalCost)
}

/** Rough token estimate from text length (≈4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
