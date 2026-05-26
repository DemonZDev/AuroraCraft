import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from './env.js'
import { processManager } from './bridges/opencode-process-manager.js'
import { initializeSharedCaches } from './utils/shared-cache.js'
import corsPlugin from './plugins/cors.js'
import cookiePlugin from './plugins/cookie.js'
import websocketPlugin from './plugins/websocket.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { projectRoutes } from './routes/projects.js'
import { agentRoutes } from './routes/agents.js'
import { adminRoutes } from './routes/admin.js'
import { communityRoutes } from './routes/community.js'
import { githubRoutes } from './routes/github.js'
import coderabbitRoutes from './routes/coderabbit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  },
})

await initializeSharedCaches()

// Plugins
await app.register(corsPlugin)
await app.register(cookiePlugin)
await app.register(websocketPlugin)
await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } })

// Routes
await app.register(authRoutes)
await app.register(healthRoutes)
await app.register(projectRoutes)
await app.register(agentRoutes)
await app.register(adminRoutes)
await app.register(communityRoutes)
await app.register(githubRoutes)
await app.register(coderabbitRoutes)

// Serve built client in production
const clientDist = path.resolve(__dirname, '../../client/dist')
await app.register(fastifyStatic, {
  root: clientDist,
  prefix: '/',
  wildcard: true,
})

// SPA fallback — serve index.html for non-API routes
app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/api')) {
    return reply.status(404).send({ message: 'Not found', statusCode: 404 })
  }
  return reply.sendFile('index.html')
})

// Graceful shutdown: stop all OpenCode instances
app.addHook('onClose', async () => {
  await processManager.shutdown()
})

// Start
try {
  await app.listen({ port: env.PORT, host: env.HOST })
  console.log(`Server running at http://${env.HOST}:${env.PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Graceful shutdown: release the port so PM2 restarts don't hit EADDRINUSE
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`)
  try {
    await app.close()
  } catch (err) {
    app.log.error(err)
  }
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
