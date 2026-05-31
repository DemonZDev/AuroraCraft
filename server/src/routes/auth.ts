import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, or } from 'drizzle-orm'
import crypto from 'crypto'
import { mkdir } from 'fs/promises'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { sessions } from '../db/schema/sessions.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { createSystemUser, toSystemUsername } from '../utils/system-user.js'
import { authMiddleware } from '../middleware/auth.js'
import { env } from '../env.js'

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/, 'Username must be lowercase and contain only letters, numbers, underscores, and hyphens'),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
})

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
})

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function createSessionToken(): string {
  return crypto.randomBytes(48).toString('base64url')
}

function setCookieOptions() {
  let secure: boolean
  if (env.COOKIE_SECURE === 'auto') {
    secure = env.NODE_ENV === 'production' && env.COOKIE_DOMAIN !== 'localhost'
  } else {
    secure = env.COOKIE_SECURE === 'true'
  }
  return {
    path: '/' as const,
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION_MS / 1000,
  }
}

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        message: parsed.error.issues[0].message,
        statusCode: 400,
      })
    }

    const { username, email, password } = parsed.data

    // Check uniqueness
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, email)))
      .limit(1)

    if (existing) {
      return reply.status(409).send({
        message: 'Username or email already taken',
        statusCode: 409,
      })
    }

    const passwordHash = await hashPassword(password)

    const [user] = await db
      .insert(users)
      .values({ username, email, passwordHash })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })

    const token = createSessionToken()
    await db.insert(sessions).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    })

    // Create system user with home directory (adduser creates /home/auroracraft-<username> automatically)
    try {
      await createSystemUser(username, password)
    } catch (err) {
      app.log.warn({ err, username }, 'Failed to create system user — falling back to mkdir')
      const homeDir = `/home/${toSystemUsername(username)}`
      mkdir(homeDir, { recursive: true }).catch((mkdirErr) => {
        app.log.warn({ err: mkdirErr, homeDir }, 'Failed to create user home directory')
      })
    }

    reply.setCookie('session', token, setCookieOptions())

    return reply.status(201).send(user)
  })

  // Login
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        message: 'Invalid input',
        statusCode: 400,
      })
    }

    const { login, password } = parsed.data

    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.email, login), eq(users.username, login)),
      )
      .limit(1)

    if (!user) {
      return reply.status(401).send({
        message: 'Invalid credentials',
        statusCode: 401,
      })
    }

    const valid = await verifyPassword(user.passwordHash, password)
    if (!valid) {
      return reply.status(401).send({
        message: 'Invalid credentials',
        statusCode: 401,
      })
    }

    const token = createSessionToken()
    await db.insert(sessions).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    })

    // Ensure user home directory exists (defensive, non-blocking)
    const homeDir = `/home/${toSystemUsername(user.username)}`
    mkdir(homeDir, { recursive: true }).catch((err) => {
      app.log.warn({ err, homeDir }, 'Failed to ensure user home directory')
    })

    reply.setCookie('session', token, setCookieOptions())

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  })

  // Logout
  app.post('/api/auth/logout', { preHandler: [authMiddleware] }, async (request, reply) => {
    const token = request.cookies.session
    if (token) {
      await db.delete(sessions).where(eq(sessions.token, token))
    }
    reply.clearCookie('session', { path: '/' })
    return reply.status(204).send()
  })

  // Get current user
  app.get('/api/auth/me', { preHandler: [authMiddleware] }, async (request) => {
    return request.user
  })
}
