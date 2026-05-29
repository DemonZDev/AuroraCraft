import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { users } from '../db/schema/users.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { agentMessages } from '../db/schema/agent-messages.js'
import { agentLogs } from '../db/schema/agent-logs.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import { authMiddleware } from '../middleware/auth.js'
import { agentExecutor } from '../agents/executor.js'
import { opencodeBridge, sessionEventBus } from '../bridges/index.js'
import { processManager } from '../bridges/opencode-process-manager.js'
import { AI_MODELS, getModelById, getProviderForModel, canUseModel, modelCanUseZen } from '../config/ai-models.js'
import { getUserTokens, hasEnoughTokens, deductTokens, estimateMessageCost, canAccessTier, getUserProviderKeys, calculateMaxOutputTokens, MIN_PREMIUM_BALANCE } from '../utils/token-service.js'
import { generateProviderConfig, generateLiteLLMProviderConfig, generateMinimalProjectConfig, writeProjectConfig, writeIsolatedProjectConfig, writeZenAuthJson } from '../utils/provider-config.js'
import { generateLiteLLMConfig, writeLiteLLMConfig } from '../utils/litellm-config.js'
import { litellmProcessManager } from '../bridges/litellm-process-manager.js'
import { readFile } from 'fs/promises'

const createSessionSchema = z.object({
  bridge: z.enum(['opencode', 'kiro']).optional(),
})

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  model: z.string().max(100).optional(),
  bridge: z.enum(['opencode', 'kiro']).optional(),
  speed: z.enum(['fast', 'slow', 'rate_limited']).optional(),
})

const sessionModelTracker = new Map<string, string>()

async function verifyProjectOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  return project
}

function getProjectDirectory(username: string, linkId: string | null): string {
  if (!linkId) return '.'
  return `/home/auroracraft-${username}/${linkId}`
}

export async function agentRoutes(app: FastifyInstance) {
  // List agent sessions for a project
  app.get('/api/projects/:projectId/agent/sessions', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const sessions = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.projectId, projectId))
      .orderBy(desc(agentSessions.createdAt))

    return sessions
  })

  // Create a new agent session
  app.post('/api/projects/:projectId/agent/sessions', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const parsed = createSessionSchema.safeParse(request.body ?? {})
    const bridge = parsed.success ? (parsed.data.bridge ?? 'opencode') : 'opencode'

    const [session] = await db
      .insert(agentSessions)
      .values({ projectId, bridge })
      .returning()

    return reply.status(201).send(session)
  })

  // Get a specific agent session with its messages
  app.get('/api/projects/:projectId/agent/sessions/:sessionId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.projectId, projectId)))
      .limit(1)

    if (!session) {
      return reply.status(404).send({ message: 'Session not found', statusCode: 404 })
    }

    const messages = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.sessionId, sessionId))
      .orderBy(agentMessages.createdAt)

    return { ...session, messages }
  })

  // SSE streaming endpoint for live updates
  app.get('/api/projects/:projectId/agent/sessions/:sessionId/stream', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.projectId, projectId)))
      .limit(1)

    if (!session) {
      return reply.status(404).send({ message: 'Session not found', statusCode: 404 })
    }

    const username = request.user!.username
    const projectDir = getProjectDirectory(username, project.linkId)

    // Hijack the response for raw SSE streaming
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const sendSSE = (data: unknown) => {
      if (!raw.destroyed) {
        raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }
    }

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (!raw.destroyed) {
        raw.write(': heartbeat\n\n')
      }
    }, 15000)

    let unsubscribe: (() => void) | null = null
    let subscribed = false

    if (session.bridge === 'kiro') {
      // Kiro uses the bridge-agnostic session event bus — no process URL needed
      subscribed = true

      if (session.status === 'running' || session.status === 'idle') {
        sendSSE({ type: 'status', status: 'running' })
      }

      unsubscribe = sessionEventBus.subscribe(sessionId, (event) => sendSSE(event))
    } else {
      // OpenCode: subscribe via the OpenCode subscription manager
      const trySubscribe = () => {
        if (subscribed) return

        const doSubscribe = async () => {
          let opencodeId = session.opencodeSessionId

          // Poll for up to 30 seconds if no opencodeSessionId yet
          if (!opencodeId) {
            for (let i = 0; i < 60; i++) {
              if (raw.destroyed) return
              await new Promise((r) => setTimeout(r, 500))

              const [refreshed] = await db
                .select({ opencodeSessionId: agentSessions.opencodeSessionId })
                .from(agentSessions)
                .where(eq(agentSessions.id, sessionId))
                .limit(1)

              if (refreshed?.opencodeSessionId) {
                opencodeId = refreshed.opencodeSessionId
                break
              }
            }
          }

          if (!opencodeId || raw.destroyed) return

          // Poll for the OpenCode instance URL (may still be starting)
          let instanceUrl: string | null = null
          for (let j = 0; j < 60; j++) {
            if (raw.destroyed) return
            instanceUrl = processManager.getInstanceUrl(projectDir)
            if (instanceUrl) break
            await new Promise((r) => setTimeout(r, 500))
          }
          if (!instanceUrl || raw.destroyed) return

          subscribed = true

          const [current] = await db
            .select({ status: agentSessions.status })
            .from(agentSessions)
            .where(eq(agentSessions.id, sessionId))
            .limit(1)

          if (current && (current.status === 'running' || current.status === 'idle')) {
            sendSSE({ type: 'status', status: 'running' })
          }

          unsubscribe = opencodeBridge.subscriptionManager.subscribe(
            projectDir,
            opencodeId,
            (event) => sendSSE(event),
            instanceUrl,
          )
        }

        doSubscribe().catch(() => {})
      }

      trySubscribe()
    }

    // Send initial connection event
    sendSSE({ type: 'status', status: 'connected' })

    // Clean up on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe?.()
    })
  })

  // Send a message to an agent session
  app.post('/api/projects/:projectId/agent/sessions/:sessionId/messages', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string }
    console.log('[DEBUG] Received message request body:', JSON.stringify(request.body))
    const parsed = sendMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      console.log('[DEBUG] Validation failed:', parsed.error.issues)
      return reply.status(400).send({
        message: parsed.error.issues[0].message,
        statusCode: 400,
      })
    }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.projectId, projectId)))
      .limit(1)

    if (!session) {
      return reply.status(404).send({ message: 'Session not found', statusCode: 404 })
    }

    if (session.status === 'running') {
      return reply.status(409).send({ message: 'Agent is already processing', statusCode: 409 })
    }

    // Resolve project directory and bridge
    const username = request.user!.username
    const projectDir = getProjectDirectory(username, project.linkId)
    const bridgeName = parsed.data.bridge || session.bridge || 'opencode'
    let resolvedModelId: string | undefined
    let estimatedCost = 0
    let providerId: string | undefined
    let modelDef: ReturnType<typeof getModelById> = undefined
    let litellmUrl: string | undefined
    let providerChanged = false
    let deductResult: { deducted: number; remainingBalance: number; balanceExhausted: boolean } | undefined
    let maxOutputTokens: number | undefined

    const [user] = await db.select().from(users).where(eq(users.id, request.user!.id)).limit(1)
    const userTier = user?.tier ?? 'free'
    const requestedModelId = parsed.data.model ?? ''
    const requestedSpeed = parsed.data.speed ?? 'fast'

    const userKeys = await getUserProviderKeys(request.user!.id)

    if (requestedModelId) {
      modelDef = getModelById(requestedModelId)
      if (!modelDef) {
        return reply.status(400).send({ message: 'Unknown model selected', statusCode: 400 })
      }
      if (!canUseModel(requestedModelId, userTier)) {
        return reply.status(403).send({
          message: `Model ${modelDef.name} requires a paid subscription. Upgrade your account to access it.`,
          statusCode: 403,
        })
      }

      const provider = getProviderForModel(requestedModelId, requestedSpeed, userKeys)
      if (provider) {
        providerId = provider.id
        // OpenCode provider model IDs already include the 'opencode/' prefix.
        // External providers need the '{provider}/{model}' format.
        resolvedModelId = provider.id === 'opencode'
          ? provider.modelId
          : `${provider.id}/${provider.modelId}`
      }
      if (!provider) {
        return reply.status(400).send({
          message: `Provider not available for ${modelDef.name} at ${requestedSpeed} speed`,
          statusCode: 400,
        })
      }

      if (provider.requiresApiKey) {
        const userApiKey = userKeys[provider.id]

        if (!userApiKey) {
          return reply.status(503).send({
            message: `You don't have an API key for ${provider.id}. Please contact an administrator to set one up.`,
            statusCode: 503,
          })
        }

        if (modelDef.minTier !== 'free') {
          const currentBalance = await getUserTokens(request.user!.id)
          if (currentBalance < MIN_PREMIUM_BALANCE) {
            return reply.status(402).send({
              message: `Your token balance is too low for premium models. Minimum required: ${MIN_PREMIUM_BALANCE} tokens. You have ${currentBalance} tokens. Please purchase more tokens or use a free model.`,
              statusCode: 402,
            })
          }

          estimatedCost = estimateMessageCost(parsed.data.content, modelDef, provider.id)
          const hasTokens = await hasEnoughTokens(request.user!.id, estimatedCost)
          if (!hasTokens) {
            return reply.status(402).send({
              message: `Insufficient AI tokens. Estimated cost: ${estimatedCost} tokens. Please purchase more tokens or use a free model.`,
              statusCode: 402,
            })
          }

          deductResult = await deductTokens(
            request.user!.id,
            estimatedCost,
            `Pre-charge for ${modelDef.name} (${provider.id})`,
            sessionId,
          )
          if (deductResult.deducted < estimatedCost) {
            app.log.warn({ userId: request.user!.id, requested: estimatedCost, deducted: deductResult.deducted, remaining: deductResult.remainingBalance }, 'Partial token deduction — race condition or concurrent usage')
          }
        }

    // Calculate max output tokens based on user's total available balance
    // so generation is hard-capped and cannot exceed what they can afford
    if (modelDef) {
      const totalAvailableBalance = (deductResult?.deducted ?? 0) + (deductResult?.remainingBalance ?? await getUserTokens(request.user!.id))
      maxOutputTokens = calculateMaxOutputTokens(
        totalAvailableBalance,
        parsed.data.content,
        modelDef,
        provider?.id,
      )
      app.log.info({ userId: request.user!.id, maxOutputTokens, totalAvailableBalance, model: modelDef.id }, 'Calculated max output tokens')
    }

    let litellmUrl: string | undefined
    let litellmMasterKey: string | undefined

        try {
          // For premium external providers, route through LiteLLM Proxy instead of
          // hitting the provider directly. LiteLLM enforces per-project budget
          // (converted from tokens → USD) and provides unified model routing.
          if (provider.id !== 'opencode') {
            const userTokenBalance = await getUserTokens(request.user!.id)
            const llmConfig = await generateLiteLLMConfig(projectDir, AI_MODELS, userKeys, userTokenBalance)
            const configPath = await writeLiteLLMConfig(projectDir, llmConfig)
            litellmUrl = await litellmProcessManager.acquire({ directory: projectDir, configPath })
            litellmMasterKey = llmConfig.general_settings.master_key
            // When routing through LiteLLM, the resolved model ID must include
            // the provider prefix ('openai/') so the workspace config matches the
            // isolated config and the bridge sends the correct provider/model pair.
            resolvedModelId = `openai/${modelDef.id}`
            app.log.info({ projectDir, litellmUrl, model: modelDef.id }, 'Started LiteLLM proxy for project')
          }

          // Write the FULL provider config (with API key) to an isolated
          // per-project directory outside the workspace tree. Root-only 600
          // permissions prevent users from extracting keys via the code editor.
          let fullConfig
          if (litellmUrl && litellmMasterKey) {
            fullConfig = generateLiteLLMProviderConfig(modelDef, litellmUrl, litellmMasterKey)
          } else {
            fullConfig = generateProviderConfig(modelDef, provider, userApiKey)
          }
          await writeIsolatedProjectConfig(projectDir, fullConfig)

          // Detect provider changes by comparing the old project config
          const oldConfigStr = await readFile(`${projectDir}/opencode.json`, 'utf8').catch(() => null)
          const oldProvider = oldConfigStr ? JSON.parse(oldConfigStr).provider : undefined
          const newProvider = fullConfig.provider
          providerChanged = JSON.stringify(oldProvider) !== JSON.stringify(newProvider)

          if (providerChanged) {
            app.log.info({ projectDir, provider: provider.id }, 'Provider config changed — restarting OpenCode instance')
            await processManager.forceStop(projectDir)
          }
          app.log.info({ projectDir, provider: provider.id, model: modelDef.id, viaLiteLLM: !!litellmUrl }, 'Wrote provider config')
        } catch (err) {
          app.log.warn({ err, projectDir }, 'Failed to write provider config')
        }
      }

      // If this is a Zen-capable model and the user has a Zen API key,
      // write the Zen key to auth.json so OpenCode uses Zen (higher rate limits).
      // Without a Zen key, the model falls back to OpenCode's free tier.
      // Write a MINIMAL project-level config (no secrets) into the workspace.
      // This ensures the correct model ID is always set in the project config.
      // Must be written AFTER LiteLLM routing updates resolvedModelId.
      const projectConfig = generateMinimalProjectConfig(resolvedModelId)
      try {
        await writeProjectConfig(projectDir, projectConfig)
      } catch (err) {
        app.log.warn({ err, projectDir }, 'Failed to write project config')
      }

      if (modelCanUseZen(requestedModelId) && userKeys.zen) {
        try {
          await writeZenAuthJson(projectDir, userKeys.zen)
          app.log.info({ projectDir, model: modelDef.id }, 'Wrote Zen auth.json')
        } catch (err) {
          app.log.warn({ err, projectDir }, 'Failed to write Zen auth.json')
        }
      }
    }

    // Save the user message
    const [message] = await db
      .insert(agentMessages)
      .values({
        sessionId,
        role: 'user',
        content: parsed.data.content,
      })
      .returning()

    let opencodeSessionId: string | undefined

    if (bridgeName === 'opencode') {
      // Track model per session — force new OpenCode session when model changes
      const requestedModel = parsed.data.model ?? ''
      const lastModel = sessionModelTracker.get(sessionId)
      const modelChanged = !!(requestedModel && lastModel && requestedModel !== lastModel)
      if (requestedModel) sessionModelTracker.set(sessionId, requestedModel)

      // Start OpenCode instance for this project directory
      // Pass API keys as env vars so they are never written to disk
      let instanceUrl: string | undefined
      try {
        instanceUrl = await processManager.acquire({
          directory: projectDir,
          javaVersion: project.javaVersion ?? '21',
          compiler: project.compiler ?? 'maven',
        })
      } catch (err) {
        app.log.warn({ err, sessionId }, 'Failed to start OpenCode instance')
      }

      // Pre-create or resolve the OpenCode session so the SSE endpoint can subscribe immediately
      opencodeSessionId = session.opencodeSessionId ?? undefined

      // When provider config changes (e.g., switching from direct provider to
      // LiteLLM), the old session was created with the old model/provider settings.
      // Force a new OpenCode session so it picks up the new config.
      if (providerChanged) {
        app.log.info({ sessionId, projectDir }, 'Provider changed — forcing new OpenCode session')
        opencodeSessionId = undefined
      }

      if (instanceUrl) {
        try {
          opencodeSessionId = await opencodeBridge.createOrResolveSession(
            instanceUrl,
            projectDir,
            project.linkId ?? project.name,
            opencodeSessionId,
            providerChanged,
          )

          // Save opencodeSessionId early so SSE endpoint can pick it up
          await db
            .update(agentSessions)
            .set({ opencodeSessionId, updatedAt: new Date() })
            .where(eq(agentSessions.id, sessionId))
        } catch (err) {
          app.log.warn({ err, sessionId }, 'Failed to pre-create OpenCode session')
        }
      }

      // Release the pre-acquired instance (agent executor will re-acquire)
      if (instanceUrl) {
        processManager.release(projectDir).catch(() => {})
      }

      // Clear stale buffered events from previous messages
      if (opencodeSessionId) {
        opencodeBridge.subscriptionManager.clearBuffer(projectDir, opencodeSessionId)
      }
    } else if (bridgeName === 'kiro') {
      // Clear stale buffered events for Kiro sessions
      sessionEventBus.clearBuffer(sessionId)
    }

    // Fire-and-forget: launch the AI agent executor asynchronously
    agentExecutor.execute(
      {
        sessionId,
        projectId,
        prompt: parsed.data.content,
        bridgeName,
        model: parsed.data.model ?? resolvedModelId,
        speed: parsed.data.speed,
        opencodeSessionId: bridgeName === 'opencode' ? opencodeSessionId : undefined,
        kiroSessionId: bridgeName === 'kiro' ? (session.kiroSessionId ?? undefined) : undefined,
        username,
        projectLinkId: project.linkId ?? undefined,
        projectName: project.name,
        software: project.software,
        language: project.language,
        compiler: project.compiler,
        javaVersion: project.javaVersion,
        projectDirectory: projectDir,
        userHomeDir: `/home/auroracraft-${username}`,
        firecrawlApiKey: userTier === 'paid' ? userKeys.firecrawl : undefined,
        userId: request.user!.id,
        estimatedCost,
        providerId,
        litellmUrl,
        maxOutputTokens,
      },
      {
        onOutput: (content) => { app.log.debug({ sessionId }, `Agent output: ${content.substring(0, 100)}`) },
        onStatus: (status) => { app.log.info({ sessionId, status }, 'Agent status changed') },
        onLog: (logType, msg) => { app.log.debug({ sessionId, logType }, msg) },
        onComplete: () => { app.log.info({ sessionId }, 'Agent execution completed') },
        onError: (error) => { app.log.error({ sessionId, error }, 'Agent execution error') },
      },
    ).catch((err) => {
      app.log.error({ sessionId, err }, 'Unhandled agent execution error')
    })

    return reply.status(201).send(message)
  })

  // Cancel an agent session
  app.post('/api/projects/:projectId/agent/sessions/:sessionId/cancel', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.projectId, projectId)))
      .limit(1)

    if (!session) {
      return reply.status(404).send({ message: 'Session not found', statusCode: 404 })
    }

    if (session.status !== 'running' && session.status !== 'idle') {
      return reply.status(400).send({ message: 'Session is not active', statusCode: 400 })
    }

    await agentExecutor.cancel(sessionId)

    const [updated] = await db
      .update(agentSessions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(agentSessions.id, sessionId))
      .returning()

    await db.insert(agentLogs).values({
      sessionId,
      logType: 'status',
      message: 'Session cancelled by user',
    })

    return updated
  })

  // Answer a question
  app.post('/api/projects/:projectId/agent/sessions/:sessionId/answer', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string }
    const { questionId, answer } = request.body as { questionId: string; answer: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.projectId, projectId)))
      .limit(1)

    if (!session) {
      return reply.status(404).send({ message: 'Session not found', statusCode: 404 })
    }

    const opencodeSessionId = session.opencodeSessionId ?? undefined
    if (!opencodeSessionId) {
      return reply.status(400).send({ message: 'No OpenCode session found', statusCode: 400 })
    }

    const directory = getProjectDirectory(request.user!.username, project.linkId)
    const url = await processManager.acquire({
      directory,
      javaVersion: project.javaVersion ?? '21',
      compiler: project.compiler ?? 'maven',
    })

    try {
      await fetch(`${url}/session/${opencodeSessionId}/question/${questionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      return { success: true }
    } catch (error) {
      return reply.status(500).send({ message: 'Failed to answer question', statusCode: 500 })
    } finally {
      await processManager.release(directory)
    }
  })

  // Get logs for a session
  app.get('/api/projects/:projectId/agent/sessions/:sessionId/logs', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string }

    const project = await verifyProjectOwnership(request.user!.id, projectId)
    if (!project) {
      return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    }

    const logs = await db
      .select()
      .from(agentLogs)
      .where(eq(agentLogs.sessionId, sessionId))
      .orderBy(agentLogs.createdAt)

    return logs
  })

  app.get('/api/ai/models', { preHandler: [authMiddleware] }, async (request, reply) => {
    const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, request.user!.id)).limit(1)
    const tier = user?.tier ?? 'free'
    const userKeys = await getUserProviderKeys(request.user!.id)

    const models = AI_MODELS.filter(m => {
      if (tier === 'paid') return true
      return m.minTier === 'free'
    }).map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      minTier: m.minTier,
      providers: m.providers.map(p => ({
        id: p.id,
        speed: p.speed,
        requiresApiKey: p.requiresApiKey,
        hasKey: p.requiresApiKey ? !!userKeys[p.id] : true,
      })),
      disabled: m.minTier !== 'free' && m.providers.every(p => p.requiresApiKey && !userKeys[p.id]),
      disabledReason: m.minTier !== 'free' && m.providers.every(p => p.requiresApiKey && !userKeys[p.id])
        ? 'No API key configured for any provider'
        : undefined,
    }))

    return { models, tier, userKeys: Object.keys(userKeys) }
  })

  app.get('/api/user/tokens', { preHandler: [authMiddleware] }, async (request, reply) => {
    const [user] = await db.select({ aiTokens: users.aiTokens, tokensUsed: users.tokensUsed, tier: users.tier }).from(users).where(eq(users.id, request.user!.id)).limit(1)
    return {
      balance: user?.aiTokens ?? 0,
      used: user?.tokensUsed ?? 0,
      tier: user?.tier ?? 'free',
    }
  })

  app.get('/api/user/provider-keys', { preHandler: [authMiddleware] }, async (request) => {
    const keys = await db
      .select({ provider: providerApiKeys.provider, apiKey: providerApiKeys.apiKey, isActive: providerApiKeys.isActive, createdAt: providerApiKeys.createdAt })
      .from(providerApiKeys)
      .where(and(eq(providerApiKeys.userId, request.user!.id), eq(providerApiKeys.isActive, true)))
    return keys.map(k => ({
      provider: k.provider,
      apiKey: k.apiKey.length > 12 ? `${k.apiKey.slice(0, 8)}••••••••${k.apiKey.slice(-4)}` : '••••••••',
      isActive: k.isActive,
      createdAt: k.createdAt,
    }))
  })
}
