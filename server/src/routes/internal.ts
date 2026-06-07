import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { resolveModelById } from '../utils/ai-runtime.js'
import { chargeRealtimeUsage } from '../utils/token-service.js'
import { processManager } from '../bridges/opencode-process-manager.js'

// Machine-to-machine routes called by the per-project LiteLLM meter (the Python
// callback shipped in litellm-config.ts). NOT behind authMiddleware — authenticated
// solely by a shared secret header. Bound to the same host as the API; in production
// LiteLLM reaches it over localhost. See routing.md §8/§10.

const usageSchema = z.object({
  userId: z.string().uuid(),
  modelId: z.string().uuid(),
  keyId: z.string().uuid().nullable().optional(),
  projectDir: z.string().max(512).optional(),
  sessionId: z.string().uuid().nullable().optional(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cachedTokens: z.number().int().min(0).optional(),
})

export async function internalRoutes(app: FastifyInstance) {
  const SECRET = env.LITELLM_INTERNAL_SECRET ?? env.SESSION_SECRET

  // Real-time per-call meter: charge the user + the serving key, force-stop on exhaustion.
  app.post('/internal/litellm/usage', async (request, reply) => {
    if (request.headers['x-aurora-internal-secret'] !== SECRET) {
      return reply.status(401).send({ message: 'unauthorized', statusCode: 401 })
    }
    const parsed = usageSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    }
    const d = parsed.data

    const model = await resolveModelById(d.modelId)
    if (!model) {
      return reply.status(404).send({ message: 'model not found', statusCode: 404 })
    }

    // Free providers cost nothing — nothing to charge, never kill.
    if (model.provider.isFree) {
      return { userTokensCharged: 0, providerUsd: 0, userBalanceRemaining: -1, keyRemainingUsd: null, keyExhausted: false, killRun: false }
    }

    const result = await chargeRealtimeUsage({
      userId: d.userId,
      keyId: d.keyId ?? null,
      pricing: model.pricing,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cachedTokens: d.cachedTokens,
      modelName: model.showName,
      providerSlug: model.provider.slug,
      sessionId: d.sessionId ?? undefined,
    })

    // Out of credit → hard-stop the agent so it cannot make any more calls.
    if (result.killRun && d.projectDir) {
      app.log.warn({ userId: d.userId, projectDir: d.projectDir }, 'User balance exhausted — force-stopping OpenCode')
      processManager.forceStop(d.projectDir).catch(() => {})
    }

    return result
  })
}
