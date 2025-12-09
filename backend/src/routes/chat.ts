import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { streamChatCompletion, enhancePrompt } from '../services/ai/streaming.js';
import { getVisibleModels } from '../services/ai/provider.js';
import { buildInitialPrompt, parseFileActions } from '../services/ai/prompts.js';
import * as fileService from '../services/file.js';

const router = Router();

const sendMessageSchema = z.object({
    content: z.string().min(1),
    modelId: z.string().uuid(),
    mode: z.enum(['agent', 'plan', 'question']).default('agent'),
});

const enhanceSchema = z.object({
    prompt: z.string().min(1),
    modelId: z.string().uuid(),
});

// Get available models (public)
router.get('/models', optionalAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const models = await getVisibleModels();
        res.json({ models });
    } catch (error) {
        next(error);
    }
});

// Send message and stream response
router.post('/:sessionId/message', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = sendMessageSchema.parse(req.body);

        // Verify session ownership
        const session = await prisma.session.findFirst({
            where: { id: req.params.sessionId, userId: req.user!.id },
            include: {
                files: { select: { path: true } },
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: { role: true, content: true },
                },
            },
        });

        if (!session) {
            throw createError('Session not found', 404);
        }

        // Save user message
        await prisma.chatMessage.create({
            data: {
                sessionId: req.params.sessionId,
                role: 'USER',
                content: data.content,
            },
        });

        // Build messages array with system prompt
        const systemPrompt = buildInitialPrompt(data.mode, {
            name: session.name,
            fileTree: session.files.map(f => f.path),
        });

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...session.messages.map(m => ({
                role: m.role.toLowerCase() as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: data.content },
        ];

        // Stream response
        await streamChatCompletion({
            sessionId: req.params.sessionId,
            modelId: data.modelId,
            messages,
            userId: req.user!.id,
            mode: data.mode,
            res,
        });
    } catch (error) {
        // If headers already sent, we can't send error response
        if (res.headersSent) {
            console.error('Streaming error:', error);
            res.write(`data: ${JSON.stringify({ error: 'Streaming failed' })}\n\n`);
            res.end();
        } else {
            next(error);
        }
    }
});

// Enhance prompt
router.post('/enhance', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = enhanceSchema.parse(req.body);
        const enhanced = await enhancePrompt(data.prompt, data.modelId, req.user!.id);
        res.json({ enhanced });
    } catch (error) {
        next(error);
    }
});

// Apply file actions from AI response
router.post('/:sessionId/apply-actions', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { response } = req.body;

        // Verify session ownership
        const session = await prisma.session.findFirst({
            where: { id: req.params.sessionId, userId: req.user!.id },
        });

        if (!session) {
            throw createError('Session not found', 404);
        }

        // Parse file actions from response
        const actions = parseFileActions(response);
        const results: { action: string; path: string; success: boolean; error?: string }[] = [];

        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'CREATE_FILE':
                        await fileService.createFile(req.params.sessionId, action.path, action.content || '', false);
                        break;
                    case 'UPDATE_FILE':
                        await fileService.updateFile(req.params.sessionId, action.path, action.content || '');
                        break;
                    case 'DELETE_FILE':
                        await fileService.deleteFile(req.params.sessionId, action.path);
                        break;
                    case 'RENAME_FILE':
                        if (action.newPath) {
                            await fileService.renameFile(req.params.sessionId, action.path, action.newPath);
                        }
                        break;
                }
                results.push({ action: action.type, path: action.path, success: true });
            } catch (error: any) {
                results.push({
                    action: action.type,
                    path: action.path,
                    success: false,
                    error: error.message
                });
            }
        }

        res.json({ results, totalActions: actions.length });
    } catch (error) {
        next(error);
    }
});

// Get chat history
router.get('/:sessionId/history', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = await prisma.session.findFirst({
            where: { id: req.params.sessionId, userId: req.user!.id },
        });

        if (!session) {
            throw createError('Session not found', 404);
        }

        const messages = await prisma.chatMessage.findMany({
            where: { sessionId: req.params.sessionId },
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
        });

        res.json({ messages });
    } catch (error) {
        next(error);
    }
});

export default router;
