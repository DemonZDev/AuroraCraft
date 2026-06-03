// NVIDIA NIM models exposed to the Prompt Enhancer & Error Prompt Maker.
// These are SEPARATE from the OpenCode agent models in config/ai-models.ts.
//
// Slugs + base URL verified 2026-06-02 against the live endpoint
// (GET https://integrate.api.nvidia.com/v1/models). `isReasoning` reflects which
// models emit a separate `reasoning_content` field — verified by test call.
// NOTE: the engine uses generous max_tokens for ALL models, so `isReasoning` is
// informational; reasoning models simply need the headroom to still emit `content`.

export interface NimModel {
  id: string          // stable internal id used by the client + jobs
  label: string       // shown in the picker
  slug: string        // the NIM /v1/models id sent to the API
  isReasoning: boolean // emits reasoning_content separately (verified)
}

// OpenAI-compatible hosted NVIDIA endpoint (verified).
export const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'

export const NIM_MODELS: NimModel[] = [
  { id: 'kimi-k2.6',         label: 'Kimi K2.6',         slug: 'moonshotai/kimi-k2.6',          isReasoning: false },
  { id: 'minimax-m2.7',      label: 'MiniMax M2.7',      slug: 'minimaxai/minimax-m2.7',        isReasoning: false },
  { id: 'step-3.7-flash',    label: 'Step 3.7 Flash',    slug: 'stepfun-ai/step-3.7-flash',     isReasoning: true  },
  { id: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro',   slug: 'deepseek-ai/deepseek-v4-pro',   isReasoning: false },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', slug: 'deepseek-ai/deepseek-v4-flash', isReasoning: false },
  { id: 'glm-5.1',           label: 'GLM-5.1',           slug: 'z-ai/glm-5.1',                  isReasoning: false },
]

export const DEFAULT_NIM_MODEL_ID = 'step-3.7-flash'

export function getNimModel(id: string): NimModel | undefined {
  return NIM_MODELS.find((m) => m.id === id)
}

export function resolveNimModel(id: string | undefined): NimModel {
  return getNimModel(id ?? DEFAULT_NIM_MODEL_ID) ?? NIM_MODELS.find((m) => m.id === DEFAULT_NIM_MODEL_ID)!
}
