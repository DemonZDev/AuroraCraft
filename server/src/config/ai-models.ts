export type ProviderId = 'fireworks' | 'bluesminds' | 'modal' | 'opencode' | 'zen'
export type Speed = 'fast' | 'slow' | 'rate_limited'
export type UserTier = 'free' | 'paid'

export interface ModelProvider {
  id: ProviderId
  speed: Speed
  modelId: string
  baseUrl?: string
  npmPackage?: string
  requiresApiKey: boolean
}

export interface AIModelDef {
  id: string
  name: string
  providers: ModelProvider[]
  description: string
  pricing: {
    inputPer1M: number
    outputPer1M: number
  }
  minTier: UserTier
}

export const PROVIDER_CONFIG: Record<ProviderId, { name: string; baseUrl: string; npmPackage: string }> = {
  fireworks: {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    npmPackage: '@ai-sdk/openai-compatible',
  },
  bluesminds: {
    name: 'Bluesminds',
    baseUrl: 'https://api.bluesminds.com/v1',
    npmPackage: '@ai-sdk/openai-compatible',
  },
  modal: {
    name: 'Modal',
    baseUrl: 'https://api.us-west-2.modal.direct/v1',
    npmPackage: '@ai-sdk/openai-compatible',
  },
  opencode: {
    name: 'OpenCode',
    baseUrl: '',
    npmPackage: '',
  },
  zen: {
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1/chat/completions',
    npmPackage: '@ai-sdk/openai-compatible',
  },
}

export const TOKEN_MULTIPLIER = 1.2
export const TOKENS_PER_USD = 1000

export function calculateTokenCost(inputTokens: number, outputTokens: number, model: AIModelDef): number {
  const inputCost = (inputTokens / 1_000_000) * model.pricing.inputPer1M
  const outputCost = (outputTokens / 1_000_000) * model.pricing.outputPer1M
  const totalCost = (inputCost + outputCost) * TOKEN_MULTIPLIER * TOKENS_PER_USD
  return Math.ceil(totalCost)
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export const AI_MODELS: AIModelDef[] = [
  {
    id: 'glm-5.1',
    name: 'GLM-5.1',
    providers: [
      { id: 'fireworks', speed: 'fast', modelId: 'accounts/fireworks/models/glm-5p1', requiresApiKey: true },
    ],
    description: 'Zhipu GLM-5.1 frontier model (premium)',
    pricing: { inputPer1M: 1.4, outputPer1M: 4.4 },
    minTier: 'paid',
  },
  {
    id: 'glm-5.1-free',
    name: 'GLM-5.1',
    providers: [
      { id: 'modal', speed: 'rate_limited', modelId: 'zai-org/GLM-5.1-FP8', requiresApiKey: true },
    ],
    description: 'Zhipu GLM-5.1 frontier model (free, rate-limited)',
    pricing: { inputPer1M: 0, outputPer1M: 0 },
    minTier: 'free',
  },
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    providers: [
      { id: 'fireworks', speed: 'fast', modelId: 'accounts/fireworks/models/kimi-k2p6', requiresApiKey: true },
      { id: 'bluesminds', speed: 'slow', modelId: 'moonshotai/kimi-k2.6', requiresApiKey: true },
    ],
    description: 'Moonshot Kimi K2.6 - SOTA coding and agentic performance',
    pricing: { inputPer1M: 0.95, outputPer1M: 4.0 },
    minTier: 'paid',
  },
  {
    id: 'qwen3.6-plus',
    name: 'Qwen3.6 Plus',
    providers: [
      { id: 'fireworks', speed: 'fast', modelId: 'accounts/fireworks/models/qwen3p6-plus', requiresApiKey: true },
      { id: 'bluesminds', speed: 'slow', modelId: 'qwen3.6-plus', requiresApiKey: true },
    ],
    description: 'Alibaba Qwen3.6 Plus - Multilingual and coding',
    pricing: { inputPer1M: 0.5, outputPer1M: 3.0 },
    minTier: 'paid',
  },
  {
    id: 'minimax-m2.7',
    name: 'MiniMax M2.7',
    providers: [
      { id: 'fireworks', speed: 'fast', modelId: 'accounts/fireworks/models/minimax-m2p7', requiresApiKey: true },
    ],
    description: 'MiniMax M2.7 - Agentic coding specialist',
    pricing: { inputPer1M: 0.3, outputPer1M: 1.2 },
    minTier: 'paid',
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    providers: [
      { id: 'fireworks', speed: 'fast', modelId: 'accounts/fireworks/models/deepseek-v4-pro', requiresApiKey: true },
      { id: 'bluesminds', speed: 'slow', modelId: 'accounts/fireworks/models/deepseek-v4-pro', requiresApiKey: true },
    ],
    description: 'DeepSeek V4 Pro with selectable thinking mode',
    pricing: { inputPer1M: 1.74, outputPer1M: 3.48 },
    minTier: 'paid',
  },
  {
    id: 'qwen3.6-max',
    name: 'Qwen3.6 Max',
    providers: [
      { id: 'bluesminds', speed: 'slow', modelId: 'qwen3.6-max-preview', requiresApiKey: true },
    ],
    description: 'Alibaba Qwen3.6 Max - Enhanced reasoning',
    pricing: { inputPer1M: 1.0, outputPer1M: 3.2 },
    minTier: 'paid',
  },
  {
    id: 'opencode-deepseek-v4-flash-free',
    name: 'DeepSeek V4 Flash',
    providers: [
      { id: 'opencode', speed: 'fast', modelId: 'opencode/deepseek-v4-flash-free', requiresApiKey: false },
      { id: 'zen', speed: 'fast', modelId: 'deepseek-v4-flash-free', requiresApiKey: true },
    ],
    description: 'Fast free coding model with strong reasoning',
    pricing: { inputPer1M: 0, outputPer1M: 0 },
    minTier: 'free',
  },
  {
    id: 'opencode-nemotron-3-super-free',
    name: 'Nemotron 3 Super',
    providers: [
      { id: 'opencode', speed: 'fast', modelId: 'opencode/nemotron-3-super-free', requiresApiKey: false },
      { id: 'zen', speed: 'fast', modelId: 'nemotron-3-super-free', requiresApiKey: true },
    ],
    description: 'NVIDIA free model optimized for coding',
    pricing: { inputPer1M: 0, outputPer1M: 0 },
    minTier: 'free',
  },
  {
    id: 'opencode-big-pickle',
    name: 'Big Pickle',
    providers: [
      { id: 'opencode', speed: 'fast', modelId: 'opencode/big-pickle', requiresApiKey: false },
      { id: 'zen', speed: 'fast', modelId: 'big-pickle', requiresApiKey: true },
    ],
    description: 'Free general-purpose AI for coding tasks',
    pricing: { inputPer1M: 0, outputPer1M: 0 },
    minTier: 'free',
  },
]

export function getModelById(id: string): AIModelDef | undefined {
  return AI_MODELS.find(m => m.id === id)
}

export function getProviderForModel(modelId: string, speed: Speed, availableKeys?: Record<string, string>): ModelProvider | undefined {
  const model = getModelById(modelId)
  if (!model) return undefined
  const matching = model.providers.filter(p => p.speed === speed)
  if (matching.length > 0) {
    if (matching.length <= 1) return matching[0]
    const hasKeyProvider = matching.find(p => p.requiresApiKey && availableKeys?.[p.id])
    return hasKeyProvider ?? matching[0]
  }
  // Fallback: if no exact speed match, try any provider for this model
  if (model.providers.length > 0) {
    if (model.providers.length <= 1) return model.providers[0]
    const hasKeyProvider = model.providers.find(p => p.requiresApiKey && availableKeys?.[p.id])
    return hasKeyProvider ?? model.providers[0]
  }
  return undefined
}

export function getAvailableModels(tier: UserTier): AIModelDef[] {
  return AI_MODELS.filter(m => {
    if (tier === 'paid') return true
    return m.minTier === 'free'
  })
}

export function canUseModel(modelId: string, tier: UserTier): boolean {
  const model = getModelById(modelId)
  if (!model) return false
  if (tier === 'paid') return true
  return model.minTier === 'free'
}

export function modelHasZenProvider(modelId: string): boolean {
  const model = getModelById(modelId)
  if (!model) return false
  return model.providers.some(p => p.id === 'zen')
}
