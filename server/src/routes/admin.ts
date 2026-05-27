import type { FastifyInstance } from 'fastify'
import { sql, eq, desc, and } from 'drizzle-orm'
import { access, constants } from 'fs/promises'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { projects } from '../db/schema/projects.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { providerApiKeys } from '../db/schema/provider-api-keys.js'
import { authMiddleware, adminGuard } from '../middleware/auth.js'
import { grantTokens } from '../utils/token-service.js'

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

    const systemUser = `auroracraft-${user.username}`
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

    const systemUser = `auroracraft-${user.username}`
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
      const keys = await db
        .select({ provider: providerApiKeys.provider })
        .from(providerApiKeys)
        .where(eq(providerApiKeys.userId, id))
      const paidOnlyProviders = ['fireworks', 'bluesminds']
      const blockingKeys = keys.filter(k => paidOnlyProviders.includes(k.provider))
      if (blockingKeys.length > 0) {
        const providers = blockingKeys.map(k => k.provider).join(', ')
        return reply.status(409).send({
          message: `Cannot downgrade to free tier. User has paid-only API keys configured for: ${providers}. Delete these keys first.`,
          statusCode: 409,
          providers: blockingKeys.map(k => k.provider),
        })
      }
    }

    await db.update(users).set({ tier, updatedAt: new Date() }).where(eq(users.id, id))
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

  // Per-user provider key management
  app.get('/api/admin/users/:id/provider-keys', async (request) => {
    const { id } = request.params as { id: string }
    const keys = await db
      .select()
      .from(providerApiKeys)
      .where(eq(providerApiKeys.userId, id))
      .orderBy(desc(providerApiKeys.createdAt))
    return keys.map(k => ({
      id: k.id,
      provider: k.provider,
      apiKey: k.apiKey.length > 12 ? `${k.apiKey.slice(0, 8)}••••••••${k.apiKey.slice(-4)}` : '••••••••',
      isActive: k.isActive,
      createdAt: k.createdAt,
    }))
  })

  app.post('/api/admin/users/:id/provider-keys', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { provider, apiKey } = request.body as { provider: string; apiKey: string }

    if (!provider || !apiKey) {
      return reply.status(400).send({ message: 'Provider and API key are required', statusCode: 400 })
    }

    const [existing] = await db
      .select()
      .from(providerApiKeys)
      .where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.provider, provider)))
      .limit(1)

    if (existing) {
      return reply.status(409).send({
        message: `This user already has a ${provider} API key. Use the edit button to update it.`,
        statusCode: 409,
      })
    }

    await db.insert(providerApiKeys).values({
      userId: id,
      provider,
      apiKey,
      createdBy: request.user!.id,
      isActive: true,
    })

    return { success: true }
  })

  app.patch('/api/admin/users/:id/provider-keys/:provider', async (request, reply) => {
    const { id, provider } = request.params as { id: string; provider: string }
    const { apiKey } = request.body as { apiKey: string }

    if (!apiKey || !apiKey.trim()) {
      return reply.status(400).send({ message: 'API key is required', statusCode: 400 })
    }

    await db
      .update(providerApiKeys)
      .set({ apiKey: apiKey.trim(), updatedAt: new Date() })
      .where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.provider, provider)))

    return { success: true }
  })

  app.delete('/api/admin/users/:id/provider-keys/:provider', async (request) => {
    const { id, provider } = request.params as { id: string; provider: string }
    await db
      .delete(providerApiKeys)
      .where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.provider, provider)))
    return { success: true }
  })
}
