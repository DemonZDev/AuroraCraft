import prisma from '../../config/database.js';
import { createError } from '../../middleware/errorHandler.js';
import { AuthType } from '@prisma/client';

export interface ProviderConfig {
    id: string;
    name: string;
    baseUrl: string;
    authType: AuthType;
    apiKey?: string;
    customHeaders?: Record<string, string>;
    defaultPayload?: Record<string, any>;
}

export interface ModelConfig {
    id: string;
    name: string;
    modelId: string;
    inputTokenCost: number;
    outputTokenCost: number;
    maxContextLength: number;
    provider: ProviderConfig;
}

export async function getEnabledProviders(): Promise<ProviderConfig[]> {
    const providers = await prisma.provider.findMany({
        where: { isEnabled: true },
        select: {
            id: true,
            name: true,
            baseUrl: true,
            authType: true,
            apiKey: true,
            customHeaders: true,
            defaultPayload: true,
        },
    });

    return providers.map((p) => ({
        ...p,
        apiKey: p.apiKey || undefined,
        customHeaders: p.customHeaders as Record<string, string> | undefined,
        defaultPayload: p.defaultPayload as Record<string, any> | undefined,
    }));
}

export async function getVisibleModels(): Promise<any[]> {
    return prisma.model.findMany({
        where: {
            isEnabled: true,
            isVisible: true,
            provider: { isEnabled: true },
        },
        select: {
            id: true,
            name: true,
            modelId: true,
            maxContextLength: true,
            inputTokenCost: true,
            outputTokenCost: true,
            provider: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: [{ provider: { name: 'asc' } }, { name: 'asc' }],
    });
}

export async function getModelConfig(modelId: string): Promise<ModelConfig> {
    const model = await prisma.model.findUnique({
        where: { id: modelId },
        include: {
            provider: true,
        },
    });

    if (!model) {
        throw createError('Model not found', 404);
    }

    if (!model.isEnabled) {
        throw createError('Model is disabled', 400);
    }

    if (!model.provider.isEnabled) {
        throw createError('Provider is disabled', 400);
    }

    return {
        id: model.id,
        name: model.name,
        modelId: model.modelId,
        inputTokenCost: model.inputTokenCost,
        outputTokenCost: model.outputTokenCost,
        maxContextLength: model.maxContextLength,
        provider: {
            id: model.provider.id,
            name: model.provider.name,
            baseUrl: model.provider.baseUrl,
            authType: model.provider.authType,
            apiKey: model.provider.apiKey || undefined,
            customHeaders: model.provider.customHeaders as Record<string, string> | undefined,
            defaultPayload: model.provider.defaultPayload as Record<string, any> | undefined,
        },
    };
}

export function buildRequestHeaders(provider: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    switch (provider.authType) {
        case 'BEARER':
            if (provider.apiKey) {
                headers['Authorization'] = `Bearer ${provider.apiKey}`;
            }
            break;
        case 'API_KEY':
            if (provider.apiKey) {
                headers['X-API-Key'] = provider.apiKey;
            }
            break;
        case 'CUSTOM_HEADER':
            if (provider.customHeaders) {
                Object.assign(headers, provider.customHeaders);
            }
            break;
        // NONE - no auth headers
    }

    return headers;
}

export function buildRequestUrl(provider: ProviderConfig, endpoint: string = '/chat/completions'): string {
    const baseUrl = provider.baseUrl.replace(/\/$/, '');
    return `${baseUrl}${endpoint}`;
}

export async function checkProviderHealth(providerId: string): Promise<boolean> {
    const provider = await prisma.provider.findUnique({
        where: { id: providerId },
    });

    if (!provider || !provider.healthEndpoint) {
        return true; // Assume healthy if no health endpoint
    }

    try {
        const response = await fetch(provider.healthEndpoint, {
            method: 'GET',
            headers: buildRequestHeaders({
                id: provider.id,
                name: provider.name,
                baseUrl: provider.baseUrl,
                authType: provider.authType,
                apiKey: provider.apiKey || undefined,
                customHeaders: provider.customHeaders as Record<string, string> | undefined,
            }),
        });
        return response.ok;
    } catch {
        return false;
    }
}
