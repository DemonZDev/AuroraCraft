import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'
import { projects } from './projects'

export const projectViews = pgTable('project_views', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: { columns: [table.userId, table.projectId] },
}))

export type ProjectView = typeof projectViews.$inferSelect
export type NewProjectView = typeof projectViews.$inferInsert
