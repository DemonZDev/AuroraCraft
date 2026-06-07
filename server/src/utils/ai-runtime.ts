// AI Runtime — the single source of truth for providers, models, and per-user keys,
// loaded from the database (replaces the old hardcoded config/ai-models.ts data).
//
// The pure pricing math (calculateTokenCost / TOKEN_MULTIPLIER / estimateTokens) still
// lives in config/ai-models.ts and is reused here; only the *data* moved to the DB.

import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { aiProviders, type AiProvider } from '../db/schema/ai-providers.js'
import { aiModels, type AiModel, type ModelUsage } from '../db/schema/ai-models.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import type { ModelPricing } from '../config/ai-models.js'

export type { ModelUsage } from '../db/schema/ai-models.js'
export type UserTier = 'free' | 'paid'

/** A model row joined with its provider — everything the execution paths need. */
export interface ResolvedModel {
  id: string
  showName: string
  realName: string
  description: string
  usages: ModelUsage[]
  typeTag: string
  weight: number
  isActive: boolean
  pricing: ModelPricing
  provider: {
    id: string
    slug: string
    name: string
    baseUrl: string
    kind: 'openai_compatible' | 'zen'
    isFree: boolean
    isActive: boolean
    isBuiltin: boolean
  }
}

const ALL_USAGES: ModelUsage[] = ['agent', 'prompt_enhancer', 'error_prompt_maker']

/** Normalize the jsonb `usages` column into a clean ModelUsage[]. */
export function parseUsages(raw: unknown): ModelUsage[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((u): u is ModelUsage => typeof u === 'string' && (ALL_USAGES as string[]).includes(u))
}

/** Pricing for a model. Free providers always cost 0 regardless of stored numbers. */
export function pricingOf(model: AiModel, provider: AiProvider): ModelPricing {
  if (provider.isFree) return { inputPer1M: 0, outputPer1M: 0 }
  return {
    inputPer1M: model.inputPer1m,
    outputPer1M: model.outputPer1m,
    cachedInputPer1M: model.cachedInputPer1m ?? undefined,
  }
}

function toResolved(model: AiModel, provider: AiProvider): ResolvedModel {
  return {
    id: model.id,
    showName: model.showName,
    realName: model.realName,
    description: model.description,
    usages: parseUsages(model.usages),
    typeTag: model.typeTag,
    weight: model.weight,
    isActive: model.isActive,
    pricing: pricingOf(model, provider),
    provider: {
      id: provider.id,
      slug: provider.slug,
      name: provider.name,
      baseUrl: provider.baseUrl,
      kind: provider.kind,
      isFree: provider.isFree,
      isActive: provider.isActive,
      isBuiltin: provider.isBuiltin,
    },
  }
}

/** Resolve a single model by its row id (joined with provider). Null if missing. */
export async function resolveModelById(modelId: string): Promise<ResolvedModel | null> {
  if (!modelId) return null
  const [row] = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
    .where(eq(aiModels.id, modelId))
    .limit(1)
  return row ? toResolved(row.model, row.provider) : null
}

/**
 * List models offered for a given surface (usage), gated by tier.
 * Only active models under active providers are returned. Free-tier users
 * see only free-provider models. Sorted by weight (asc), then show name.
 */
export async function listModelsForUsage(usage: ModelUsage, tier: UserTier): Promise<ResolvedModel[]> {
  const rows = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
    .where(and(eq(aiModels.isActive, true), eq(aiProviders.isActive, true)))

  return rows
    .map((r) => toResolved(r.model, r.provider))
    .filter((m) => m.usages.includes(usage))
    .filter((m) => (tier === 'paid' ? true : m.provider.isFree))
    .sort((a, b) => a.weight - b.weight || a.showName.localeCompare(b.showName))
}

/**
 * All active models regardless of tier — used by the LiteLLM config generator
 * so the proxy can route both free and paid OpenAI-compatible providers.
 * Excludes the built-in Zen provider (handled natively by OpenCode).
 */
export async function listModelsForLiteLLM(usage: ModelUsage): Promise<ResolvedModel[]> {
  const rows = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
    .where(and(eq(aiModels.isActive, true), eq(aiProviders.isActive, true)))

  return rows
    .map((r) => toResolved(r.model, r.provider))
    .filter((m) => m.usages.includes(usage))
    .filter((m) => m.provider.kind !== 'zen')
    .filter((m) => !!m.provider.baseUrl)
    .sort((a, b) => a.weight - b.weight || a.showName.localeCompare(b.showName))
}

/** True when a model carries no token cost (its provider is free). */
export function isFreeModel(model: ResolvedModel): boolean {
  return model.provider.isFree
}

/** A free-tier user may only use models whose provider is free. */
export function canUseModel(model: ResolvedModel, tier: UserTier): boolean {
  return tier === 'paid' || model.provider.isFree
}

/**
 * Map of providerSlug → apiKey for a user's active AI-provider keys.
 * (The built-in Zen provider's slug is 'opencode'.)
 */
export async function getUserProviderKeyMap(userId: string): Promise<Record<string, string>> {
  // With multi-key routing a user may hold several keys per provider; this map keeps
  // the single highest-priority USABLE key per slug (for Zen auth.json, the direct
  // provider-config fallback, and "does the user have a key?" checks).
  const rows = await db
    .select({ slug: aiProviders.slug, apiKey: providerApiKeys.apiKey, weight: providerApiKeys.weight, usedUsd: providerApiKeys.usedUsd, limitUsd: providerApiKeys.limitUsd })
    .from(providerApiKeys)
    .innerJoin(aiProviders, eq(providerApiKeys.providerId, aiProviders.id))
    .where(and(eq(providerApiKeys.userId, userId), eq(providerApiKeys.isActive, true)))
  const usable = rows
    .filter((r) => r.limitUsd == null || (r.usedUsd ?? 0) < r.limitUsd)
    .sort((a, b) => a.weight - b.weight)
  const out: Record<string, string> = {}
  for (const r of usable) if (!(r.slug in out)) out[r.slug] = r.apiKey
  return out
}

// ── Multi-key routing (paid providers) — see routing.md §6.2/§7 ──────────────

export interface RoutedKey {
  id: string
  apiKey: string
  weight: number
  limitUsd: number | null
  usedUsd: number
  remainingUsd: number | null // null = unlimited
}

function toRoutedKey(r: { id: string; apiKey: string; weight: number; limitUsd: number | null; usedUsd: number | null }): RoutedKey {
  const used = r.usedUsd ?? 0
  return {
    id: r.id,
    apiKey: r.apiKey,
    weight: r.weight,
    limitUsd: r.limitUsd ?? null,
    usedUsd: used,
    remainingUsd: r.limitUsd == null ? null : Math.max(0, r.limitUsd - used),
  }
}

/** Usable = active, this provider, and (no limit OR not yet spent up). */
function isUsableKeyRow(r: { isActive: boolean | null; limitUsd: number | null; usedUsd: number | null }): boolean {
  return r.isActive === true && (r.limitUsd == null || (r.usedUsd ?? 0) < r.limitUsd)
}

/** Ordered usable keys for one (user, provider): weight asc, then oldest first. */
export async function getRoutedKeysForProvider(userId: string, providerId: string): Promise<RoutedKey[]> {
  const rows = await db
    .select()
    .from(providerApiKeys)
    .where(and(eq(providerApiKeys.userId, userId), eq(providerApiKeys.providerId, providerId)))
  return rows
    .filter(isUsableKeyRow)
    .sort((a, b) => (a.weight - b.weight) || ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)))
    .map(toRoutedKey)
}

/** providerId → ordered usable keys, for building the whole LiteLLM config in one query. */
export async function getUserRoutedKeysByProvider(userId: string): Promise<Record<string, RoutedKey[]>> {
  const rows = await db
    .select()
    .from(providerApiKeys)
    .where(eq(providerApiKeys.userId, userId))
  const usable = rows
    .filter((r) => !!r.providerId && isUsableKeyRow(r))
    .sort((a, b) => (a.weight - b.weight) || ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)))
  const out: Record<string, RoutedKey[]> = {}
  for (const r of usable) (out[r.providerId!] ??= []).push(toRoutedKey(r))
  return out
}

/** Map of mcpId → apiKey for a user's active MCP keys. */
export async function getUserMcpKeyMap(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ mcpId: providerApiKeys.mcpId, apiKey: providerApiKeys.apiKey })
    .from(providerApiKeys)
    .where(and(eq(providerApiKeys.userId, userId), eq(providerApiKeys.isActive, true)))
  const out: Record<string, string> = {}
  for (const r of rows) if (r.mcpId) out[r.mcpId] = r.apiKey
  return out
}
