import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { ProjectType } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const createSessionSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    projectType: z.enum(['MINECRAFT_PLUGIN', 'MINECRAFT_MOD', 'DISCORD_BOT', 'CHROME_EXTENSION', 'WEB_APP']).default('MINECRAFT_PLUGIN'),
});

// Get all sessions for user
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessions = await prisma.session.findMany({
            where: { userId: req.user!.id },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                name: true,
                description: true,
                projectType: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        files: true,
                        messages: true,
                    },
                },
            },
        });

        res.json({ sessions });
    } catch (error) {
        next(error);
    }
});

// Create new session
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createSessionSchema.parse(req.body);

        const session = await prisma.session.create({
            data: {
                ...data,
                projectType: data.projectType as ProjectType,
                userId: req.user!.id,
            },
        });

        res.status(201).json({ session });
    } catch (error) {
        next(error);
    }
});

// Get single session
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
            include: {
                files: {
                    select: {
                        id: true,
                        path: true,
                        name: true,
                        isFolder: true,
                        updatedAt: true,
                    },
                    orderBy: [{ isFolder: 'desc' }, { path: 'asc' }],
                },
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        role: true,
                        content: true,
                        createdAt: true,
                        model: {
                            select: { name: true },
                        },
                    },
                },
                compilationJobs: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        status: true,
                        createdAt: true,
                        completedAt: true,
                    },
                },
            },
        });

        if (!session) {
            throw createError('Session not found', 404);
        }

        res.json({ session });
    } catch (error) {
        next(error);
    }
});

// Update session
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = await prisma.session.findFirst({
            where: { id: req.params.id, userId: req.user!.id },
        });

        if (!session) {
            throw createError('Session not found', 404);
        }

        const updated = await prisma.session.update({
            where: { id: req.params.id },
            data: {
                name: req.body.name,
                description: req.body.description,
            },
        });

        res.json({ session: updated });
    } catch (error) {
        next(error);
    }
});

// Delete session
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = await prisma.session.findFirst({
            where: { id: req.params.id, userId: req.user!.id },
        });

        if (!session) {
            throw createError('Session not found', 404);
        }

        // Cascade delete will handle files, messages, etc.
        await prisma.session.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
