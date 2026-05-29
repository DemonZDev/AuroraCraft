import { pgTable, uuid, varchar, pgEnum, timestamp, text, boolean, bigint } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('user_role', ['user', 'admin'])
export const tierEnum = pgEnum('user_tier', ['free', 'paid'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: roleEnum('role').default('user').notNull(),
  tier: tierEnum('tier').default('free').notNull(),
  aiTokens: bigint('ai_tokens', { mode: 'number' }).default(0),
  tokensUsed: bigint('tokens_used', { mode: 'number' }).default(0),
  githubAccessToken: text('github_access_token'),
  githubUsername: varchar('github_username', { length: 255 }),
  githubConnectedAt: timestamp('github_connected_at', { withTimezone: true }),
  coderabbitEnabled: boolean('coderabbit_enabled').default(false),
  coderabbitGrantedBy: uuid('coderabbit_granted_by').references((): any => users.id),
  coderabbitGrantedAt: timestamp('coderabbit_granted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
