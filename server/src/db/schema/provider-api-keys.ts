import { pgTable, uuid, varchar, boolean, timestamp, text, bigint } from 'drizzle-orm/pg-core'
import { users } from './users.js'
import { agentSessions } from './agent-sessions.js'

export const providerApiKeys = pgTable('provider_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  apiKey: text('api_key').notNull(),
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
