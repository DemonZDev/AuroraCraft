import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';

export async function adminRoutes(app: FastifyInstance) {

    // Get overview stats
    app.get('/stats', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Get admin dashboard statistics',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const [
            userCount,
            sessionCount,
            messageCount,
            compileCount,
            providerCount,
            modelCount,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.session.count(),
            prisma.chatMessage.count(),
            prisma.compileJob.count(),
            prisma.provider.count(),
            prisma.model.count(),
        ]);

        const recentTransactions = await prisma.tokenTransaction.aggregate({
            _sum: { totalChars: true, cost: true },
            where: {
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
        });

        const compileStats = await prisma.compileJob.groupBy({
            by: ['status'],
            _count: true,
        });

        return {
            users: userCount,
            sessions: sessionCount,
            messages: messageCount,
            compileJobs: compileCount,
            providers: providerCount,
            models: modelCount,
            last24h: {
                totalChars: recentTransactions._sum.totalChars || 0,
                totalCost: recentTransactions._sum.cost || 0,
            },
            compileByStatus: compileStats.reduce((acc, s) => {
                acc[s.status] = s._count;
                return acc;
            }, {} as Record<string, number>),
        };
    });

    // List users
    app.get('/users', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'List all users',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                tokenBalance: true,
                createdAt: true,
                _count: { select: { sessions: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return { users };
    });

    // Get user by ID
    app.get('/users/:id', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Get user details',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                tokenBalance: true,
                createdAt: true,
                sessions: {
                    select: { id: true, title: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
                tokenTransactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }

        return { user };
    });

    // Update user
    app.patch('/users/:id', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Update user (role, tokens)',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;
        const body = request.body as { role?: 'USER' | 'ADMIN'; tokenBalance?: number; password?: string };

        const updateData: any = {};
        if (body.role) updateData.role = body.role;
        if (typeof body.tokenBalance === 'number') updateData.tokenBalance = body.tokenBalance;
        if (body.password) updateData.passwordHash = await bcrypt.hash(body.password, 12);

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                tokenBalance: true,
            },
        });

        return { user };
    });

    // Delete user
    app.delete('/users/:id', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Delete user and all their data',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;
        const currentUser = (request as any).user;

        if (id === currentUser.id) {
            return reply.status(400).send({ error: 'Cannot delete yourself' });
        }

        await prisma.user.delete({ where: { id } });

        return { success: true };
    });

    // Get logs
    app.get('/logs', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Get system logs',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { type, limit = '50' } = request.query as { type?: string; limit?: string };

        const logs = await prisma.log.findMany({
            where: type ? { type: type as any } : undefined,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            include: {
                user: { select: { id: true, username: true } },
            },
        });

        return { logs };
    });

    // Get token transactions
    app.get('/transactions', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Get token transaction history',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { limit = '50' } = request.query as { limit?: string };

        const transactions = await prisma.tokenTransaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            include: {
                user: { select: { id: true, username: true } },
                provider: { select: { id: true, displayName: true } },
                model: { select: { id: true, displayName: true } },
            },
        });

        return { transactions };
    });

    // Update settings (AI name, etc.)
    app.patch('/settings', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Update global settings',
            tags: ['Admin'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        // Settings would be stored in a separate table or config
        // For now, return a stub
        const body = request.body as { aiName?: string; logoUrl?: string };

        return {
            success: true,
            settings: body,
            message: 'Settings saved (stub)',
        };
    });
}
