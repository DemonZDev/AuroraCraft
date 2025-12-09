import { Response } from 'express';
import { getModelConfig, buildRequestHeaders, buildRequestUrl } from './provider.js';
import prisma from '../../config/database.js';
import { deductTokens, calculateTokenCost } from '../token.js';
import { createError } from '../../middleware/errorHandler.js';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface StreamOptions {
    sessionId: string;
    modelId: string;
    messages: ChatMessage[];
    userId: string;
    mode?: 'agent' | 'plan' | 'question';
    res: Response;
}

export async function streamChatCompletion(options: StreamOptions): Promise<void> {
    const { sessionId, modelId, messages, userId, mode = 'agent', res } = options;

    // Get model config
    const modelConfig = await getModelConfig(modelId);

    // Check if user has enough tokens (estimate)
    const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedCost = Math.ceil((inputChars / 1000) * modelConfig.inputTokenCost * 1000);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true },
    });

    if (!user || user.tokenBalance < estimatedCost) {
        throw createError('Insufficient tokens for this request', 402, 'INSUFFICIENT_TOKENS');
    }

    // Build request
    const headers = buildRequestHeaders(modelConfig.provider);
    const url = buildRequestUrl(modelConfig.provider);

    const requestBody = {
        model: modelConfig.modelId,
        messages,
        stream: true,
        max_tokens: 16000,
        temperature: 0.7,
        ...modelConfig.provider.defaultPayload,
    };

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullResponse = '';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const error = await response.text();
            res.write(`data: ${JSON.stringify({ error: `API Error: ${error}` })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';

                        if (content) {
                            fullResponse += content;
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch {
                        // Skip invalid JSON
                    }
                }
            }
        }

        // Save assistant message to database
        await prisma.chatMessage.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content: fullResponse,
                modelId,
            },
        });

        // Calculate and deduct tokens
        const cost = await calculateTokenCost(modelId, inputChars, fullResponse.length);
        await deductTokens(userId, cost.totalCost, 'AI_OUTPUT',
            `Chat completion with ${modelConfig.name}`,
            { modelId, inputChars, outputChars: fullResponse.length }
        );

        // Send final done event with token info
        res.write(`data: ${JSON.stringify({
            done: true,
            tokensUsed: cost.totalCost,
            messageLength: fullResponse.length
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error: any) {
        console.error('Streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message || 'Streaming failed' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
}

export async function enhancePrompt(
    prompt: string,
    modelId: string,
    userId: string
): Promise<string> {
    const modelConfig = await getModelConfig(modelId);

    const systemPrompt = `You are an expert prompt engineer. Your task is to take a user's simple request for a Minecraft plugin and transform it into a detailed, comprehensive specification that will help an AI create the best possible plugin.

Include:
- Specific features and functionality
- Technical requirements (Minecraft version, framework preferences)
- User experience considerations
- Edge cases to handle
- Configuration options that would be useful

Keep the enhanced prompt focused and actionable. Do not include conversational text, just the enhanced requirements.`;

    const headers = buildRequestHeaders(modelConfig.provider);
    const url = buildRequestUrl(modelConfig.provider);

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: modelConfig.modelId,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Enhance this Minecraft plugin request:\n\n${prompt}` },
            ],
            max_tokens: 2000,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        throw createError('Failed to enhance prompt', 500);
    }

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content || prompt;

    // Get enhance cost from settings
    const enhanceCostSetting = await prisma.systemSetting.findUnique({
        where: { key: 'enhance_cost' },
    });
    const enhanceCost = parseInt(enhanceCostSetting?.value || '500', 10);

    // Deduct tokens
    await deductTokens(userId, enhanceCost, 'ENHANCE_PROMPT', 'Prompt enhancement');

    return enhanced;
}
