import { pgTable, uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users.js'
import { projects } from './projects.js'

// kind:   'prompt_enhance' | 'error_fix' | 'agent_dispatch'
// status: 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
//   prompt_enhance: running -> awaiting_user (result shown) -> completed | cancelled | failed | timeout
//                   (refine: awaiting_user -> running -> awaiting_user)
//   error_fix:      running -> ready (prompt built; client dispatches to agent) -> completed
//                   | cancelled | failed | timeout
//   agent_dispatch: ready (prompt built; handed to agent via /messages claim) -> completed
//                   | cancelled | failed | timeout
//
// varchar (not pgEnum) for forward-compat — mirrors code-reviews.ts and avoids
// the "cannot add enum value" migration pain.
export const nimJobs = pgTable('nim_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  nimModel: varchar('nim_model', { length: 60 }).notNull(),
  agentModel: varchar('agent_model', { length: 100 }),
  style: varchar('style', { length: 40 }),
  inputJson: jsonb('input_json'),
  resultJson: jsonb('result_json'),
  historyJson: jsonb('history_json'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type NimJob = typeof nimJobs.$inferSelect
export type NewNimJob = typeof nimJobs.$inferInsert

export type NimJobKind = 'prompt_enhance' | 'error_fix' | 'agent_dispatch'
export type NimJobStatus =
  | 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
export const NIM_TERMINAL_STATUSES: NimJobStatus[] = ['completed', 'cancelled', 'failed', 'timeout']
