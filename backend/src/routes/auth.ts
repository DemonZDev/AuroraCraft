import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';

// Validation schemas
const registerSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    password: z.string().min(8).max(100),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {

    // Register
    app.post('/register', {
        schema: {
            description: 'Register a new user',
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['username', 'email', 'password'],
                properties: {
                    username: { type: 'string', minLength: 3, maxLength: 30 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                },
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                username: { type: 'string' },
                                email: { type: 'string' },
                                role: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = registerSchema.parse(request.body);

        // Check if user exists
        const existing = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: body.email },
                    { username: body.username },
                ],
            },
        });

        if (existing) {
            return reply.status(400).send({
                error: existing.email === body.email ? 'Email already registered' : 'Username taken',
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(body.password, 12);

        // Check if first user (make admin)
        const userCount = await prisma.user.count();
        const role = userCount === 0 ? 'ADMIN' : 'USER';

        // Create user
        const user = await prisma.user.create({
            data: {
                username: body.username,
                email: body.email,
                passwordHash,
                role,
                tokenBalance: role === 'ADMIN' ? 1000000 : 10000,
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                tokenBalance: true,
                createdAt: true,
            },
        });

        // Log registration
        await prisma.log.create({
            data: {
                type: 'AUTH',
                action: 'register',
                userId: user.id,
                payload: { username: user.username },
            },
        });

        // Generate JWT
        const token = app.jwt.sign({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
        });

        reply.cookie('token', token, {
            httpOnly: true,
            secure: !config.isDev,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
        });

        return reply.status(201).send({ user });
    });

    // Login
    app.post('/login', {
        schema: {
            description: 'Login with email and password',
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                },
            },
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = loginSchema.parse(request.body);

        const user = await prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user) {
            return reply.status(401).send({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(body.password, user.passwordHash);
        if (!validPassword) {
            return reply.status(401).send({ error: 'Invalid credentials' });
        }

        // Log login
        await prisma.log.create({
            data: {
                type: 'AUTH',
                action: 'login',
                userId: user.id,
            },
        });

        // Generate JWT
        const token = app.jwt.sign({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
        });

        reply.cookie('token', token, {
            httpOnly: true,
            secure: !config.isDev,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                tokenBalance: user.tokenBalance,
            },
        };
    });

    // Get current user
    app.get('/me', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Get current authenticated user',
            tags: ['Auth'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const userData = (request as any).user;

        const user = await prisma.user.findUnique({
            where: { id: userData.id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                tokenBalance: true,
                createdAt: true,
            },
        });

        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }

        return { user };
    });

    // Logout
    app.post('/logout', {
        schema: {
            description: 'Logout and clear session',
            tags: ['Auth'],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        reply.clearCookie('token', { path: '/' });
        return { success: true };
    });
}
