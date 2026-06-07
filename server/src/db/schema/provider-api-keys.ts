import { pgTable, uuid, varchar, boolean, timestamp, text, bigint, integer, doublePrecision } from 'drizzle-orm/pg-core'
import { users } from './users.js'
import { agentSessions } from './agent-sessions.js'
import { aiProviders } from './ai-providers.js'
import { mcps } from './mcps.js'

// A per-user secret. Exactly one of (providerId, mcpId) identifies what it unlocks:
//   providerId → an AI model provider's API key (used to call its models)
//   mcpId      → an `api`-type MCP's API key (substituted for `MCP-API-Key`)
// `provider` (legacy string) is kept nullable for backward-compat with pre-migration rows.
export const providerApiKeys = pgTable('provider_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: varchar('provider', { length: 50 }),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'cascade' }),
  mcpId: uuid('mcp_id').references(() => mcps.id, { onDelete: 'cascade' }),
  apiKey: text('api_key').notNull(),
  // ── Multi-key routing fields (paid providers only; see routing.md) ──
  // Admin label to tell a user's keys apart, e.g. "Fireworks #4 — $6 card".
  label: varchar('label', { length: 100 }),
  // Lower weight = higher priority. Primary first, then fallbacks in weight order.
  weight: integer('weight').notNull().default(100),
  // Provider-dollar budget allotted to this key. null = unlimited.
  limitUsd: doublePrecision('limit_usd'),
  // Live accumulated provider spend (raw $, no commission). remaining = limitUsd - usedUsd.
  usedUsd: doublePrecision('used_usd').notNull().default(0),
  // Set when usedUsd >= limitUsd auto-disables the key (distinguishes auto-exhausted from admin-disabled).
  exhaustedAt: timestamp('exhausted_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type ProviderApiKey = typeof providerApiKeys.$inferSelect
export type NewProviderApiKey = typeof providerApiKeys.$inferInsert

export const tokenTransactions = pgTable('token_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  description: text('description'),
  sessionId: uuid('session_id').references(() => agentSessions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type TokenTransaction = typeof tokenTransactions.$inferSelect
export type NewTokenTransaction = typeof tokenTransactions.$inferInsert
