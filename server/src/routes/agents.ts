import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects } from '../db/schema/projects.js'
import { users } from '../db/schema/users.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { agentMessages } from '../db/schema/agent-messages.js'
import { agentLogs } from '../db/schema/agent-logs.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import { aiProviders } from '../db/schema/ai-providers.js'
import { nimJobs } from '../db/schema/nim-jobs.js'
import { authMiddleware } from '../middleware/auth.js'
import { agentExecutor } from '../agents/executor.js'
import { opencodeBridge, sessionEventBus } from '../bridges/index.js'
import { processManager } from '../bridges/opencode-process-manager.js'
import { generateOpenCodeKnowledge } from '../utils/opencode-knowledge.js'
import { resolveModelById, listModelsForUsage, listModelsForLiteLLM, canUseModel, getUserProviderKeyMap, type ResolvedModel } from '../utils/ai-runtime.js'
import { buildUserMcpServers } from '../utils/mcp-runtime.js'
import { getUserTokens, hasEnoughTokens, deductTokens, estimateMessageCost, calculateMaxOutputTokens, MIN_PREMIUM_BALANCE } from '../utils/token-service.js'
import { generateProviderConfig, generateLiteLLMProviderConfig, generateMinimalProjectConfig, writeProjectConfig, writeIsolatedProjectConfig, writeZenAuthJson } from '../utils/provider-config.js'
import { generateLiteLLMConfig, writeLiteLLMConfig } from '../utils/litellm-config.js'
import { litellmProcessManager } from '../bridges/litellm-process-manager.js'
import { readFile } from 'fs/promises'

const createSessionSchema = z.object({
  bridge: z.enum(['opencode', 'kiro']).optional(),
})

const sendMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  // Optional: when present, this short summary is the VISIBLE user message while the
  // full `content` is what the agent executes. (Currently unused by the NIM flows —
  // the Error Prompt Maker now shows the full prompt — but kept for flexibility.)
  displayContent: z.string().max(2000).optional(),
  // Optional: a NIM error_fix job id. When present the send is "claimed" against that
  // job atomically (running/ready → completed) so it can only ever dispatch ONCE,
  // making the dispatch idempotent + refresh-proof (a reload re-attaches and retries,
  // but the claim is already taken so no duplicate message is sent).
  nimJobId: z.string().uuid().optional(),
  model: z.string().max(100).optional(),
  bridge: z.enum(['opencode', 'kiro']).optional(),
  speed: z.string().max(40).optional(),
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
  return `/home/auroracraft-${username.toLowerCase()}/${linkId}`
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

    // NIM error-fix dispatch claim: atomically flip the job ready/running → completed.
    // This is the single source of truth that the prompt has been dispatched, so a
    // page refresh that re-attaches and retries the send can't double-dispatch — the
    // claim row is already 'completed', the UPDATE matches nothing, and we 409.
    if (parsed.data.nimJobId) {
      const claimed = await db
        .update(nimJobs)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(
          eq(nimJobs.id, parsed.data.nimJobId),
          eq(nimJobs.projectId, projectId),
          eq(nimJobs.userId, request.user!.id),
          inArray(nimJobs.status, ['ready', 'running']),
        ))
        .returning({ id: nimJobs.id })
      if (claimed.length === 0) {
        return reply.status(409).send({ message: 'This fix prompt has already been dispatched', statusCode: 409 })
      }
    }

    // Persist the user message and flip the session to 'running' IMMEDIATELY —
    // before any of the slow provisioning below (LiteLLM proxy cold-start, OpenCode
    // instance spawn, knowledge generation), which can take 10-20s on a fresh
    // project or premium model. This is the durable, refresh-proof signal that a
    // request is in flight: if the user reloads mid-setup, the reload reads the saved
    // message + 'running' status from the DB and restores the loading UI, instead of
    // showing an empty "Session started" / idle chat while the backend keeps working.
    // (Previously the save happened only AFTER LiteLLM/OpenCode startup, so a refresh
    // during that window lost the message entirely.) Validation below may still reject
    // the request; on those paths rejectSend() rolls back so nothing is left dangling.
    const prevSessionStatus = session.status
    // The VISIBLE user message is `displayContent` when provided (a short summary),
    // while the agent still executes the full `parsed.data.content`. This keeps a
    // NIM-generated fix prompt out of the chat UI ("silent" Error Prompt Maker).
    const visibleContent = parsed.data.displayContent ?? parsed.data.content
    const [message] = await db
      .insert(agentMessages)
      .values({ sessionId, role: 'user', content: visibleContent })
      .returning()
    await db
      .update(agentSessions)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(agentSessions.id, sessionId))

    // Roll back the optimistic message + status when validation rejects the send,
    // so a rejected request doesn't leave a dangling user message on a stuck
    // 'running' session.
    const rejectSend = async (statusCode: number, msg: string) => {
      await db.delete(agentMessages).where(eq(agentMessages.id, message.id)).catch(() => {})
      await db
        .update(agentSessions)
        .set({ status: prevSessionStatus, updatedAt: new Date() })
        .where(eq(agentSessions.id, sessionId))
        .catch(() => {})
      return reply.status(statusCode).send({ message: msg, statusCode })
    }

    // Resolve project directory and bridge
    const username = request.user!.username
    const projectDir = getProjectDirectory(username, project.linkId)
    const bridgeName = parsed.data.bridge || session.bridge || 'opencode'
    let resolvedModelId: string | undefined
    let estimatedCost = 0
    let providerId: string | undefined
    let resolvedModel: ResolvedModel | undefined
    let litellmUrl: string | undefined
    let providerChanged = false
    let deductResult: { deducted: number; remainingBalance: number; balanceExhausted: boolean } | undefined
    let maxOutputTokens: number | undefined

    const [user] = await db.select().from(users).where(eq(users.id, request.user!.id)).limit(1)
    const userTier: 'free' | 'paid' = user?.tier ?? 'free'
    const requestedModelId = parsed.data.model ?? ''

    // slug → apiKey for the user's AI-provider keys (the built-in Zen provider's slug is 'opencode').
    const userKeys = await getUserProviderKeyMap(request.user!.id)

    if (requestedModelId) {
      resolvedModel = (await resolveModelById(requestedModelId)) ?? undefined
      if (!resolvedModel) {
        return rejectSend(400, 'Unknown model selected')
      }
      if (!resolvedModel.provider.isActive || !resolvedModel.isActive) {
        return rejectSend(400, `${resolvedModel.showName} is currently disabled.`)
      }
      if (!canUseModel(resolvedModel, userTier)) {
        return rejectSend(403, `Model ${resolvedModel.showName} requires a paid subscription. Upgrade your account to access it.`)
      }

      const provider = resolvedModel.provider
      providerId = provider.slug
      const requiresApiKey = provider.kind !== 'zen'
      const billable = !provider.isFree
      const userApiKey = userKeys[provider.slug]

      // Zen resolves `opencode/<id>` natively; others use the raw model id
      // (rewritten to `openai/<uuid>` below when routed through LiteLLM).
      resolvedModelId = resolvedModel.realName

      if (requiresApiKey && !userApiKey) {
        return rejectSend(503, `You don't have an API key for ${provider.name}. Please contact an administrator to set one up.`)
      }

      if (billable) {
        const currentBalance = await getUserTokens(request.user!.id)
        if (currentBalance < MIN_PREMIUM_BALANCE) {
          return rejectSend(402, `Your token balance is too low for premium models. Minimum required: ${MIN_PREMIUM_BALANCE} tokens. You have ${currentBalance} tokens. Please purchase more tokens or use a free model.`)
        }

        estimatedCost = estimateMessageCost(parsed.data.content, resolvedModel.pricing)
        const hasTokens = await hasEnoughTokens(request.user!.id, estimatedCost)
        if (!hasTokens) {
          return rejectSend(402, `Insufficient AI tokens. Estimated cost: ${estimatedCost} tokens. Please purchase more tokens or use a free model.`)
        }

        deductResult = await deductTokens(
          request.user!.id,
          estimatedCost,
          `Pre-charge for ${resolvedModel.showName} (${provider.slug})`,
          sessionId,
        )
        if (deductResult.deducted < estimatedCost) {
          app.log.warn({ userId: request.user!.id, requested: estimatedCost, deducted: deductResult.deducted, remaining: deductResult.remainingBalance }, 'Partial token deduction — race condition or concurrent usage')
        }
      }

      // Hard-cap output generation to what the user can afford.
      {
        const totalAvailableBalance = (deductResult?.deducted ?? 0) + (deductResult?.remainingBalance ?? await getUserTokens(request.user!.id))
        maxOutputTokens = calculateMaxOutputTokens(totalAvailableBalance, parsed.data.content, resolvedModel.pricing)
        app.log.info({ userId: request.user!.id, maxOutputTokens, totalAvailableBalance, model: resolvedModel.id }, 'Calculated max output tokens')
      }

      let litellmMasterKey: string | undefined
      try {
        // Route ALL OpenAI-compatible providers through LiteLLM Proxy — it handles the
        // /responses → /chat/completions translation for providers that don't support
        // the Responses API (NVIDIA NIM, OpenRouter, etc.) and enforces per-model
        // pricing + budget for billable ones. Only the built-in Zen provider hits
        // OpenCode directly via the native opencode/<id> format.
        const needsLiteLLM = provider.kind !== 'zen'
        if (needsLiteLLM) {
          const userTokenBalance = await getUserTokens(request.user!.id)
          // Collect all non-Zen agent models the user has keys for, not just billable ones.
          const allModels = await listModelsForLiteLLM('agent')
          const llmConfig = await generateLiteLLMConfig(projectDir, allModels, userKeys, userTokenBalance)
          const configPath = await writeLiteLLMConfig(projectDir, llmConfig)
          try {
            litellmUrl = await litellmProcessManager.acquire({ directory: projectDir, configPath })
            litellmMasterKey = llmConfig.general_settings.master_key
            // The workspace + isolated configs must agree on `openai/<uuid>`.
            resolvedModelId = `openai/${resolvedModel.id}`
            app.log.info({ projectDir, litellmUrl, model: resolvedModel.id }, 'Started LiteLLM proxy for project')
          } catch (liteErr) {
            app.log.warn({ err: liteErr, projectDir }, 'LiteLLM proxy failed — falling back to direct provider')
            // litellmUrl stays undefined → generateProviderConfig is used below
          }
        }

        // Write the FULL provider config (with API key) to an isolated per-project
        // directory outside the workspace tree (root-only 600 perms).
        const fullConfig = (litellmUrl && litellmMasterKey)
          ? generateLiteLLMProviderConfig(resolvedModel, litellmUrl, litellmMasterKey)
          : generateProviderConfig(resolvedModel, userApiKey)
        await writeIsolatedProjectConfig(projectDir, fullConfig)

        // Detect provider changes by comparing the old project config.
        const oldConfigStr = await readFile(`${projectDir}/opencode.json`, 'utf8').catch(() => null)
        const oldProvider = oldConfigStr ? JSON.parse(oldConfigStr).provider : undefined
        providerChanged = JSON.stringify(oldProvider) !== JSON.stringify(fullConfig.provider)

        if (providerChanged) {
          app.log.info({ projectDir, provider: provider.slug }, 'Provider config changed — restarting OpenCode instance')
          await processManager.forceStop(projectDir)
        }
        app.log.info({ projectDir, provider: provider.slug, model: resolvedModel.id, viaLiteLLM: !!litellmUrl }, 'Wrote provider config')
      } catch (err) {
        app.log.warn({ err, projectDir }, 'Failed to write provider config')
      }

      // Write a MINIMAL project-level config (no secrets) into the workspace so the
      // correct model id is always set. Must run AFTER LiteLLM updates resolvedModelId.
      const projectConfig = generateMinimalProjectConfig(resolvedModelId)
      try {
        await writeProjectConfig(projectDir, projectConfig)
      } catch (err) {
        app.log.warn({ err, projectDir }, 'Failed to write project config')
      }

      // Optional Zen key (built-in 'opencode' provider) → auth.json for higher rate limits.
      // Without it, Zen models still work on OpenCode's free tier.
      if (provider.kind === 'zen' && userKeys.opencode) {
        try {
          await writeZenAuthJson(projectDir, userKeys.opencode)
          app.log.info({ projectDir, model: resolvedModel.id }, 'Wrote Zen auth.json')
        } catch (err) {
          app.log.warn({ err, projectDir }, 'Failed to write Zen auth.json')
        }
      }
    }

    let opencodeSessionId: string | undefined

    if (bridgeName === 'opencode') {
      // Track model per session — force new OpenCode session when model changes
      const requestedModel = parsed.data.model ?? ''
      const lastModel = sessionModelTracker.get(sessionId)
      const modelChanged = !!(requestedModel && lastModel && requestedModel !== lastModel)
      if (requestedModel) sessionModelTracker.set(sessionId, requestedModel)

      // Generate project-specific rules and skills for OpenCode
      try {
        await generateOpenCodeKnowledge(project, username)
      } catch (err) {
        app.log.warn({ err, sessionId }, 'Failed to generate OpenCode knowledge — continuing without custom rules')
      }

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

    // Resolve which admin-configured MCP servers this user can run (key substitution included).
    const mcp = bridgeName === 'opencode'
      ? await buildUserMcpServers(request.user!.id)
      : { servers: [], disconnect: [] }

    // Fire-and-forget: launch the AI agent executor asynchronously
    agentExecutor.execute(
      {
        sessionId,
        projectId,
        prompt: parsed.data.content,
        bridgeName,
        // The bridge needs the OpenCode-resolvable model id (opencode/<id> or openai/<uuid>),
        // NOT the AuroraCraft model row uuid. billingModelId carries the uuid for reconciliation.
        model: resolvedModelId ?? parsed.data.model,
        billingModelId: requestedModelId || undefined,
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
        userHomeDir: `/home/auroracraft-${username.toLowerCase()}`,
        mcpServers: mcp.servers,
        mcpDisconnect: mcp.disconnect,
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

    // Generate project-specific rules and skills for OpenCode
    try {
      await generateOpenCodeKnowledge(project, request.user!.username)
    } catch (err) {
      app.log.warn({ err, sessionId }, 'Failed to generate OpenCode knowledge — continuing without custom rules')
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
    const tier: 'free' | 'paid' = user?.tier ?? 'free'
    const userKeys = await getUserProviderKeyMap(request.user!.id)

    const resolved = await listModelsForUsage('agent', tier)
    const models = resolved.map((m) => {
      const requiresApiKey = m.provider.kind !== 'zen'
      const hasKey = !requiresApiKey || !!userKeys[m.provider.slug]
      const disabled = requiresApiKey && !userKeys[m.provider.slug]
      return {
        id: m.id,
        name: m.showName,
        description: m.description,
        // free/paid follows the provider; minTier kept for frontend compatibility
        minTier: m.provider.isFree ? 'free' : 'paid',
        isFree: m.provider.isFree,
        typeTag: m.typeTag,
        weight: m.weight,
        providerId: m.provider.id,
        providerSlug: m.provider.slug,
        providerName: m.provider.name,
        requiresApiKey,
        hasKey,
        disabled,
        disabledReason: disabled ? `No API key configured for ${m.provider.name}` : undefined,
      }
    })

    return { models, tier, providerKeys: Object.keys(userKeys) }
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
    // Which AI providers + MCPs the current user holds an active key for (slug/id only — never the key).
    const provRows = await db
      .select({ slug: aiProviders.slug, isActive: providerApiKeys.isActive, createdAt: providerApiKeys.createdAt })
      .from(providerApiKeys)
      .innerJoin(aiProviders, eq(providerApiKeys.providerId, aiProviders.id))
      .where(and(eq(providerApiKeys.userId, request.user!.id), eq(providerApiKeys.isActive, true)))
    const mcpRows = await db
      .select({ mcpId: providerApiKeys.mcpId })
      .from(providerApiKeys)
      .where(and(eq(providerApiKeys.userId, request.user!.id), eq(providerApiKeys.isActive, true)))
    return {
      providers: provRows.map((k) => ({ provider: k.slug, isActive: k.isActive, createdAt: k.createdAt })),
      mcps: mcpRows.filter((m) => !!m.mcpId).map((m) => ({ mcpId: m.mcpId })),
    }
  })
}
