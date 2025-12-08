import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';

import { config } from './config.js';
import { prisma } from './lib/prisma.js';

// Import routes
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
import { fileRoutes } from './routes/files.js';
import { chatRoutes } from './routes/chat.js';
import { providerRoutes } from './routes/providers.js';
import { compileRoutes } from './routes/compile.js';
import { adminRoutes } from './routes/admin.js';

const app = Fastify({
    logger: {
        level: config.isDev ? 'debug' : 'info',
        transport: config.isDev ? { target: 'pino-pretty' } : undefined,
    },
});

// Global error handler for Zod validation errors
app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
        return reply.status(400).send({
            error: 'Validation failed',
            details: error.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message,
            })),
        });
    }

    // Log unexpected errors
    app.log.error(error);

    return reply.status(error.statusCode || 500).send({
        error: error.message || 'Internal server error',
    });
});

// Plugins
await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
});

await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for dev
});

await app.register(cookie);

await app.register(jwt, {
    secret: config.jwt.secret,
    cookie: {
        cookieName: 'token',
        signed: false,
    },
});

await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
});

// Swagger documentation
await app.register(swagger, {
    openapi: {
        info: {
            title: 'AuroraCraft API',
            description: 'AI-powered Minecraft plugin development platform',
            version: '1.0.0',
        },
        servers: [
            { url: `http://localhost:${config.port}`, description: 'Development' },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'token',
                },
            },
        },
    },
});

await app.register(swaggerUi, {
    routePrefix: '/docs',
});

// Decorate with Prisma
app.decorate('prisma', prisma);

// Auth decorator for protected routes
app.decorate('authenticate', async function (request: any, reply: any) {
    try {
        await request.jwtVerify();
    } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' });
    }
});

app.decorate('requireAdmin', async function (request: any, reply: any) {
    try {
        await request.jwtVerify();
        if (request.user.role !== 'ADMIN') {
            reply.status(403).send({ error: 'Admin access required' });
        }
    } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' });
    }
});

// Register routes
await app.register(authRoutes, { prefix: '/auth' });
await app.register(sessionRoutes, { prefix: '/sessions' });
await app.register(fileRoutes, { prefix: '/sessions' });
await app.register(chatRoutes, { prefix: '/sessions' });
await app.register(providerRoutes, { prefix: '/providers' });
await app.register(compileRoutes, { prefix: '/sessions' });
await app.register(adminRoutes, { prefix: '/admin' });

// Health check
app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

// Root
app.get('/', async () => {
    return {
        name: 'AuroraCraft API',
        version: '1.0.0',
        docs: '/docs',
    };
});

// Start server
const start = async () => {
    try {
        await app.listen({ port: config.port, host: config.host });
        console.log(`
🚀 AuroraCraft API Server running at http://${config.host}:${config.port}
📚 API Documentation at http://localhost:${config.port}/docs
🔧 Environment: ${config.nodeEnv}
    `);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
});

start();

export { app };
