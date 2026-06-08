import { pgTable, uuid, varchar, text, boolean, integer, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { aiProviders } from './ai-providers.js'

// Where a model may be offered. A model can serve more than one surface.
export type ModelUsage = 'agent' | 'prompt_enhancer' | 'error_prompt_maker'

export const aiModels = pgTable('ai_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').notNull().references(() => aiProviders.id, { onDelete: 'cascade' }),
  // What the user sees, e.g. "GLM-5.1". The same show name may exist on multiple
  // providers — the type_tag disambiguates which one a user actually picks.
  showName: varchar('show_name', { length: 100 }).notNull(),
  // Upstream model id sent to the provider, e.g. accounts/fireworks/models/glm-5p1.
  realName: varchar('real_name', { length: 200 }).notNull(),
  description: text('description').notNull().default(''),
  // string[] subset of ModelUsage. jsonb (matches code-reviews/prompt-tool-jobs precedent);
  // filtered in JS since the model set is small + admin-curated.
  usages: jsonb('usages').notNull().default([]),
  // Discriminator across same-show-name models, e.g. "fast" / "slow".
  typeTag: varchar('type_tag', { length: 40 }).notNull().default(''),
  // Lower = higher in the selector.
  weight: integer('weight').notNull().default(100),
  // Per-1M-token pricing. Only meaningful when the provider is paid; ignored for free providers.
  inputPer1m: doublePrecision('input_per_1m').notNull().default(0),
  outputPer1m: doublePrecision('output_per_1m').notNull().default(0),
  cachedInputPer1m: doublePrecision('cached_input_per_1m'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type AiModel = typeof aiModels.$inferSelect
export type NewAiModel = typeof aiModels.$inferInsert
