import { Response } from 'express';
import { getModelConfig, buildRequestHeaders, buildRequestUrl } from './provider.js';
import prisma from '../../config/database.js';
import { deductTokens, calculateTokenCost } from '../token.js';
import { createError } from '../../middleware/errorHandler.js';
import { parseFileActions } from './prompts.js';
import * as fileService from '../file.js';

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
    const { sessionId, modelId, userId, res } = options;
    let messages = [...options.messages]; // Clone messages for mutation in loop

    const modelConfig = await getModelConfig(modelId);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Initial Cost Check
    const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true },
    });
    // Rough estimate for first turn
    if (!user || user.tokenBalance < (inputChars / 3)) {
        throw createError('Insufficient tokens', 402, 'INSUFFICIENT_TOKENS');
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let steps = 0;
    const MAX_STEPS = 5; // Prevent infinite loops
    const notifiedActions = new Set<string>();

    try {
        while (steps < MAX_STEPS) {
            console.log(`[Agent] Step ${steps + 1}/${MAX_STEPS}`);

            // Logic for this step
            const stepResult = await executeAgentStep({
                sessionId,
                modelId,
                messages,
                modelConfig,
                res,
                notifiedActions
            });

            totalInputTokens += stepResult.inputChars;
            totalOutputTokens += stepResult.outputChars;

            // Update history with Assistant Response
            messages.push({ role: 'assistant', content: stepResult.fullResponse });

            // Execute Actions if any
            const actions = parseFileActions(stepResult.fullResponse);

            if (actions.length > 0) {
                // We have actions -> This was a "Tool Turn"
                // Execute actions and add results to history
                const toolOutputs: string[] = [];

                for (const action of actions) {
                    console.log(`[Agent] Executing ${action.type}: ${action.path}`);
                    try {
                        let resultMsg = '';
                        if (action.type === 'CREATE_FILE') {
                            try {
                                await fileService.createFile(sessionId, action.path, action.content || '');
                                resultMsg = `Successfully created file: ${action.path}`;
                            } catch (err: any) {
                                if (err.message === 'File already exists') {
                                    await fileService.updateFile(sessionId, action.path, action.content || '');
                                    resultMsg = `File existed, updated content: ${action.path}`;
                                } else throw err;
                            }
                        } else if (action.type === 'UPDATE_FILE') {
                            await fileService.updateFile(sessionId, action.path, action.content || '');
                            resultMsg = `Successfully updated file: ${action.path}`;
                        } else if (action.type === 'DELETE_FILE') {
                            await fileService.deleteFile(sessionId, action.path);
                            resultMsg = `Successfully deleted file: ${action.path}`;
                        } else if (action.type === 'RENAME_FILE' && action.newPath) {
                            await fileService.renameFile(sessionId, action.path, action.newPath);
                            resultMsg = `Successfully renamed ${action.path} to ${action.newPath}`;
                        }

                        toolOutputs.push(resultMsg);

                        // Notify Frontend of Success
                        const pastVerb = action.type === 'CREATE_FILE' ? 'Created' :
                            action.type === 'UPDATE_FILE' ? 'Updated' :
                                action.type === 'DELETE_FILE' ? 'Deleted' : 'Renamed';
                        res.write(`data: ${JSON.stringify({ type: 'agent_log', message: `✅ ${pastVerb} ${action.path}` })}\n\n`);
                        res.write(`data: ${JSON.stringify({ type: 'refresh_files' })}\n\n`);

                    } catch (err: any) {
                        console.error(`[Agent] Tool Failed:`, err);
                        toolOutputs.push(`Error executing ${action.type} on ${action.path}: ${err.message}`);

                        res.write(`data: ${JSON.stringify({
                            type: 'agent_error',
                            message: `❌ Failed to ${action.type} ${action.path}: ${err.message}`
                        })}\n\n`);
                    }
                }

                // Append Tool Outputs to History as User/System message to prompt next step
                messages.push({
                    role: 'user',
                    content: `[System] Tool Actions Completed.\nResults:\n${toolOutputs.join('\n')}\n\nPlease continue. If you are done, output a conversational response.`
                });

                // Loop continues to next step (AI detects tool results and responds)
            } else {
                // No actions found -> This was a "Final Response"

                // Safety Check: Did we log an action start but fail to parse it?
                if (stepResult.hasLog) {
                    console.warn('[Agent] Stalled Action Detected: Log emitted but no action parsed.');
                    res.write(`data: ${JSON.stringify({
                        type: 'agent_error',
                        message: '❌ Action Failed: The AI response was malformed. Please try again.'
                    })}\n\n`);
                }

                // It was already streamed to the user.
                break; // Exit Loop
            }

            steps++;
        }

        // Final Token Deduction
        const cost = await calculateTokenCost(modelId, totalInputTokens, totalOutputTokens);
        await deductTokens(userId, cost.totalCost, 'AI_OUTPUT',
            `Agent Session (${steps} steps)`,
            { modelId, inputChars: totalInputTokens, outputChars: totalOutputTokens }
        );

        res.write(`data: ${JSON.stringify({
            done: true,
            tokensUsed: cost.totalCost,
            messageLength: totalOutputTokens
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error: any) {
        console.error('Agent Loop Error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message || 'Agent Loop Failed' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
}

// Helper to execute a single LLM turn
async function executeAgentStep(params: {
    sessionId: string,
    modelId: string,
    messages: ChatMessage[],
    modelConfig: any,
    res: any,
    notifiedActions: Set<string>
}): Promise<{ fullResponse: string, inputChars: number, outputChars: number, hasLog: boolean }> {
    const { modelId, messages, modelConfig, res, notifiedActions } = params;
    const providerName = modelConfig.provider.name.toLowerCase();

    // Construct Request (Shared Logic)
    let url: string = '';
    let headers: Record<string, string> = {};
    let requestBody: any = {};

    // Note: I will inline the request construction here to ensure correctness

    if (providerName === 'google') {
        const baseUrl = modelConfig.provider.baseUrl.replace(/\/$/, '');
        url = `${baseUrl}/models/${modelConfig.modelId}:streamGenerateContent?alt=sse&key=${modelConfig.provider.apiKey}`;
        headers = { 'Content-Type': 'application/json' };
        const contents = messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        const systemMessage = messages.find(m => m.role === 'system');
        requestBody = {
            contents,
            generationConfig: { maxOutputTokens: 16000, temperature: 0.7 },
            ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage.content }] } } : {}),
        };
    } else if (providerName === 'perplexity') {
        headers = buildRequestHeaders(modelConfig.provider);
        url = `${modelConfig.provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');
        const fixedMsgs: typeof messages = [];
        for (const msg of nonSystemMsgs) {
            if (fixedMsgs.length === 0) {
                if (msg.role === 'user') fixedMsgs.push(msg);
                else { fixedMsgs.push({ role: 'user', content: 'Continue.' }); fixedMsgs.push(msg); }
            } else {
                const last = fixedMsgs[fixedMsgs.length - 1];
                if (last.role === msg.role) last.content += '\n\n' + msg.content;
                else fixedMsgs.push(msg);
            }
        }
        requestBody = {
            model: modelConfig.modelId,
            messages: [...systemMsgs, ...fixedMsgs],
            stream: true,
            temperature: 0.7,
            ...modelConfig.provider.defaultPayload,
        };
    } else {
        headers = buildRequestHeaders(modelConfig.provider);
        if (providerName === 'openrouter') {
            headers['HTTP-Referer'] = 'https://auroracraft.local';
            headers['X-Title'] = 'AuroraCraft';
        }
        url = buildRequestUrl(modelConfig.provider);
        requestBody = {
            model: modelConfig.modelId,
            messages,
            stream: true,
            temperature: 0.7,
            // OpenRouter-specific routing options
            ...(providerName === 'openrouter' ? {
                provider: {
                    allow_fallbacks: true,
                    sort: 'throughput',
                },
            } : {}),
            ...modelConfig.provider.defaultPayload,
        };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error(await response.text());

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body');

    const decoder = new TextDecoder();
    let fullResponse = '';
    let isHiddenMode = false;
    let hasLog = false;

    // Streaming Loop
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(data);
                    let content = '';
                    if (providerName === 'google') content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    else content = parsed.choices?.[0]?.delta?.content || '';

                    if (content) {
                        const prevLen = fullResponse.length;
                        fullResponse += content;

                        // Check for Action Block Start
                        if (!isHiddenMode) {
                            // We use a loose check for '```action' to catch it early
                            const actionIndex = fullResponse.indexOf('```action');

                            if (actionIndex !== -1) {
                                isHiddenMode = true;

                                // If there is text BEFORE the action block in this chunk, write it.
                                // The part of fullResponse before prevLen was already written.
                                // We need to write from prevLen to actionIndex.
                                if (actionIndex > prevLen) {
                                    const safeChunk = fullResponse.slice(prevLen, actionIndex);
                                    if (safeChunk) {
                                        res.write(`data: ${JSON.stringify({ content: safeChunk })}\n\n`);
                                    }
                                }
                            } else {
                                // No action detected, write full content
                                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                            }
                        }

                        // Status Notification Logic (Run regardless of whether we just switched mode)
                        if (isHiddenMode) {
                            const headerPattern = /```action:(CREATE_FILE|UPDATE_FILE|DELETE_FILE|RENAME_FILE)\s*\npath:\s*(.+?)(?:\n|$)/g;
                            let match;
                            while ((match = headerPattern.exec(fullResponse)) !== null) {
                                const key = `${match[1]}:${match[2].trim()}`;
                                if (!notifiedActions.has(key)) {
                                    notifiedActions.add(key);
                                    const verb = match[1] === 'CREATE_FILE' ? 'Creating' : match[1] === 'UPDATE_FILE' ? 'Updating' : 'Processing';
                                    res.write(`data: ${JSON.stringify({ type: 'agent_log', message: `${verb} ${match[2].trim()}...` })}\n\n`);
                                    hasLog = true;
                                }
                            }
                        }
                    }
                } catch { }
            }
        }
    }

    // Input chars calculation (approx)
    const inputChars = JSON.stringify(requestBody).length;

    return {
        fullResponse,
        inputChars,
        outputChars: fullResponse.length,
        hasLog
    };
}


export async function enhancePrompt(
    prompt: string,
    modelId: string,
    userId: string
): Promise<string> {
    const modelConfig = await getModelConfig(modelId);
    const providerName = modelConfig.provider.name.toLowerCase();

    const systemPrompt = `You are an expert prompt engineer. Your task is to take a user's simple request for a Minecraft plugin and transform it into a detailed, comprehensive specification that will help an AI create the best possible plugin.

Include:
- Specific features and functionality
- Technical requirements (Minecraft version, framework preferences)
- User experience considerations
- Edge cases to handle
- Configuration options that would be useful

Keep the enhanced prompt focused and actionable. Do not include conversational text, just the enhanced requirements.`;

    let url: string;
    let headers: Record<string, string>;
    let requestBody: any;

    if (providerName === 'google') {
        const baseUrl = modelConfig.provider.baseUrl.replace(/\/$/, '');
        url = `${baseUrl}/models/${modelConfig.modelId}:generateContent?key=${modelConfig.provider.apiKey}`;
        headers = { 'Content-Type': 'application/json' };
        requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nRequest to enhance:\n${prompt}` }]
            }],
            generationConfig: {
                maxOutputTokens: 2000,
                temperature: 0.7,
            }
        };
    } else if (providerName === 'perplexity') {
        headers = buildRequestHeaders(modelConfig.provider);
        url = `${modelConfig.provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
        requestBody = {
            model: modelConfig.modelId,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Enhance this Minecraft plugin request:\n\n${prompt}` },
            ],
            max_tokens: 2000,
            temperature: 0.7,
        };
    } else {
        headers = buildRequestHeaders(modelConfig.provider);
        url = buildRequestUrl(modelConfig.provider);
        requestBody = {
            model: modelConfig.modelId,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Enhance this Minecraft plugin request:\n\n${prompt}` },
            ],
            max_tokens: 2000,
            temperature: 0.7,
        };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        throw createError(`Failed to enhance prompt: ${await response.text()}`, 500);
    }

    const data: any = await response.json();
    let enhanced = '';

    if (providerName === 'google') {
        enhanced = data.candidates?.[0]?.content?.parts?.[0]?.text || prompt;
    } else {
        enhanced = data.choices?.[0]?.message?.content || prompt;
    }

    // Get enhance cost from settings
    const enhanceCostSetting = await prisma.systemSetting.findUnique({
        where: { key: 'enhance_cost' },
    });
    const enhanceCost = parseInt(enhanceCostSetting?.value || '500', 10);

    // Deduct tokens
    await deductTokens(userId, enhanceCost, 'ENHANCE_PROMPT', 'Prompt enhancement');

    return enhanced;
}
