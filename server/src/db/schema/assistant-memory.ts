import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { projects } from './projects.js'

/**
 * Rolling, compact per-project memory for the Assistant ("blazing fast" context).
 * One row per project; updated after post-session analysis.
 */
export const assistantMemory = pgTable('assistant_memory', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull().default(''),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type AssistantMemoryRow = typeof assistantMemory.$inferSelect
