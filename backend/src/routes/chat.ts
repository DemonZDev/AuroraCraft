import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { llmAdapter } from '../lib/llm-adapter.js';

const sendMessageSchema = z.object({
    content: z.string().min(1).max(50000),
    modelId: z.string().optional(),
    mode: z.enum(['AGENT', 'PLAN', 'QUESTION']).optional().default('AGENT'),
    promptEnhance: z.boolean().optional().default(false),
});

export async function chatRoutes(app: FastifyInstance) {

    // Send message (with streaming response)
    app.post('/:id/chat', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Send message to AI and get streaming response',
            tags: ['Chat'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;
        const body = sendMessageSchema.parse(request.body);

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        // Get user for token check
        const userData = await prisma.user.findUnique({
            where: { id: user.id },
        });

        if (!userData || userData.tokenBalance <= 0) {
            return reply.status(402).send({ error: 'Insufficient tokens' });
        }

        // Save user message
        const userMessage = await prisma.chatMessage.create({
            data: {
                sessionId: id,
                userId: user.id,
                role: 'USER',
                content: body.content,
                mode: body.mode,
                promptChars: body.content.length,
            },
        });

        // Get recent chat history for context
        const history = await prisma.chatMessage.findMany({
            where: { sessionId: id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        // Get selected model or default
        let model;
        if (body.modelId) {
            model = await prisma.model.findFirst({
                where: { id: body.modelId, isEnabled: true },
                include: { provider: true },
            });
        }

        if (!model) {
            model = await prisma.model.findFirst({
                where: { isEnabled: true },
                include: { provider: true },
            });
        }

        if (!model) {
            return reply.status(400).send({ error: 'No AI models available' });
        }

        // Set up SSE streaming
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');

        try {
            // Call LLM adapter
            const response = await llmAdapter.chat({
                provider: model.provider,
                model: model,
                messages: history.reverse().map(m => ({
                    role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
                    content: m.content,
                })),
                mode: body.mode,
                session: session,
                onStream: (chunk: string) => {
                    reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                },
            });

            // Finalize stream
            reply.raw.write(`data: ${JSON.stringify({ done: true, content: response.content })}\n\n`);
            reply.raw.end();

            // Save assistant message
            const assistantMessage = await prisma.chatMessage.create({
                data: {
                    sessionId: id,
                    role: 'ASSISTANT',
                    content: response.content,
                    mode: body.mode,
                    modelId: model.id,
                    responseChars: response.content.length,
                },
            });

            // Record token transaction
            const totalChars = body.content.length + response.content.length;
            const cost = Number(model.perCharCost) * totalChars;

            await prisma.tokenTransaction.create({
                data: {
                    userId: user.id,
                    sessionId: id,
                    providerId: model.providerId,
                    modelId: model.id,
                    promptChars: body.content.length,
                    responseChars: response.content.length,
                    totalChars,
                    cost,
                },
            });

            // Deduct tokens
            await prisma.user.update({
                where: { id: user.id },
                data: { tokenBalance: { decrement: totalChars } },
            });

        } catch (error: any) {
            reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            reply.raw.end();
        }
    });

    // Get chat history
    app.get('/:id/history', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Get chat message history for session',
            tags: ['Chat'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const user = (request as any).user;
        const { id } = request.params;

        const session = await prisma.session.findFirst({
            where: { id, ownerId: user.id },
        });

        if (!session) {
            return reply.status(404).send({ error: 'Session not found' });
        }

        const messages = await prisma.chatMessage.findMany({
            where: { sessionId: id },
            orderBy: { createdAt: 'asc' },
        });

        return { messages };
    });

    // Enhance prompt
    app.post('/enhance', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Enhance a prompt using AI',
            tags: ['Chat'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).user;
        const { prompt } = request.body as { prompt: string };

        if (!prompt) {
            return reply.status(400).send({ error: 'Prompt required' });
        }

        const model = await prisma.model.findFirst({
            where: { isEnabled: true },
            include: { provider: true },
        });

        if (!model) {
            return reply.status(400).send({ error: 'No AI models available' });
        }

        try {
            const response = await llmAdapter.enhance({
                provider: model.provider,
                model: model,
                prompt,
            });

            const estimatedCost = Number(model.perCharCost) * (prompt.length + response.enhanced.length);

            return {
                original: prompt,
                enhanced: response.enhanced,
                estimatedCost: Math.ceil(estimatedCost * 1000000), // In micro-units
                estimatedTokens: prompt.length + response.enhanced.length,
            };
        } catch (error: any) {
            return reply.status(500).send({ error: error.message });
        }
    });
}
