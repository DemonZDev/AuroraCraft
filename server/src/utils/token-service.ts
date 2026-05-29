import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { tokenTransactions, providerApiKeys } from '../db/schema/provider-api-keys.js'
import { eq, sql, and } from 'drizzle-orm'
import type { UserTier, ProviderId } from '../config/ai-models.js'
import { calculateTokenCost, estimateTokens, getModelPricing, TOKEN_MULTIPLIER, TOKENS_PER_USD } from '../config/ai-models.js'
import type { AIModelDef } from '../config/ai-models.js'

/** Minimum token balance required to send messages using premium (paid) models */
export const MIN_PREMIUM_BALANCE = 30

export async function getUserTokens(userId: string): Promise<number> {
  const [user] = await db.select({ aiTokens: users.aiTokens }).from(users).where(eq(users.id, userId)).limit(1)
  return user?.aiTokens ?? 0
}

export async function hasEnoughTokens(userId: string, required: number): Promise<boolean> {
  const balance = await getUserTokens(userId)
  return balance >= required
}

export interface DeductResult {
  success: boolean
  deducted: number
  remainingBalance: number
  balanceExhausted: boolean
}

export async function deductTokens(
  userId: string,
  amount: number,
  description: string,
  sessionId?: string,
): Promise<DeductResult> {
  if (amount <= 0) {
    return { success: true, deducted: 0, remainingBalance: await getUserTokens(userId), balanceExhausted: false }
  }

  // Read current balance with row lock to prevent race conditions
  const [user] = await db
    .select({ aiTokens: users.aiTokens })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const balance = user?.aiTokens ?? 0
  const actualDeduction = Math.min(amount, balance)
  const remainingBalance = balance - actualDeduction
  const balanceExhausted = remainingBalance === 0 && amount > 0

  await db.insert(tokenTransactions).values({
    userId,
    amount: -actualDeduction,
    type: 'deduct',
    description,
    sessionId,
  })

  await db
    .update(users)
    .set({
      aiTokens: remainingBalance,
      tokensUsed: sql`${users.tokensUsed} + ${actualDeduction}`,
    })
    .where(eq(users.id, userId))

  return { success: true, deducted: actualDeduction, remainingBalance, balanceExhausted }
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

/**
 * Calculate the maximum number of output tokens a user's remaining balance can afford.
 * Reverse-engineers calculateTokenCost() to find the max output tokens for a given budget.
 */
export function calculateMaxOutputTokens(
  remainingTokens: number,
  inputText: string,
  model: AIModelDef,
  providerId?: ProviderId,
): number {
  const pricing = getModelPricing(model, providerId)
  if (!pricing || (pricing.inputPer1M === 0 && pricing.outputPer1M === 0)) {
    return Number.MAX_SAFE_INTEGER // Free models: no limit
  }

  const inputTokens = estimateTokens(inputText)
  const inputCostUSD = (inputTokens / 1_000_000) * pricing.inputPer1M

  // Convert remaining token budget back to USD
  const remainingUSD = remainingTokens / TOKEN_MULTIPLIER / TOKENS_PER_USD

  // Subtract input cost from budget
  const outputBudgetUSD = Math.max(0, remainingUSD - inputCostUSD)

  // Convert output budget USD to tokens
  const maxOutputTokens = Math.floor((outputBudgetUSD / pricing.outputPer1M) * 1_000_000)

  // Add a small safety margin (90%) to avoid rounding edge cases
  return Math.max(0, Math.floor(maxOutputTokens * 0.9))
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

export interface ReconcileResult {
  refunded: number
  extraCharged: number
  balanceExhausted: boolean
}

/**
 * Reconcile pre-charged estimated tokens against actual usage.
 * Refunds the difference if actual < estimated, charges additional if actual > estimated
 * (capped at 2x estimate to prevent surprise overcharges from runaway generation).
 * Returns a result indicating whether the balance was exhausted during extra charging.
 */
export async function reconcileTokens(
  userId: string,
  estimatedCost: number,
  actualCost: number,
  modelName: string,
  providerId?: string,
  sessionId?: string,
): Promise<ReconcileResult> {
  const cap = Math.ceil(estimatedCost * 2)
  const clampedActual = Math.min(actualCost, cap)
  let refunded = 0
  let extraCharged = 0
  let balanceExhausted = false

  if (clampedActual < estimatedCost) {
    refunded = estimatedCost - clampedActual
    await refundTokens(
      userId,
      refunded,
      `Refund for ${modelName}${providerId ? ` (${providerId})` : ''}: estimated ${estimatedCost}, actual ${clampedActual}`,
      sessionId,
    )
  } else if (clampedActual > estimatedCost) {
    extraCharged = clampedActual - estimatedCost
    const deductResult = await deductTokens(
      userId,
      extraCharged,
      `Additional charge for ${modelName}${providerId ? ` (${providerId})` : ''}: estimated ${estimatedCost}, actual ${clampedActual}`,
      sessionId,
    )
    balanceExhausted = deductResult.balanceExhausted || deductResult.deducted < extraCharged
    if (balanceExhausted) {
      console.warn(`[TokenService] Balance exhausted for user ${userId} during reconciliation. Requested extra: ${extraCharged}, deducted: ${deductResult.deducted}`)
    }
  }

  return { refunded, extraCharged, balanceExhausted }
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
