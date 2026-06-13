import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { legalDocuments, type LegalDocument } from '../db/schema/legal-documents.js'
import { authMiddleware, adminGuard } from '../middleware/auth.js'

// Public documents are public — `slug` is part of the URL and we look the
// row up by it. An unknown slug is a 404, not a 500.
const slugParam = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Invalid slug'),
})

// Admin update — content is the only field that is actually required; the
// other fields are optional and fall back to the existing value.
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(200_000).optional(),
  version: z.string().min(1).max(32).optional(),
  effectiveDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.date().optional()),
})

function serialize(row: LegalDocument) {
  return {
    slug: row.slug,
    title: row.title,
    content: row.content,
    version: row.version,
    effectiveDate: row.effectiveDate.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function legalRoutes(app: FastifyInstance) {
  // Public — powers /privacy and /terms. Cached at the edge by Vite/Static
  // with a short TTL once we add it; for now it's just plain HTTP.
  app.get('/api/legal/:slug', async (request, reply) => {
    const parsed = slugParam.safeParse(request.params)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid slug' })
    }
    const [row] = await db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.slug, parsed.data.slug))
      .limit(1)
    if (!row) {
      return reply.status(404).send({ message: 'Document not found' })
    }
    return serialize(row)
  })

  // Admin — list all editable documents.
  app.get(
    '/api/admin/legal',
    { preHandler: [authMiddleware, adminGuard] },
    async () => {
      const rows = await db.select().from(legalDocuments).orderBy(legalDocuments.slug)
      return rows.map(serialize)
    },
  )

  // Admin — single document (same payload shape as the public endpoint; kept
  // separate so the admin UI can show draft / in-review state in the future
  // without leaking it to anonymous visitors).
  app.get(
    '/api/admin/legal/:slug',
    { preHandler: [authMiddleware, adminGuard] },
    async (request, reply) => {
      const parsed = slugParam.safeParse(request.params)
      if (!parsed.success) {
        return reply.status(400).send({ message: 'Invalid slug' })
      }
      const [row] = await db
        .select()
        .from(legalDocuments)
        .where(eq(legalDocuments.slug, parsed.data.slug))
        .limit(1)
      if (!row) {
        return reply.status(404).send({ message: 'Document not found' })
      }
      return serialize(row)
    },
  )

  // Admin — update. Body is partial; missing fields are left as-is. The
  // slug is immutable (the URL is the public contract; renaming it would
  // break /privacy and /terms and 404 visitors).
  app.patch(
    '/api/admin/legal/:slug',
    { preHandler: [authMiddleware, adminGuard] },
    async (request, reply) => {
      const parsed = slugParam.safeParse(request.params)
      if (!parsed.success) {
        return reply.status(400).send({ message: 'Invalid slug' })
      }
      const body = updateSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ message: body.error.issues[0]?.message ?? 'Invalid body' })
      }
      const patch: Partial<LegalDocument> = { updatedAt: new Date() }
      if (body.data.title !== undefined) patch.title = body.data.title
      if (body.data.content !== undefined) patch.content = body.data.content
      if (body.data.version !== undefined) patch.version = body.data.version
      if (body.data.effectiveDate !== undefined) {
        patch.effectiveDate =
          body.data.effectiveDate instanceof Date
            ? body.data.effectiveDate
            : new Date(body.data.effectiveDate)
      }
      const [updated] = await db
        .update(legalDocuments)
        .set(patch)
        .where(eq(legalDocuments.slug, parsed.data.slug))
        .returning()
      if (!updated) {
        return reply.status(404).send({ message: 'Document not found' })
      }
      return serialize(updated)
    },
  )
}
