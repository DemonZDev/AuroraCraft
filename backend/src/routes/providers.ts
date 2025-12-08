import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../lib/encryption.js';

const createProviderSchema = z.object({
    name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1).max(100),
    baseUrl: z.string().url(),
    authType: z.enum(['BEARER', 'API_KEY', 'CUSTOM_HEADER']).default('BEARER'),
    credentials: z.string().min(1),
    headersJson: z.record(z.string()).optional(),
    healthCheckEndpoint: z.string().optional(),
    defaultPayload: z.record(z.any()).optional(),
    rateLimitRpm: z.number().int().positive().optional(),
});

const createModelSchema = z.object({
    modelId: z.string().min(1),
    displayName: z.string().min(1).max(100),
    defaultParams: z.record(z.any()).optional(),
    perCharCost: z.number().min(0).default(0.000001),
    maxTokens: z.number().int().positive().default(4096),
    tags: z.array(z.string()).optional(),
    isEnabled: z.boolean().default(true),
});

export async function providerRoutes(app: FastifyInstance) {

    // List all providers
    app.get('/', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'List all AI providers',
            tags: ['Providers'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const providers = await prisma.provider.findMany({
            where: { isEnabled: true },
            select: {
                id: true,
                name: true,
                displayName: true,
                baseUrl: true,
                authType: true,
                rateLimitRpm: true,
                isEnabled: true,
                _count: { select: { models: true } },
            },
        });

        return { providers };
    });

    // Create provider (admin only)
    app.post('/', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Create a new AI provider',
            tags: ['Providers'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = createProviderSchema.parse(request.body);

        // Encrypt credentials
        const credentialsEncrypted = encrypt(body.credentials);

        const provider = await prisma.provider.create({
            data: {
                name: body.name,
                displayName: body.displayName,
                baseUrl: body.baseUrl,
                authType: body.authType,
                credentialsEncrypted,
                headersJson: body.headersJson,
                healthCheckEndpoint: body.healthCheckEndpoint,
                defaultPayload: body.defaultPayload,
                rateLimitRpm: body.rateLimitRpm,
            },
        });

        return reply.status(201).send({ provider: { ...provider, credentialsEncrypted: '[hidden]' } });
    });

    // Get provider by ID
    app.get('/:id', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Get provider details',
            tags: ['Providers'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;

        const provider = await prisma.provider.findUnique({
            where: { id },
            include: {
                models: {
                    where: { isEnabled: true },
                    select: {
                        id: true,
                        modelId: true,
                        displayName: true,
                        perCharCost: true,
                        maxTokens: true,
                        tags: true,
                        isEnabled: true,
                    },
                },
            },
        });

        if (!provider) {
            return reply.status(404).send({ error: 'Provider not found' });
        }

        return { provider: { ...provider, credentialsEncrypted: '[hidden]' } };
    });

    // Update provider (admin only)
    app.patch('/:id', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Update provider',
            tags: ['Providers'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;
        const body = request.body as any;

        const updateData: any = { ...body };

        // Encrypt new credentials if provided
        if (body.credentials) {
            updateData.credentialsEncrypted = encrypt(body.credentials);
            delete updateData.credentials;
        }

        const provider = await prisma.provider.update({
            where: { id },
            data: updateData,
        });

        return { provider: { ...provider, credentialsEncrypted: '[hidden]' } };
    });

    // Delete provider (admin only)
    app.delete('/:id', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Delete provider',
            tags: ['Providers'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;

        await prisma.provider.delete({ where: { id } });

        return { success: true };
    });

    // List models for provider
    app.get('/:id/models', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'List models for a provider',
            tags: ['Models'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;

        const models = await prisma.model.findMany({
            where: { providerId: id },
            orderBy: { displayName: 'asc' },
        });

        return { models };
    });

    // Create model (admin only)
    app.post('/:id/models', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Create a new model for provider',
            tags: ['Models'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params;
        const body = createModelSchema.parse(request.body);

        const model = await prisma.model.create({
            data: {
                providerId: id,
                modelId: body.modelId,
                displayName: body.displayName,
                defaultParams: body.defaultParams,
                perCharCost: body.perCharCost,
                maxTokens: body.maxTokens,
                tags: body.tags || [],
                isEnabled: body.isEnabled,
            },
        });

        return reply.status(201).send({ model });
    });

    // Update model (admin only)
    app.patch('/:id/models/:mid', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Update model',
            tags: ['Models'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; mid: string } }>, reply: FastifyReply) => {
        const { mid } = request.params;
        const body = request.body as any;

        const model = await prisma.model.update({
            where: { id: mid },
            data: body,
        });

        return { model };
    });

    // Delete model (admin only)
    app.delete('/:id/models/:mid', {
        onRequest: [(app as any).requireAdmin],
        schema: {
            description: 'Delete model',
            tags: ['Models'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest<{ Params: { id: string; mid: string } }>, reply: FastifyReply) => {
        const { mid } = request.params;

        await prisma.model.delete({ where: { id: mid } });

        return { success: true };
    });

    // Get all enabled models (for UI selector)
    app.get('/models/available', {
        onRequest: [(app as any).authenticate],
        schema: {
            description: 'Get all available models for selection',
            tags: ['Models'],
            security: [{ cookieAuth: [] }],
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const models = await prisma.model.findMany({
            where: { isEnabled: true },
            include: {
                provider: {
                    select: { id: true, displayName: true, name: true },
                },
            },
            orderBy: [{ provider: { displayName: 'asc' } }, { displayName: 'asc' }],
        });

        return { models };
    });
}
