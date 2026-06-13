import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'

// Admin-editable legal documents. Two seeded slugs at launch: `privacy` and
// `terms`. Content is Markdown (rendered with react-markdown + remark-gfm on
// the client). The slug is the stable public identifier; admins only edit
// title / content / version / effectiveDate.
//
// Idempotent migrations (see CLAUDE.md → "Drizzle Migration Tracking Drift")
// seed defaults via `INSERT ... ON CONFLICT DO NOTHING` so the rows exist
// even on databases that were migrated outside the Drizzle tracker.
export const legalDocuments = pgTable(
  'legal_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stable URL slug, e.g. 'privacy' | 'terms'. Lowercase, kebab-case.
    slug: text('slug').notNull().unique(),
    // Display title, e.g. "Privacy Policy" / "Terms of Service".
    title: text('title').notNull(),
    // Markdown source — stored as text so the admin edits the source, the
    // public page renders it. react-markdown escapes HTML by default.
    content: text('content').notNull(),
    // Document version, e.g. "1.0.0". Free-form string so admins can use
    // semver or a date-based scheme.
    version: text('version').notNull().default('1.0.0'),
    // When the current version became effective. The public page surfaces
    // "Effective <date>" and the admin editor lets you set this to the day
    // a revision was published.
    effectiveDate: timestamp('effective_date', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: index('legal_documents_slug_idx').on(t.slug),
  }),
)

export type LegalDocument = typeof legalDocuments.$inferSelect
export type NewLegalDocument = typeof legalDocuments.$inferInsert
