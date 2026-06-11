import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { sql, eq, desc, asc, and, or, ilike } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { projects } from '../db/schema/projects.js'
import { agentSessions } from '../db/schema/agent-sessions.js'
import { providerApiKeys, tokenTransactions } from '../db/schema/provider-api-keys.js'
import { aiProviders } from '../db/schema/ai-providers.js'
import { mcps } from '../db/schema/mcps.js'
import { sessions } from '../db/schema/sessions.js'
import { authMiddleware, adminGuard } from '../middleware/auth.js'
import { grantTokens, getUserTokens, deductTokens } from '../utils/token-service.js'
import { hashPassword } from '../utils/password.js'
import { changeSystemUserPassword, deleteSystemUser, toSystemUsername } from '../utils/system-user.js'
import { deleteProjectArtifacts } from '../utils/project-deletion.js'

const execFileAsync = promisify(execFile)

/** `rm -rf <path>` with sudo unless already root. Best-effort; logs are the caller's job. */
async function sudoRmrf(targetPath: string): Promise<void> {
  if (process.getuid?.() === 0) {
    await execFileAsync('rm', ['-rf', targetPath])
  } else {
    await execFileAsync('sudo', ['rm', '-rf', targetPath])
  }
}

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

  // List all projects with owner info (admin view). Optional ?search= matches
  // project name OR owner username (case-insensitive).
  app.get('/api/admin/projects', async (request) => {
    const { search } = request.query as { search?: string }
    const s = search?.trim()
    const where = s ? or(ilike(projects.name, `%${s}%`), ilike(users.username, `%${s}%`)) : undefined

    const q = db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        suspended: projects.suspended,
        software: projects.software,
        language: projects.language,
        compiler: projects.compiler,
        visibility: projects.visibility,
        linkId: projects.linkId,
        userId: projects.userId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        ownerUsername: users.username,
        ownerSuspended: users.suspended,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))

    return await (where ? q.where(where) : q).orderBy(desc(projects.createdAt))
  })

  // Single project + owner info (powers the admin workspace header).
  app.get('/api/admin/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await db
      .select({
        id: projects.id,
        name: projects.name,
        linkId: projects.linkId,
        suspended: projects.suspended,
        software: projects.software,
        language: projects.language,
        compiler: projects.compiler,
        javaVersion: projects.javaVersion,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerSuspended: users.suspended,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .where(eq(projects.id, id))
      .limit(1)
    if (!row) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    return row
  })

  // Suspend / unsuspend a single project.
  app.patch('/api/admin/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { suspended, reason } = request.body as { suspended?: boolean; reason?: string }
    if (typeof suspended !== 'boolean') {
      return reply.status(400).send({ message: 'suspended (boolean) is required', statusCode: 400 })
    }
    const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1)
    if (!existing) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })
    await db
      .update(projects)
      .set({ suspended, suspendedReason: suspended ? (reason?.trim() || null) : null, updatedAt: new Date() })
      .where(eq(projects.id, id))
    return { success: true, suspended }
  })

  // Delete any project (workspace + isolated config + OpenCode history + DB rows).
  app.delete('/api/admin/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db
      .select({ id: projects.id, linkId: projects.linkId, userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)
    if (!existing) return reply.status(404).send({ message: 'Project not found', statusCode: 404 })

    const [owner] = await db.select({ username: users.username }).from(users).where(eq(users.id, existing.userId)).limit(1)
    await db.delete(projects).where(eq(projects.id, id))
    if (owner?.username) void deleteProjectArtifacts(owner.username, existing.linkId)
    return reply.status(204).send()
  })

  app.get('/api/admin/users/detailed', async (request) => {
    const { search } = request.query as { search?: string }
    const s = search?.trim()
    const where = s ? or(ilike(users.username, `%${s}%`), ilike(users.email, `%${s}%`)) : undefined

    const q = db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        tier: users.tier,
        suspended: users.suspended,
        aiTokens: users.aiTokens,
        tokensUsed: users.tokensUsed,
        coderabbitEnabled: users.coderabbitEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)

    return await (where ? q.where(where) : q).orderBy(desc(users.createdAt))
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

  // Update a user's email and/or password.
  const updateUserSchema = z.object({
    email: z.string().email().max(255).optional(),
    password: z.string().min(8).max(128).optional(),
  })
  app.patch('/api/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateUserSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message, statusCode: 400 })
    }
    const { email, password } = parsed.data
    if (!email && !password) {
      return reply.status(400).send({ message: 'Provide an email and/or a password to update', statusCode: 400 })
    }

    const [user] = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!user) return reply.status(404).send({ message: 'User not found', statusCode: 404 })

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (email && email !== user.email) {
      const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
      if (dup && dup.id !== id) {
        return reply.status(409).send({ message: 'That email is already in use', statusCode: 409 })
      }
      updates.email = email
    }

    if (password) {
      updates.passwordHash = await hashPassword(password)
    }

    await db.update(users).set(updates).where(eq(users.id, id))

    if (password) {
      // Keep the Linux account password in sync (best-effort) and force a re-login.
      await changeSystemUserPassword(user.username, password).catch((err) =>
        app.log.warn({ err, userId: id }, 'Failed to sync Linux password'))
      await db.delete(sessions).where(eq(sessions.userId, id))
    }

    return { success: true }
  })

  // Suspend / unsuspend a user. Admins and the acting admin themselves are protected.
  app.patch('/api/admin/users/:id/suspended', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { suspended, reason } = request.body as { suspended?: boolean; reason?: string }
    if (typeof suspended !== 'boolean') {
      return reply.status(400).send({ message: 'suspended (boolean) is required', statusCode: 400 })
    }
    if (id === request.user!.id) {
      return reply.status(400).send({ message: 'You cannot suspend your own account', statusCode: 400 })
    }
    const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1)
    if (!target) return reply.status(404).send({ message: 'User not found', statusCode: 404 })
    if (target.role === 'admin') {
      return reply.status(400).send({ message: 'Admin accounts cannot be suspended', statusCode: 400 })
    }
    await db
      .update(users)
      .set({ suspended, suspendedReason: suspended ? (reason?.trim() || null) : null, updatedAt: new Date() })
      .where(eq(users.id, id))
    return { success: true, suspended }
  })

  // Delete a user entirely: all projects (workspace + isolated config + OpenCode history),
  // DB rows, the Linux home (userdel -r), and the user's isolated config base dir.
  // Global shared caches are never touched. Admins and self are protected.
  app.delete('/api/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    if (id === request.user!.id) {
      return reply.status(400).send({ message: 'You cannot delete your own account', statusCode: 400 })
    }
    const [target] = await db
      .select({ id: users.id, username: users.username, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!target) return reply.status(404).send({ message: 'User not found', statusCode: 404 })
    if (target.role === 'admin') {
      return reply.status(400).send({ message: 'Admin accounts cannot be deleted', statusCode: 400 })
    }

    // Clean up each project's on-disk + OpenCode artifacts (home dir is also removed below).
    const userProjects = await db.select({ linkId: projects.linkId }).from(projects).where(eq(projects.userId, id))
    for (const p of userProjects) {
      await deleteProjectArtifacts(target.username, p.linkId)
    }

    // Pre-clean FK rows lacking ON DELETE CASCADE, then delete the user (cascades the rest).
    await db.delete(providerApiKeys).where(eq(providerApiKeys.userId, id))
    await db.delete(tokenTransactions).where(eq(tokenTransactions.userId, id))
    await db.update(providerApiKeys).set({ createdBy: null }).where(eq(providerApiKeys.createdBy, id))
    await db.delete(users).where(eq(users.id, id))

    // Remove the Linux account + home and the user's isolated config base dir.
    await deleteSystemUser(target.username)
    const configBase = `/var/lib/auroracraft/configs/${toSystemUsername(target.username)}`
    await sudoRmrf(configBase).catch((err) =>
      app.log.warn({ err, configBase }, 'Failed to remove user isolated config base dir'))

    return reply.status(204).send()
  })

  // ── Per-user keys: AI providers + MCPs ────────────────────────────────
  // Keys are never returned in full — only a masked preview (first 8 + last 4).
  const maskKey = (key: string) => (key.length > 12 ? `${key.slice(0, 8)}••••••••${key.slice(-4)}` : '••••••••')

  app.get('/api/admin/users/:id/keys', async (request) => {
    const { id } = request.params as { id: string }

    const allProviders = await db.select().from(aiProviders).orderBy(asc(aiProviders.name))
    const apiMcps = await db.select().from(mcps).where(eq(mcps.apiType, 'api')).orderBy(asc(mcps.name))
    const userKeys = await db.select().from(providerApiKeys).where(eq(providerApiKeys.userId, id))

    const byMcp = new Map(userKeys.filter(k => k.mcpId).map(k => [k.mcpId, k]))

    return {
      providers: allProviders.map(p => {
        const userKeysForProvider = userKeys.filter(k => k.providerId === p.id)
        // Free providers: exactly one key (flat mask). Paid: list all keys with their accounting.
        return {
          providerId: p.id,
          name: p.name,
          slug: p.slug,
          isFree: p.isFree,
          isActive: p.isActive,
          isBuiltin: p.isBuiltin,
          keys: p.isFree
            ? (userKeysForProvider.length
                ? [{ id: userKeysForProvider[0].id, maskedKey: maskKey(userKeysForProvider[0].apiKey) }]
                : [])
            : userKeysForProvider.sort((a, b) => a.weight - b.weight).map(k => ({
                id: k.id,
                maskedKey: maskKey(k.apiKey),
                label: k.label ?? null,
                weight: k.weight,
                limitUsd: k.limitUsd ?? null,
                usedUsd: k.usedUsd ?? 0,
                isActive: k.isActive,
                exhaustedAt: k.exhaustedAt ?? null,
              })),
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
  // Paid providers allow multiple keys per user; free providers reject a second key (§6.3).
  app.post('/api/admin/users/:id/keys', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { providerId, mcpId, apiKey, label, weight, limitUsd } = request.body as {
      providerId?: string; mcpId?: string; apiKey?: string; label?: string; weight?: number; limitUsd?: number | null
    }

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
        // Append — paid providers allow multiple keys per user.
        await db.insert(providerApiKeys).values({
          userId: id,
          providerId,
          provider: provider.slug,
          apiKey: apiKey.trim(),
          createdBy: request.user!.id,
          isActive: true,
          label: label?.trim() || null,
          weight: weight ?? 100,
          limitUsd: limitUsd ?? null,
          usedUsd: 0,
        })
        return { success: true }
      }

      // Free provider: reject if the user already holds a key for it.
      const [existing] = await db.select().from(providerApiKeys)
        .where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.providerId, providerId))).limit(1)
      if (existing) {
        // Replace the existing row's key (upsert semantics for the single-key free provider).
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

    // MCP key (unchanged)
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

  // Per-key update (paid providers only): label, weight, limit, enabled state.
  app.patch('/api/admin/users/:id/keys/:keyId', async (request, reply) => {
    const { id, keyId } = request.params as { id: string; keyId: string }
    const { label, weight, limitUsd, isActive } = request.body as {
      label?: string | null; weight?: number; limitUsd?: number | null; isActive?: boolean
    }
    const [existing] = await db.select().from(providerApiKeys)
      .where(and(eq(providerApiKeys.id, keyId), eq(providerApiKeys.userId, id)))
      .limit(1)
    if (!existing || !existing.providerId) {
      return reply.status(404).send({ message: 'Key not found', statusCode: 404 })
    }
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, existing.providerId)).limit(1)
    if (!provider || provider.isFree) {
      return reply.status(400).send({ message: 'Free providers do not support per-key routing fields.', statusCode: 400 })
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (label !== undefined) updates.label = label?.trim() || null
    if (weight !== undefined) updates.weight = weight
    if (limitUsd !== undefined) updates.limitUsd = limitUsd
    if (isActive !== undefined) updates.isActive = isActive
    // If re-enabled, clear the exhaustion marker so a "power-cycled" key is routable again.
    if (isActive === true) updates.exhaustedAt = null
    await db.update(providerApiKeys).set(updates).where(eq(providerApiKeys.id, keyId))
    return { success: true }
  })

  // Reset usage for a key: usedUsd → 0, exhaustedAt → null, isActive → true.
  // Used when an admin tops up the underlying provider card.
  app.post('/api/admin/users/:id/keys/:keyId/reset-usage', async (request, reply) => {
    const { id, keyId } = request.params as { id: string; keyId: string }
    const [existing] = await db.select().from(providerApiKeys)
      .where(and(eq(providerApiKeys.id, keyId), eq(providerApiKeys.userId, id)))
      .limit(1)
    if (!existing) return reply.status(404).send({ message: 'Key not found', statusCode: 404 })
    await db.update(providerApiKeys)
      .set({ usedUsd: 0, exhaustedAt: null, isActive: true, updatedAt: new Date() })
      .where(eq(providerApiKeys.id, keyId))
    return { success: true }
  })

  // Remove a key: for a paid provider, target it by keyId; for a free provider or an
  // MCP, the old providerId/mcpId semantics still work (delete the (user,provider) or
  // (user,mcp) row — which for free providers is always exactly one row).
  app.delete('/api/admin/users/:id/keys', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { keyId, providerId, mcpId } = request.query as { keyId?: string; providerId?: string; mcpId?: string }
    if (keyId) {
      // Delete the specific key row — validated to belong to this user.
      await db.delete(providerApiKeys).where(and(eq(providerApiKeys.id, keyId), eq(providerApiKeys.userId, id)))
      return { success: true }
    }
    if (providerId) {
      await db.delete(providerApiKeys).where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.providerId, providerId)))
    } else if (mcpId) {
      await db.delete(providerApiKeys).where(and(eq(providerApiKeys.userId, id), eq(providerApiKeys.mcpId, mcpId)))
    } else {
      return reply.status(400).send({ message: 'Provide keyId, providerId, or mcpId', statusCode: 400 })
    }
    return { success: true }
  })
}
