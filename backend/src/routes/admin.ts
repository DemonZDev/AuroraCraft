import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { createError } from '../middleware/errorHandler.js';
import { hashPassword } from '../utils/password.js';
import { AuthType } from '@prisma/client';

const router = Router();

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// ==================== OVERVIEW ====================

// Get system settings
router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
        res.json({ settings: settingsMap });
    } catch (error) {
        next(error);
    }
});

// Update system setting
router.put('/settings/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { value } = req.body;

        const setting = await prisma.systemSetting.upsert({
            where: { key: req.params.key },
            update: { value },
            create: { key: req.params.key, value },
        });

        res.json({ setting });
    } catch (error) {
        next(error);
    }
});

// Get dashboard stats
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [
            userCount,
            sessionCount,
            pluginsCompiled,
            totalTokensUsed,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.session.count(),
            prisma.compilationJob.count({ where: { status: 'SUCCESS' } }),
            prisma.tokenTransaction.aggregate({
                _sum: { amount: true },
                where: { amount: { lt: 0 } },
            }),
        ]);

        res.json({
            stats: {
                users: userCount,
                sessions: sessionCount,
                pluginsCompiled,
                tokensUsed: Math.abs(totalTokensUsed._sum.amount || 0),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ==================== USERS ====================

// List all users
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true,
                    tokenBalance: true,
                    createdAt: true,
                    _count: { select: { sessions: true } },
                },
            }),
            prisma.user.count(),
        ]);

        res.json({ users, total, page, limit });
    } catch (error) {
        next(error);
    }
});

// Get user details
router.get('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                tokenBalance: true,
                createdAt: true,
                sessions: {
                    orderBy: { updatedAt: 'desc' },
                    select: {
                        id: true,
                        name: true,
                        projectType: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });

        if (!user) {
            throw createError('User not found', 404);
        }

        res.json({ user });
    } catch (error) {
        next(error);
    }
});

// Update user role
router.patch('/users/:id/role', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { role } = req.body;

        if (role !== 'USER' && role !== 'ADMIN') {
            throw createError('Invalid role', 400);
        }

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { role },
            select: { id: true, username: true, role: true },
        });

        res.json({ user });
    } catch (error) {
        next(error);
    }
});

// Add tokens to user
router.post('/users/:id/tokens', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, description } = req.body;
        const parsedAmount = parseInt(amount);

        if (isNaN(parsedAmount) || parsedAmount === 0) {
            throw createError('Invalid amount', 400);
        }

        const [user] = await prisma.$transaction([
            prisma.user.update({
                where: { id: req.params.id },
                data: { tokenBalance: { increment: parsedAmount } },
                select: { id: true, tokenBalance: true },
            }),
            prisma.tokenTransaction.create({
                data: {
                    userId: req.params.id,
                    amount: parsedAmount,
                    type: parsedAmount > 0 ? 'ADMIN_GRANT' : 'ADMIN_DEDUCT',
                    description: description || `Admin adjustment: ${parsedAmount > 0 ? '+' : ''}${parsedAmount} tokens`,
                },
            }),
        ]);

        res.json({ user });
    } catch (error) {
        next(error);
    }
});

// Delete user
router.delete('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Prevent deleting yourself
        if (req.params.id === req.user!.id) {
            throw createError('Cannot delete your own account', 400);
        }

        await prisma.user.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// ==================== PROVIDERS ====================

const providerSchema = z.object({
    name: z.string().min(1),
    baseUrl: z.string().url(),
    authType: z.enum(['BEARER', 'API_KEY', 'CUSTOM_HEADER', 'NONE']),
    apiKey: z.string().optional(),
    customHeaders: z.record(z.string()).optional(),
    healthEndpoint: z.string().optional(),
    defaultPayload: z.record(z.any()).optional(),
    isEnabled: z.boolean().default(true),
});

// List providers
router.get('/providers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const providers = await prisma.provider.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { models: true } },
            },
        });

        // Mask API keys
        const masked = providers.map(p => ({
            ...p,
            apiKey: p.apiKey ? '••••••••' + p.apiKey.slice(-4) : null,
        }));

        res.json({ providers: masked });
    } catch (error) {
        next(error);
    }
});

// Create provider
router.post('/providers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = providerSchema.parse(req.body);

        const provider = await prisma.provider.create({
            data: {
                ...data,
                authType: data.authType as AuthType,
            },
        });

        res.status(201).json({ provider });
    } catch (error) {
        next(error);
    }
});

// Update provider
router.put('/providers/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = providerSchema.partial().parse(req.body);

        // If apiKey is the masked value, don't update it
        if (data.apiKey?.startsWith('••••')) {
            delete data.apiKey;
        }

        const provider = await prisma.provider.update({
            where: { id: req.params.id },
            data: {
                ...data,
                authType: data.authType as AuthType | undefined,
            },
        });

        // If provider is being disabled, cascade-disable all its models
        if (data.isEnabled === false) {
            await prisma.model.updateMany({
                where: { providerId: req.params.id },
                data: { isEnabled: false },
            });
        }

        res.json({ provider });
    } catch (error) {
        next(error);
    }
});


// ==================== MODELS ====================

const modelSchema = z.object({
    name: z.string().min(1),
    modelId: z.string().min(1),
    inputTokenCost: z.number().min(0),
    outputTokenCost: z.number().min(0),
    maxContextLength: z.number().int().min(1000).default(128000),
    isEnabled: z.boolean().default(true),
    isVisible: z.boolean().default(true),
    providerId: z.string().uuid(),
});

// List models for a provider
router.get('/providers/:providerId/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const models = await prisma.model.findMany({
            where: { providerId: req.params.providerId },
            orderBy: { name: 'asc' },
        });
        res.json({ models });
    } catch (error) {
        next(error);
    }
});

// Create model
router.post('/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = modelSchema.parse(req.body);

        const model = await prisma.model.create({
            data,
        });

        res.status(201).json({ model });
    } catch (error) {
        next(error);
    }
});

// Update model
router.put('/models/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = modelSchema.partial().parse(req.body);

        const model = await prisma.model.update({
            where: { id: req.params.id },
            data,
        });

        res.json({ model });
    } catch (error) {
        next(error);
    }
});

// Delete model
router.delete('/models/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.model.delete({
            where: { id: req.params.id },
        });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// ==================== TOKEN ANALYTICS ====================

router.get('/analytics/tokens', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const transactions = await prisma.tokenTransaction.groupBy({
            by: ['type'],
            _sum: { amount: true },
            _count: true,
            where: {
                createdAt: { gte: startDate },
            },
        });

        const dailyUsage = await prisma.$queryRaw`
      SELECT DATE(created_at) as date, SUM(ABS(amount)) as usage
      FROM "TokenTransaction"
      WHERE created_at >= ${startDate} AND amount < 0
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

        res.json({ transactions, dailyUsage });
    } catch (error) {
        next(error);
    }
});

export default router;
