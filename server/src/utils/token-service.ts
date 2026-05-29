import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { tokenTransactions, providerApiKeys } from '../db/schema/provider-api-keys.js'
import { eq, sql, and } from 'drizzle-orm'
import type { UserTier, ProviderId } from '../config/ai-models.js'
import { calculateTokenCost, estimateTokens } from '../config/ai-models.js'
import type { AIModelDef } from '../config/ai-models.js'

export async function getUserTokens(userId: string): Promise<number> {
  const [user] = await db.select({ aiTokens: users.aiTokens }).from(users).where(eq(users.id, userId)).limit(1)
  return user?.aiTokens ?? 0
}

export async function hasEnoughTokens(userId: string, required: number): Promise<boolean> {
  const balance = await getUserTokens(userId)
  return balance >= required
}

export async function deductTokens(
  userId: string,
  amount: number,
  description: string,
  sessionId?: string,
): Promise<void> {
  if (amount <= 0) return

  await db.insert(tokenTransactions).values({
    userId,
    amount: -amount,
    type: 'deduct',
    description,
    sessionId,
  })

  await db
    .update(users)
    .set({
      aiTokens: sql`${users.aiTokens} - ${amount}`,
      tokensUsed: sql`${users.tokensUsed} + ${amount}`,
    })
    .where(eq(users.id, userId))
}

export async function grantTokens(
  userId: string,
  amount: number,
  description: string,
  grantedBy?: string,
): Promise<void> {
  if (amount <= 0) return

  await db.insert(tokenTransactions).values({
    userId,
    amount,
    type: 'grant',
    description: `${description}${grantedBy ? ` (by ${grantedBy})` : ''}`,
  })

  await db
    .update(users)
    .set({
      aiTokens: sql`${users.aiTokens} + ${amount}`,
    })
    .where(eq(users.id, userId))
}

export async function refundTokens(
  userId: string,
  amount: number,
  description: string,
  sessionId?: string,
): Promise<void> {
  if (amount <= 0) return

  await db.insert(tokenTransactions).values({
    userId,
    amount,
    type: 'refund',
    description,
    sessionId,
  })

  await db
    .update(users)
    .set({
      aiTokens: sql`${users.aiTokens} + ${amount}`,
      tokensUsed: sql`CASE WHEN ${users.tokensUsed} >= ${amount} THEN ${users.tokensUsed} - ${amount} ELSE 0 END`,
    })
    .where(eq(users.id, userId))
}

export function estimateMessageCost(inputText: string, model: AIModelDef, providerId?: ProviderId): number {
  const estimatedInput = estimateTokens(inputText)
  const estimatedOutput = estimatedInput * 2
  return calculateTokenCost(estimatedInput, estimatedOutput, model, providerId)
}

export function calculateActualCost(
  inputText: string,
  outputText: string,
  model: AIModelDef,
  providerId?: ProviderId,
): number {
  const actualInput = estimateTokens(inputText)
  const actualOutput = estimateTokens(outputText)
  return calculateTokenCost(actualInput, actualOutput, model, providerId)
}

/**
 * Reconcile pre-charged estimated tokens against actual usage.
 * Refunds the difference if actual < estimated, charges additional if actual > estimated
 * (capped at 2x estimate to prevent surprise overcharges from runaway generation).
 */
export async function reconcileTokens(
  userId: string,
  estimatedCost: number,
  actualCost: number,
  modelName: string,
  providerId?: string,
  sessionId?: string,
): Promise<void> {
  const cap = Math.ceil(estimatedCost * 2)
  const clampedActual = Math.min(actualCost, cap)

  if (clampedActual < estimatedCost) {
    const refund = estimatedCost - clampedActual
    await refundTokens(
      userId,
      refund,
      `Refund for ${modelName}${providerId ? ` (${providerId})` : ''}: estimated ${estimatedCost}, actual ${clampedActual}`,
      sessionId,
    )
  } else if (clampedActual > estimatedCost) {
    const extra = clampedActual - estimatedCost
    await deductTokens(
      userId,
      extra,
      `Additional charge for ${modelName}${providerId ? ` (${providerId})` : ''}: estimated ${estimatedCost}, actual ${clampedActual}`,
      sessionId,
    )
  }
}

export function getMinTier(model: AIModelDef): UserTier {
  return model.minTier
}

export function canAccessTier(userTier: UserTier, requiredTier: UserTier): boolean {
  if (userTier === 'paid') return true
  return requiredTier === 'free'
}

export async function getUserProviderKeys(userId: string): Promise<Record<string, string>> {
  const keys = await db
    .select({ provider: providerApiKeys.provider, apiKey: providerApiKeys.apiKey })
    .from(providerApiKeys)
    .where(and(eq(providerApiKeys.userId, userId), eq(providerApiKeys.isActive, true)))
  const result: Record<string, string> = {}
  for (const k of keys) {
    result[k.provider] = k.apiKey
  }
  return result
}
