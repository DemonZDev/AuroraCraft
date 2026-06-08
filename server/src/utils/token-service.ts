import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { tokenTransactions, providerApiKeys } from '../db/schema/provider-api-keys.js'
import { eq, sql, and } from 'drizzle-orm'
import { calculateTokenCost, calculateProviderCostUsd, estimateTokens, TOKEN_MULTIPLIER, TOKENS_PER_USD } from '../config/pricing.js'
import type { ModelPricing, UserTier } from '../config/pricing.js'

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

export function estimateMessageCost(inputText: string, pricing: ModelPricing): number {
  const estimatedInput = estimateTokens(inputText)
  const estimatedOutput = estimatedInput * 2
  return calculateTokenCost(estimatedInput, estimatedOutput, pricing)
}

/**
 * Calculate the maximum number of output tokens a user's remaining balance can afford.
 * Reverse-engineers calculateTokenCost() to find the max output tokens for a given budget.
 */
export function calculateMaxOutputTokens(
  remainingTokens: number,
  inputText: string,
  pricing: ModelPricing,
): number {
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
  pricing: ModelPricing,
): number {
  const actualInput = estimateTokens(inputText)
  const actualOutput = estimateTokens(outputText)
  return calculateTokenCost(actualInput, actualOutput, pricing)
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

export function canAccessTier(userTier: UserTier, requiredTier: UserTier): boolean {
  if (userTier === 'paid') return true
  return requiredTier === 'free'
}

// ── Real-time, per-call dual-budget billing (routing.md §8) ──────────────────

export interface RealtimeChargeResult {
  /** AuroraCraft tokens debited from the user (with the 1.2× commission). */
  userTokensCharged: number
  /** Raw provider dollars debited from the serving key (no commission). */
  providerUsd: number
  /** User's token balance after this charge. */
  userBalanceRemaining: number
  /** Serving key's remaining dollar budget (null = unlimited / no key). */
  keyRemainingUsd: number | null
  /** True when this charge exhausted the key (it was auto-disabled). */
  keyExhausted: boolean
  /** True when the user balance is now zero → the run must be stopped. */
  killRun: boolean
}

/**
 * Charge ONE upstream LLM call against both ledgers atomically:
 *  - the user's AuroraCraft token balance (× commission), clamped at zero, and
 *  - the serving API key's dollar limit (raw provider $), auto-disabling it on exhaustion.
 * Both numbers derive from the same real token counts. Returns killRun when the user
 * has run out of credit so the caller can force-stop the agent.
 */
export async function chargeRealtimeUsage(params: {
  userId: string
  keyId?: string | null
  pricing: ModelPricing
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  modelName: string
  providerSlug?: string
  sessionId?: string
}): Promise<RealtimeChargeResult> {
  const { userId, keyId, pricing, inputTokens, outputTokens, cachedTokens, modelName, providerSlug, sessionId } = params
  const providerUsd = calculateProviderCostUsd(inputTokens, outputTokens, pricing, cachedTokens)
  const userTokens = calculateTokenCost(inputTokens, outputTokens, pricing, cachedTokens)

  // 1) User ledger — atomic, clamped at zero; tokensUsed grows by the amount actually taken.
  let userBalanceRemaining: number
  if (userTokens > 0) {
    const [row] = await db
      .update(users)
      .set({
        aiTokens: sql`GREATEST(${users.aiTokens} - ${userTokens}, 0)`,
        tokensUsed: sql`${users.tokensUsed} + LEAST(${userTokens}, ${users.aiTokens})`,
      })
      .where(eq(users.id, userId))
      .returning({ aiTokens: users.aiTokens })
    userBalanceRemaining = row?.aiTokens ?? 0
    await db.insert(tokenTransactions).values({
      userId,
      amount: -userTokens,
      type: 'deduct',
      description: `Realtime usage: ${modelName}${providerSlug ? ` (${providerSlug})` : ''}`,
      sessionId,
    }).catch(() => {})
  } else {
    userBalanceRemaining = await getUserTokens(userId)
  }

  // 2) Key ledger — atomic raw-dollar increment; auto-disable when it reaches its limit.
  let keyRemainingUsd: number | null = null
  let keyExhausted = false
  if (keyId && providerUsd > 0) {
    const [krow] = await db
      .update(providerApiKeys)
      .set({ usedUsd: sql`${providerApiKeys.usedUsd} + ${providerUsd}`, updatedAt: new Date() })
      .where(eq(providerApiKeys.id, keyId))
      .returning({ usedUsd: providerApiKeys.usedUsd, limitUsd: providerApiKeys.limitUsd })
    if (krow) {
      const used = krow.usedUsd ?? 0
      keyRemainingUsd = krow.limitUsd == null ? null : Math.max(0, krow.limitUsd - used)
      if (krow.limitUsd != null && used >= krow.limitUsd) {
        keyExhausted = true
        await db
          .update(providerApiKeys)
          .set({ isActive: false, exhaustedAt: new Date(), updatedAt: new Date() })
          .where(eq(providerApiKeys.id, keyId))
          .catch(() => {})
      }
    }
  }

  return {
    userTokensCharged: userTokens,
    providerUsd,
    userBalanceRemaining,
    keyRemainingUsd,
    keyExhausted,
    killRun: userBalanceRemaining <= 0,
  }
}
