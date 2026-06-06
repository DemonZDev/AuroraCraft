import type { FastifyInstance } from 'fastify'
import { sql, eq, desc, asc, and } from 'drizzle-orm'
import { access, constants } from 'fs/promises'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { projects } from '../db/schema/projects.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import { aiProviders } from '../db/schema/ai-providers.js'
import { mcps } from '../db/schema/mcps.js'
import { authMiddleware, adminGuard } from '../middleware/auth.js'
import { grantTokens, getUserTokens, deductTokens } from '../utils/token-service.js'

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', adminGuard)

  // Admin stats
  app.get('/api/admin/stats', async () => {
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    const [projectCount] = await db.select({ count: sql<number>`count(*)::int` }).from(projects)
    const [sessionCount] = await db.select({ count: sql<number>`count(*)::int` }).from(agentSessions)

    return {
      totalUsers: userCount.count,
      totalProjects: projectCount.count,
      totalAgentSessions: sessionCount.count,
    }
  })

  // List all users (admin view)
  app.get('/api/admin/users', async () => {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        coderabbitEnabled: users.coderabbitEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))

    return allUsers
  })

  // List all projects with owner info (admin view)
  app.get('/api/admin/projects', async () => {
    const allProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        software: projects.software,
        language: projects.language,
        compiler: projects.compiler,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        ownerUsername: users.username,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .orderBy(desc(projects.createdAt))

    return allProjects
  })

  // Check Kiro CLI authentication status for a user
  app.get('/api/admin/kiro/status/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }

    const [user] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      return reply.status(404).send({ message: 'User not found', statusCode: 404 })
    }

    const systemUser = `auroracraft-${user.username.toLowerCase()}`
    const configDir = `/home/${systemUser}/.config/kiro`

    let systemUserExists = false
    try {
      await access(`/home/${systemUser}`, constants.F_OK)
      systemUserExists = true
    } catch {
      // System user home directory doesn't exist
    }

    let credentialsExist = false
    if (systemUserExists) {
      try {
        await access(configDir, constants.F_OK)
        credentialsExist = true
      } catch {
        // No Kiro config directory
      }
    }

    return {
      userId: user.id,
      username: user.username,
      systemUser,
      systemUserExists,
      authenticated: credentialsExist,
      configDir,
    }
  })

  // Initiate Kiro CLI authentication for a user
  app.post('/api/admin/kiro/authenticate/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }

    const [user] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      return reply.status(404).send({ message: 'User not found', statusCode: 404 })
    }

    const systemUser = `auroracraft-${user.username.toLowerCase()}`
    const homeDir = `/home/${systemUser}`
    const configDir = `${homeDir}/.config/kiro`

    // Verify system user exists
    let systemUserExists = false
    try {
      await access(homeDir, constants.F_OK)
      systemUserExists = true
    } catch {
      return reply.status(400).send({
        message: `System user ${systemUser} does not exist. Create the user's project first.`,
        statusCode: 400,
      })
    }

    // Check if already authenticated
    let alreadyAuthenticated = false
    try {
      await access(configDir, constants.F_OK)
      alreadyAuthenticated = true
    } catch {
      // Not authenticated yet
    }

    return {
      userId: user.id,
      username: user.username,
      systemUser,
      systemUserExists,
      authenticated: alreadyAuthenticated,
      configDir,
      instructions: alreadyAuthenticated
        ? 'Kiro CLI is already authenticated for this user.'
        : `To authenticate, SSH into the server and run: su - ${systemUser} -c "kiro-cli login"`,
    }
  })

  app.get('/api/admin/users/detailed', async () => {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        tier: users.tier,
        aiTokens: users.aiTokens,
        tokensUsed: users.tokensUsed,
        coderabbitEnabled: users.coderabbitEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))

    return allUsers
  })

  app.patch('/api/admin/users/:id/tier', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tier } = request.body as { tier: 'free' | 'paid' }

    if (!['free', 'paid'].includes(tier)) {
      return reply.status(400).send({ message: 'Invalid tier', statusCode: 400 })
    }

    const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, id)).limit(1)
    if (!user) {
      return reply.status(404).send({ message: 'User not found', statusCode: 404 })
    }

    if (tier === 'free' && user.tier === 'paid') {
      // Block demotion while the user holds any key for a PAID provider.
      const paidKeys = await db
        .select({ name: aiProviders.name })
        .from(providerApiKeys)
        .innerJoin(aiProviders, eq(providerApiKeys.providerId, aiProviders.id))
        .where(and(eq(providerApiKeys.userId, id), eq(aiProviders.isFree, false)))
      if (paidKeys.length > 0) {
        const names = [...new Set(paidKeys.map(k => k.name))]
        return reply.status(409).send({
          message: `Cannot downgrade to free tier. User has paid-provider API keys configured for: ${names.join(', ')}. Delete these keys first.`,
          statusCode: 409,
          providers: names,
        })
      }
    }

    await db.update(users).set({ tier, updatedAt: new Date() }).where(eq(users.id, id))

    // Graphify reconciliation on tier change (additive; never blocks the tier update):
    //  - demotion (paid→free): remove artifacts + skill from all the user's projects, keep intent
    //  - promotion (free→paid): reset enabled projects to rebuild lazily on next workspace open
    try {
      const svc = await import('../utils/graphify-service.js')
      if (tier === 'free' && user.tier === 'paid') {
        await svc.cleanupUserGraphify(id)
      } else if (tier === 'paid' && user.tier === 'free') {
        await svc.markUserForRebuild(id)
      }
    } catch (err) {
      app.log.warn({ err, userId: id }, 'Graphify tier reconciliation failed')
    }

    return { success: true }
  })

  app.post('/api/admin/users/:id/tokens', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { amount, description } = request.body as { amount: number; description?: string }

    if (!amount || amount <= 0) {
      return reply.status(400).send({ message: 'Amount must be positive', statusCode: 400 })
    }

    await grantTokens(id, amount, description || 'Admin grant', request.user!.id)
    return { success: true, granted: amount }
  })

  // Admin deduct tokens from a user
  app.post('/api/admin/users/:id/tokens/deduct', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { amount, description } = request.body as { amount: number; description?: string }

    if (!amount || amount <= 0) {
      return reply.status(400).send({ message: 'Amount must be positive', statusCode: 400 })
    }

    const currentBalance = await getUserTokens(id)
    if (amount > currentBalance) {
      return reply.status(400).send({
        message: `Cannot deduct ${amount} tokens. User only has ${currentBalance} tokens available.`,
        statusCode: 400,
        currentBalance,
        requestedAmount: amount,
      })
    }

    await deductTokens(id, amount, description || `Admin deduction by ${request.user!.username}`, undefined)
    return { success: true, deducted: amount, remainingBalance: currentBalance - amount }
  })

  // ── Per-user keys: AI providers + MCPs ────────────────────────────────
  // Keys are never returned in full — only a masked preview (first 8 + last 4).
  const maskKey = (key: string) => (key.length > 12 ? `${key.slice(0, 8)}••••••••${key.slice(-4)}` : '••••••••')

  app.get('/api/admin/users/:id/keys', async (request) => {
    const { id } = request.params as { id: string }

    const allProviders = await db.select().from(aiProviders).orderBy(asc(aiProviders.name))
    const apiMcps = await db.select().from(mcps).where(eq(mcps.apiType, 'api')).orderBy(asc(mcps.name))
    const userKeys = await db.select().from(providerApiKeys).where(eq(providerApiKeys.userId, id))

    const byProvider = new Map(userKeys.filter(k => k.providerId).map(k => [k.providerId, k]))
    const byMcp = new Map(userKeys.filter(k => k.mcpId).map(k => [k.mcpId, k]))

    return {
      providers: allProviders.map(p => {
        const k = byProvider.get(p.id)
        return {
          providerId: p.id,
          name: p.name,
          slug: p.slug,
          isFree: p.isFree,
          isActive: p.isActive,
          isBuiltin: p.isBuiltin,
          hasKey: !!k,
          maskedKey: k ? maskKey(k.apiKey) : null,
        }
      }),
      mcps: apiMcps.map(m => {
        const k = byMcp.get(m.id)
        return {
          mcpId: m.id,
          name: m.name,
          isActive: m.isActive,
          hasKey: !!k,
          maskedKey: k ? maskKey(k.apiKey) : null,
        }
      }),
    }
  })

  // Set or replace a key for an AI provider OR an MCP (exactly one of providerId/mcpId).
  app.post('/api/admin/users/:id/keys', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { providerId, mcpId, apiKey } = request.body as { providerId?: string; mcpId?: string; apiKey?: string }

    if (!apiKey || !apiKey.trim()) {
      return reply.status(400).send({ message: 'API key is required', statusCode: 400 })
    }
    if (!!providerId === !!mcpId) {
      return reply.status(400).send({ message: 'Provide exactly one of providerId or mcpId', statusCode: 400 })
    }

    if (providerId) {
      const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1)
      if (!provider) return reply.status(404).send({ message: 'Provider not found', statusCode: 404 })

      // Paid providers: key may only be held by paid users.
      if (!provider.isFree) {
        const [u] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, id)).limit(1)
        if (!u || u.tier !== 'paid') {
          return reply.status(403).send({
            message: `Cannot add a key for ${provider.name}. User must be on the paid tier to hold paid-provider keys.`,
            statusCode: 403,
          })
        }
      }

      const [existing] = await db.select().from(providerApiKeys)
        .where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.providerId, providerId))).limit(1)
      if (existing) {
        await db.update(providerApiKeys)
          .set({ apiKey: apiKey.trim(), isActive: true, updatedAt: new Date() })
          .where(eq(providerApiKeys.id, existing.id))
      } else {
        await db.insert(providerApiKeys).values({
          userId: id, providerId, provider: provider.slug, apiKey: apiKey.trim(), createdBy: request.user!.id, isActive: true,
        })
      }
      return { success: true }
    }

    // MCP key
    const [mcp] = await db.select().from(mcps).where(eq(mcps.id, mcpId!)).limit(1)
    if (!mcp) return reply.status(404).send({ message: 'MCP not found', statusCode: 404 })
    if (mcp.apiType !== 'api') return reply.status(400).send({ message: 'This MCP does not use an API key', statusCode: 400 })

    const [existing] = await db.select().from(providerApiKeys)
      .where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.mcpId, mcpId!))).limit(1)
    if (existing) {
      await db.update(providerApiKeys)
        .set({ apiKey: apiKey.trim(), isActive: true, updatedAt: new Date() })
        .where(eq(providerApiKeys.id, existing.id))
    } else {
      await db.insert(providerApiKeys).values({
        userId: id, mcpId: mcpId!, apiKey: apiKey.trim(), createdBy: request.user!.id, isActive: true,
      })
    }
    return { success: true }
  })

  // Remove a key for an AI provider OR an MCP (query: ?providerId=… or ?mcpId=…).
  app.delete('/api/admin/users/:id/keys', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { providerId, mcpId } = request.query as { providerId?: string; mcpId?: string }
    if (providerId) {
      await db.delete(providerApiKeys).where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.providerId, providerId)))
    } else if (mcpId) {
      await db.delete(providerApiKeys).where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.mcpId, mcpId)))
    } else {
      return reply.status(400).send({ message: 'Provide providerId or mcpId', statusCode: 400 })
    }
    return { success: true }
  })
}
