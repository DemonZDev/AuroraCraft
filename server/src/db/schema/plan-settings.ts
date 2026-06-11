import { pgTable, uuid, integer, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core'

// One feature row in the Free/Pro comparison shown on the pricing page.
export interface PlanFeature {
  label: string
  free: boolean
  pro: boolean
}

// Single-row table (enforced by the API, like a key-value settings record):
// admins edit plan pricing + the feature matrix at runtime from Admin Panel → Plans.
export const planSettings = pgTable('plan_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Current Pro price in USD per month.
  proPriceUsd: doublePrecision('pro_price_usd').notNull().default(5),
  // Strikethrough "was" price; the discount % is derived from the two prices.
  proOriginalPriceUsd: doublePrecision('pro_original_price_usd').notNull().default(12.5),
  // Tokens included with a Pro subscription each month.
  proMonthlyTokens: integer('pro_monthly_tokens').notNull().default(5000),
  // Additional token top-ups: USD per 1000 tokens.
  tokenPricePer1kUsd: doublePrecision('token_price_per_1k_usd').notNull().default(1),
  // PlanFeature[] — jsonb (matches ai-models.usages precedent); small, admin-curated.
  features: jsonb('features').notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type PlanSettings = typeof planSettings.$inferSelect
export type NewPlanSettings = typeof planSettings.$inferInsert
