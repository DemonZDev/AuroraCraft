import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'

// non_api — the MCP needs no per-user secret; its config is used verbatim.
// api     — the config contains the literal placeholder `MCP-API-Key`, replaced
//           at registration time with the requesting user's stored MCP key.
export const mcpApiTypeEnum = pgEnum('mcp_api_type', ['non_api', 'api'])

export const mcps = pgTable('mcps', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Admin-facing label only (e.g. "Firecrawl"); not shown to end users.
  name: varchar('name', { length: 100 }).notNull(),
  // Raw OpenCode MCP server config JSON (the value POSTed to OpenCode's /mcp).
  config: text('config').notNull(),
  apiType: mcpApiTypeEnum('api_type').notNull().default('non_api'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Mcp = typeof mcps.$inferSelect
export type NewMcp = typeof mcps.$inferInsert
