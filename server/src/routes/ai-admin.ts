import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { aiProviders } from '../db/schema/ai-providers.js'
import { aiModels } from '../db/schema/ai-models.js'
import { mcps } from '../db/schema/mcps.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import { authMiddleware, adminGuard } from '../middleware/auth.js'
import { parseUsages, type ModelUsage } from '../utils/ai-runtime.js'
import { MCP_API_PLACEHOLDER } from '../utils/mcp-runtime.js'

const USAGES: ModelUsage[] = ['agent', 'prompt_enhancer', 'error_prompt_maker']

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'provider'
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let n = 1
  // Loop is bounded in practice (collisions are rare); each iteration adds a suffix.
  for (;;) {
    const [existing] = await db.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.slug, slug)).limit(1)
    if (!existing) return slug
    slug = `${base}-${n++}`
  }
}

/**
 * Enforce: within the same (show_name, overlapping usage), the type_tag must be unique
 * and the weight must be unique. Returns a human message on conflict, else null.
 */
async function modelConflict(
  showName: string,
  usages: ModelUsage[],
  typeTag: string,
  weight: number,
  excludeId?: string,
): Promise<string | null> {
  const siblings = await db.select().from(aiModels).where(eq(aiModels.showName, showName))
  for (const s of siblings) {
    if (excludeId && s.id === excludeId) continue
    const sUsages = parseUsages(s.usages)
    if (!usages.some((u) => sUsages.includes(u))) continue // no overlapping surface
    if (s.typeTag === typeTag) {
      return `Another "${showName}" with the same usage already uses the tag "${typeTag || '(none)'}". Choose a different tag.`
    }
    if (s.weight === weight) {
      return `Another "${showName}" with the same usage already uses weight ${weight}. Choose a different weight.`
    }
  }
  return null
}

const providerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().min(1).max(500),
  isFree: z.boolean().optional(),
})
const providerUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().min(1).max(500).optional(),
  isFree: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const modelBodySchema = z.object({
  providerId: z.string().uuid(),
  showName: z.string().min(1).max(100),
  realName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  usages: z.array(z.enum(['agent', 'prompt_enhancer', 'error_prompt_maker'])).min(1),
  typeTag: z.string().max(40).optional(),
  weight: z.number().int().min(0).max(100000),
  inputPer1m: z.number().min(0).optional(),
  outputPer1m: z.number().min(0).optional(),
  cachedInputPer1m: z.number().min(0).nullable().optional(),
})
const modelUpdateSchema = modelBodySchema.partial().extend({
  isActive: z.boolean().optional(),
})

const mcpBodySchema = z.object({
  name: z.string().min(1).max(100),
  config: z.string().min(2).max(20000),
  apiType: z.enum(['non_api', 'api']),
})
const mcpUpdateSchema = mcpBodySchema.partial().extend({
  isActive: z.boolean().optional(),
})

/** Validate the MCP config string: must be a JSON object; api type must include the placeholder. */
function validateMcpConfig(config: string, apiType: 'non_api' | 'api'): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(config)
  } catch {
    return 'Config must be valid JSON.'
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Config must be a JSON object.'
  }
  if (apiType === 'api' && !config.includes(MCP_API_PLACEHOLDER)) {
    return `An "API" MCP config must contain the literal ${MCP_API_PLACEHOLDER} placeholder.`
  }
  return null
}

export async function aiAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', adminGuard)

  // ── Providers ─────────────────────────────────────────────────────────
  app.get('/api/admin/ai/providers', async () => {
    const rows = await db.select().from(aiProviders).orderBy(asc(aiProviders.name))
    return rows
  })

  app.post('/api/admin/ai/providers', async (request, reply) => {
    const parsed = providerCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    const slug = await uniqueSlug(slugify(parsed.data.name))
    const [row] = await db.insert(aiProviders).values({
      name: parsed.data.name.trim(),
      slug,
      baseUrl: parsed.data.baseUrl.trim(),
      kind: 'openai_compatible',
      isFree: parsed.data.isFree ?? false,
      isActive: true,
      isBuiltin: false,
    }).returning()
    return reply.status(201).send(row)
  })

  app.patch('/api/admin/ai/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = providerUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'Provider not found', statusCode: 404 })

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim()
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive
    // Built-in (Zen): endpoint + free/paid mode are locked; only name + active state can change.
    let prunedToFree = false
    if (!existing.isBuiltin) {
      if (parsed.data.baseUrl !== undefined) updates.baseUrl = parsed.data.baseUrl.trim()
      if (parsed.data.isFree !== undefined) {
        updates.isFree = parsed.data.isFree
        // paid → free: a free provider allows only ONE key per user (routing.md §6.3).
        // Destructively prune every user's keys for this provider down to the single
        // highest-priority one (lowest weight, oldest as tie-break).
        prunedToFree = parsed.data.isFree === true && existing.isFree === false
      }
    }
    await db.update(aiProviders).set(updates).where(eq(aiProviders.id, id))

    if (prunedToFree) {
      const keys = await db.select().from(providerApiKeys).where(eq(providerApiKeys.providerId, id))
      const byUser = new Map<string, typeof keys>()
      for (const k of keys) {
        const arr = byUser.get(k.userId) ?? []
        arr.push(k)
        byUser.set(k.userId, arr)
      }
      const toDelete: string[] = []
      for (const arr of byUser.values()) {
        if (arr.length <= 1) continue
        arr.sort((a, b) => (a.weight - b.weight) || ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)))
        // Keep arr[0] (highest priority); reset its routing fields so it's a clean free key.
        await db.update(providerApiKeys)
          .set({ isActive: true, exhaustedAt: null, weight: 100, limitUsd: null, usedUsd: 0, label: null, updatedAt: new Date() })
          .where(eq(providerApiKeys.id, arr[0].id))
        for (let i = 1; i < arr.length; i++) toDelete.push(arr[i].id)
      }
      if (toDelete.length) await db.delete(providerApiKeys).where(inArray(providerApiKeys.id, toDelete))
      app.log.info({ providerId: id, removed: toDelete.length }, 'Provider switched to free — pruned extra per-user keys')
    }
    return { success: true }
  })

  app.delete('/api/admin/ai/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'Provider not found', statusCode: 404 })
    if (existing.isBuiltin) return reply.status(403).send({ message: 'The built-in provider cannot be deleted.', statusCode: 403 })
    // Cascade removes its models and every user's key for it (FK ON DELETE CASCADE).
    await db.delete(aiProviders).where(eq(aiProviders.id, id))
    return { success: true }
  })

  // ── Models ────────────────────────────────────────────────────────────
  app.get('/api/admin/ai/models', async () => {
    const rows = await db
      .select({ model: aiModels, providerName: aiProviders.name, providerSlug: aiProviders.slug, providerIsFree: aiProviders.isFree, providerIsActive: aiProviders.isActive })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .orderBy(asc(aiModels.weight), asc(aiModels.showName))
    return rows.map((r) => ({
      ...r.model,
      usages: parseUsages(r.model.usages),
      providerName: r.providerName,
      providerSlug: r.providerSlug,
      providerIsFree: r.providerIsFree,
      providerIsActive: r.providerIsActive,
    }))
  })

  app.post('/api/admin/ai/models', async (request, reply) => {
    const parsed = modelBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    const d = parsed.data

    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, d.providerId)).limit(1)
    if (!provider) return reply.status(400).send({ message: 'Provider not found', statusCode: 400 })

    const typeTag = (d.typeTag ?? '').trim()
    const conflict = await modelConflict(d.showName.trim(), d.usages, typeTag, d.weight)
    if (conflict) return reply.status(409).send({ message: conflict, statusCode: 409 })

    // Pricing only applies to paid providers; free providers always cost 0.
    const paid = !provider.isFree
    const [row] = await db.insert(aiModels).values({
      providerId: d.providerId,
      showName: d.showName.trim(),
      realName: d.realName.trim(),
      description: d.description?.trim() ?? '',
      usages: d.usages,
      typeTag,
      weight: d.weight,
      inputPer1m: paid ? (d.inputPer1m ?? 0) : 0,
      outputPer1m: paid ? (d.outputPer1m ?? 0) : 0,
      cachedInputPer1m: paid ? (d.cachedInputPer1m ?? null) : null,
      isActive: true,
    }).returning()
    return reply.status(201).send(row)
  })

  app.patch('/api/admin/ai/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = modelUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    const d = parsed.data

    const [existing] = await db.select().from(aiModels).where(eq(aiModels.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'Model not found', statusCode: 404 })

    const providerId = d.providerId ?? existing.providerId
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1)
    if (!provider) return reply.status(400).send({ message: 'Provider not found', statusCode: 400 })

    const showName = (d.showName ?? existing.showName).trim()
    const usages = d.usages ?? parseUsages(existing.usages)
    const typeTag = (d.typeTag ?? existing.typeTag).trim()
    const weight = d.weight ?? existing.weight
    const conflict = await modelConflict(showName, usages, typeTag, weight, id)
    if (conflict) return reply.status(409).send({ message: conflict, statusCode: 409 })

    const paid = !provider.isFree
    const updates: Record<string, unknown> = {
      providerId,
      showName,
      realName: (d.realName ?? existing.realName).trim(),
      description: d.description !== undefined ? d.description.trim() : existing.description,
      usages,
      typeTag,
      weight,
      inputPer1m: paid ? (d.inputPer1m ?? existing.inputPer1m) : 0,
      outputPer1m: paid ? (d.outputPer1m ?? existing.outputPer1m) : 0,
      cachedInputPer1m: paid ? (d.cachedInputPer1m ?? existing.cachedInputPer1m) : null,
      updatedAt: new Date(),
    }
    if (d.isActive !== undefined) updates.isActive = d.isActive
    await db.update(aiModels).set(updates).where(eq(aiModels.id, id))
    return { success: true }
  })

  app.delete('/api/admin/ai/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ id: aiModels.id }).from(aiModels).where(eq(aiModels.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'Model not found', statusCode: 404 })
    await db.delete(aiModels).where(eq(aiModels.id, id))
    return { success: true }
  })

  // ── MCPs ──────────────────────────────────────────────────────────────
  app.get('/api/admin/ai/mcps', async () => {
    const rows = await db.select().from(mcps).orderBy(asc(mcps.name))
    return rows
  })

  app.post('/api/admin/ai/mcps', async (request, reply) => {
    const parsed = mcpBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    const err = validateMcpConfig(parsed.data.config, parsed.data.apiType)
    if (err) return reply.status(400).send({ message: err, statusCode: 400 })
    const [row] = await db.insert(mcps).values({
      name: parsed.data.name.trim(),
      config: parsed.data.config,
      apiType: parsed.data.apiType,
      isActive: true,
    }).returning()
    return reply.status(201).send(row)
  })

  app.patch('/api/admin/ai/mcps/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = mcpUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })

    const [existing] = await db.select().from(mcps).where(eq(mcps.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'MCP not found', statusCode: 404 })

    const apiType = parsed.data.apiType ?? existing.apiType
    const config = parsed.data.config ?? existing.config
    if (parsed.data.config !== undefined || parsed.data.apiType !== undefined) {
      const err = validateMcpConfig(config, apiType)
      if (err) return reply.status(400).send({ message: err, statusCode: 400 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim()
    if (parsed.data.config !== undefined) updates.config = parsed.data.config
    if (parsed.data.apiType !== undefined) updates.apiType = parsed.data.apiType
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive
    await db.update(mcps).set(updates).where(eq(mcps.id, id))
    return { success: true }
  })

  app.delete('/api/admin/ai/mcps/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ id: mcps.id }).from(mcps).where(eq(mcps.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'MCP not found', statusCode: 404 })
    // Cascade removes every user's key for this MCP.
    await db.delete(mcps).where(eq(mcps.id, id))
    return { success: true }
  })
}
