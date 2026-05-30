import { pgTable, uuid, varchar, text, pgEnum, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const projectStatusEnum = pgEnum('project_status', ['active', 'archived'])
export const languageEnum = pgEnum('project_language', ['java', 'kotlin'])
export const compilerEnum = pgEnum('project_compiler', ['maven', 'gradle', 'both'])
export const visibilityEnum = pgEnum('project_visibility', ['public', 'private'])
export const bridgeEnum = pgEnum('project_bridge', ['opencode', 'kiro'])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  linkId: varchar('link_id', { length: 128 }).unique(),
  description: text('description'),
  logo: text('logo'),
  versions: text('versions'),
  layoutMode: varchar('layout_mode', { length: 16 }).default('chat-first').notNull(),
  status: projectStatusEnum('status').default('active').notNull(),
  software: varchar('software', { length: 64 }).default('paper').notNull(),
  language: languageEnum('language').default('java').notNull(),
  javaVersion: varchar('java_version', { length: 8 }).default('21').notNull(),
  compiler: compilerEnum('compiler').default('gradle').notNull(),
  bridge: bridgeEnum('bridge').default('opencode').notNull(),
  visibility: visibilityEnum('visibility').default('private').notNull(),
  forkedFrom: uuid('forked_from').references((): any => projects.id, { onDelete: 'set null' }),
  repoUrl: text('repo_url'),
  repoBranch: varchar('repo_branch', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
