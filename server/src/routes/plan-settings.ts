import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { planSettings, type PlanFeature, type PlanSettings } from '../db/schema/plan-settings.js'
import { authMiddleware, adminGuard } from '../middleware/auth.js'

// Defaults used if the seed row is somehow missing (mirrors migration 0026).
const DEFAULT_FEATURES: PlanFeature[] = [
  { label: 'Project Workspace', free: true, pro: true },
  { label: 'Free Models Access', free: true, pro: true },
  { label: 'Download Plugin Jar', free: true, pro: true },
  { label: 'Download Project Files', free: false, pro: true },
  { label: 'Fork Community Project', free: false, pro: true },
  { label: 'Upload Project Zip', free: false, pro: true },
  { label: 'Git Integrations', free: false, pro: true },
  { label: 'Graphify Access', free: false, pro: true },
  { label: 'Paid Models Access', free: false, pro: true },
  { label: 'Web Search Access', free: false, pro: true },
  { label: 'Prompt Enhancer', free: false, pro: true },
  { label: 'Error Prompt Maker', free: false, pro: true },
  { label: 'Code Review', free: false, pro: true },
]

const updateSchema = z.object({
  proPriceUsd: z.number().min(0).max(100000).optional(),
  proOriginalPriceUsd: z.number().min(0).max(100000).optional(),
  proMonthlyTokens: z.number().int().min(0).max(1_000_000_000).optional(),
  tokenPricePer1kUsd: z.number().min(0).max(100000).optional(),
  features: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        free: z.boolean(),
        pro: z.boolean(),
      }),
    )
    .max(50)
    .optional(),
})

async function getOrCreateSettings(): Promise<PlanSettings> {
  const [existing] = await db.select().from(planSettings).limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(planSettings)
    .values({ features: DEFAULT_FEATURES })
    .returning()
  return created
}

function serialize(row: PlanSettings) {
  return {
    proPriceUsd: row.proPriceUsd,
    proOriginalPriceUsd: row.proOriginalPriceUsd,
    proMonthlyTokens: row.proMonthlyTokens,
    tokenPricePer1kUsd: row.tokenPricePer1kUsd,
    features: (row.features as PlanFeature[]) ?? [],
    updatedAt: row.updatedAt,
  }
}

export async function planSettingsRoutes(app: FastifyInstance) {
  // Public — powers the pricing page; no auth so visitors see live prices.
  app.get('/api/plan-settings', async () => {
    return serialize(await getOrCreateSettings())
  })

  // Admin — edit prices / token price / feature matrix at runtime.
  app.patch(
    '/api/admin/plan-settings',
    { preHandler: [authMiddleware, adminGuard] },
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ message: parsed.error.issues[0]?.message ?? 'Invalid body' })
      }
      const current = await getOrCreateSettings()
      const [updated] = await db
        .update(planSettings)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(planSettings.id, current.id))
        .returning()
      return serialize(updated)
    },
  )
}
