import { pgTable, uuid, varchar, pgEnum, timestamp, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const agentStatusEnum = pgEnum('agent_status', ['idle', 'running', 'completed', 'failed', 'cancelled'])

export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: agentStatusEnum('status').default('idle').notNull(),
  opencodeSessionId: varchar('opencode_session_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('agent_sessions_project_id_idx').on(table.projectId),
])

export type AgentSession = typeof agentSessions.$inferSelect
export type NewAgentSession = typeof agentSessions.$inferInsert
