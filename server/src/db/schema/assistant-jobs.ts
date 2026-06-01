import { pgTable, uuid, varchar, jsonb, text, timestamp, bigint, index } from 'drizzle-orm/pg-core'
import { projects } from './projects.js'
import { users } from './users.js'
import { agentSessions } from './agent-sessions.js'

/**
 * One row per unit of Assistant work. This table's status state-machine is the
 * single source of truth that lets the UI survive page refresh / tab reopen.
 *
 * kind:   enhance | error_fix | post_session
 * status: queued | running | awaiting_user | done | failed | cancelled | stopped
 */
export const assistantJobs = pgTable(
  'assistant_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => agentSessions.id, { onDelete: 'set null' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    model: varchar('model', { length: 64 }).notNull(),
    input: jsonb('input').notNull(),
    draft: jsonb('draft'),
    result: jsonb('result'),
    error: text('error'),
    estimatedTokens: bigint('estimated_tokens', { mode: 'number' }).default(0),
    inputTokens: bigint('input_tokens', { mode: 'number' }).default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    projectIdx: index('assistant_jobs_project_idx').on(t.projectId),
    activeIdx: index('assistant_jobs_active_idx').on(t.projectId, t.status),
  }),
)

export type AssistantJobRow = typeof assistantJobs.$inferSelect
export type NewAssistantJobRow = typeof assistantJobs.$inferInsert
