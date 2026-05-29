import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq, and, gt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions } from '../db/schema/sessions.js'
import { users } from '../db/schema/users.js'

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies.session

  if (!token) {
    reply.status(401).send({ message: 'Not authenticated', statusCode: 401 })
    return
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.token, token),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!session) {
    reply.clearCookie('session', { path: '/' })
    reply.status(401).send({ message: 'Session expired', statusCode: 401 })
    return
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)

  if (!user) {
    reply.status(401).send({ message: 'User not found', statusCode: 401 })
    return
  }

  request.user = user
}

export function adminGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  if (!request.user || request.user.role !== 'admin') {
    reply.status(403).send({ message: 'Forbidden', statusCode: 403 })
    return
  }
  done()
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string
      username: string
      email: string
      role: 'user' | 'admin'
      createdAt: Date
      updatedAt: Date
    }
  }
}
