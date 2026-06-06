import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'

// How AuroraCraft talks to a provider:
//   openai_compatible — a normal OpenAI-compatible REST endpoint (admin-added)
//   zen               — built-in OpenCode Zen (auth.json + `opencode/<id>` ids, no base URL)
export const aiProviderKindEnum = pgEnum('ai_provider_kind', ['openai_compatible', 'zen'])

export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Human label shown in the admin panel, e.g. "Fireworks AI".
  name: varchar('name', { length: 100 }).notNull(),
  // Machine id used in OpenCode/LiteLLM configs and per-user key rows. Derived from name on create.
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  // OpenAI-compatible base URL. Empty for the built-in Zen provider.
  baseUrl: text('base_url').notNull().default(''),
  kind: aiProviderKindEnum('kind').notNull().default('openai_compatible'),
  // free  → models cost 0 tokens and any user may hold its key
  // paid  → models bill tokens; only paid users may hold its key
  isFree: boolean('is_free').notNull().default(false),
  // Disabling a provider hides ALL its models from every selector, regardless of model state.
  isActive: boolean('is_active').notNull().default(true),
  // Built-in (Zen): cannot be deleted and its endpoint/kind cannot be edited.
  isBuiltin: boolean('is_builtin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type AiProvider = typeof aiProviders.$inferSelect
export type NewAiProvider = typeof aiProviders.$inferInsert
