/**
 * AgentOrchestrator
 * Core orchestration engine for multi-step agentic execution
 */

import { apiRequest } from './queryClient';
import {
    AgentEvent,
    AgentContext,
    AgentStep,
    AgentActionType,
    parseAgentResponse,
    generateCooldownMs,
    getFileName,
    PauseReason,
} from './agentEvents';
import {
    safeAIChat,
    LowBalanceError,
    ChatMessage,
} from './puterAIWrapper';

export interface OrchestratorOptions {
    sessionId: number;
    task: string;
    mode: 'agent' | 'plan' | 'question';
    modelName: string;
    maxSteps?: number;
    minCooldownMs?: number;
    maxCooldownMs?: number;
    onEvent: (event: AgentEvent) => void;
    onPause?: (context: AgentContext) => void;
    abortSignal?: AbortSignal;
    // Resume from paused context
    resumeFromContext?: AgentContext;
}

/**
 * Execute file operation via API
 */
async function executeFileOperation(
    sessionId: number,
    action: 'create' | 'update' | 'delete',
    path: string,
    content?: string
): Promise<void> {
    const fileName = getFileName(path);

    if (action === 'create' || action === 'update') {
        await apiRequest('POST', `/api/sessions/${sessionId}/files`, {
            name: fileName,
            path,
            content: content || '',
            isFolder: false,
        });
    } else if (action === 'delete') {
        // For delete, we need to find the file ID first
        const filesResponse = await apiRequest('GET', `/api/sessions/${sessionId}/files`);
        const files = await filesResponse.json();
        const file = files.find((f: any) => f.path === path);
        if (file) {
            await apiRequest('DELETE', `/api/sessions/${sessionId}/files/${file.id}`);
        }
    }
}

/**
 * Get Puter.js instance (for compatibility, still used for some checks)
 */
function getPuter(): any {
    const anyWindow = window as any;
    return anyWindow?.puter;
}

/**
 * Make a single AI request via Puter.js wrapper
 * @throws LowBalanceError if the account has no remaining usage
 */
async function makeAIRequest(
    context: AgentContext,
    systemPrompt: string,
    previousMessages: Array<{ role: string; content: string }>,
    abortSignal?: AbortSignal
): Promise<string> {
    // Build conversation with step history
    const stepHistory = context.steps.map((step) => ({
        role: 'assistant' as const,
        content: `[Step ${step.stepNumber}] ${step.action}: ${step.reasoning}`,
    }));

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...previousMessages.slice(-10).map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
        })),
        ...stepHistory.slice(-5).map(s => ({
            role: s.role as 'user' | 'assistant' | 'system',
            content: s.content,
        })),
        { role: 'user', content: context.task },
    ];

    // Use the safe wrapper that detects low balance errors
    const response = await safeAIChat(messages, { model: context.modelName });

    if (abortSignal?.aborted) {
        throw new Error('Aborted');
    }

    return response;
}

/**
 * Build agentic system prompt that enforces single-action responses
 */
async function buildAgenticSystemPrompt(
    sessionId: number,
    mode: string,
    stepNumber: number,
    filesCreated: string[],
    filesUpdated: string[]
): Promise<string> {
    // Fetch base system prompt from server
    const response = await apiRequest('POST', `/api/sessions/${sessionId}/system-prompt`, { mode });
    const data = await response.json();
    const basePrompt = data.systemPrompt || '';

    // Add agentic execution constraints
    const agenticConstraints = `

## AGENTIC EXECUTION MODE (STEP ${stepNumber})

You are operating in multi-step execution mode. You can ONLY perform ONE action per response.

### Current Progress
- Files created: ${filesCreated.length > 0 ? filesCreated.join(', ') : 'none yet'}
- Files updated: ${filesUpdated.length > 0 ? filesUpdated.join(', ') : 'none yet'}
- Current step: ${stepNumber}

### Available Actions
Pick exactly ONE action for this response:

1. **PLAN** - Outline what you will do next (no file changes)
2. **CREATE_FILE** - Create a single new file
3. **UPDATE_FILE** - Update an existing file
4. **DELETE_FILE** - Delete a file
5. **ANALYZE** - Read and analyze files
6. **COMPLETE** - Signal that the task is finished

### Response Format (REQUIRED)
You MUST respond in this EXACT format:

ACTION: <action_type>
TARGET: <file_path or "none">
REASONING: <one-line explanation of what you're doing>
---
<file content if ACTION is CREATE_FILE or UPDATE_FILE>

### Rules
- ONE action per response only
- No code in chat - use :::CREATE_FILE markers
- Keep reasoning brief (one line)
- Use TARGET: none for PLAN, ANALYZE, COMPLETE actions
`;

    return basePrompt + agenticConstraints;
}

/**
 * Run the agent orchestration loop
 */
export async function* runAgentLoop(
    options: OrchestratorOptions
): AsyncGenerator<AgentEvent> {
    const {
        sessionId,
        task,
        mode,
        modelName,
        maxSteps = 30,
        minCooldownMs = 5000,
        maxCooldownMs = 10000,
        onEvent,
        onPause,
        abortSignal,
        resumeFromContext,
    } = options;

    // Initialize context (or resume from paused context)
    const context: AgentContext = resumeFromContext ? {
        ...resumeFromContext,
        isPaused: false,
        pauseReason: null,
    } : {
        sessionId,
        task,
        mode,
        modelName,
        steps: [],
        filesCreated: [],
        filesUpdated: [],
        filesDeleted: [],
        isComplete: false,
    };

    // Determine starting step
    const startStep = resumeFromContext?.pausedAtStep ?? 1;

    // Emit resuming event if resuming
    if (resumeFromContext) {
        const resumingEvent: AgentEvent = { type: 'resuming', stepNumber: startStep };
        yield resumingEvent;
        onEvent(resumingEvent);
    } else {
        // Emit initial thinking event
        const thinkingEvent: AgentEvent = { type: 'thinking', message: 'Analyzing your request...' };
        yield thinkingEvent;
        onEvent(thinkingEvent);
    }

    // Fetch previous messages for context (if not resuming)
    let previousMessages: Array<{ role: string; content: string }> =
        resumeFromContext?.previousMessages || [];

    if (!resumeFromContext) {
        try {
            const messagesResponse = await apiRequest('GET', `/api/sessions/${sessionId}/messages`);
            const messages = await messagesResponse.json();
            previousMessages = messages.slice(-20).map((m: any) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            }));
            // Store for potential resume
            context.previousMessages = previousMessages;
        } catch {
            // Continue without history
        }
    }

    // Main execution loop
    for (let stepNumber = startStep; stepNumber <= maxSteps && !context.isComplete; stepNumber++) {
        if (abortSignal?.aborted) {
            const errorEvent: AgentEvent = { type: 'error', message: 'Execution cancelled', recoverable: false };
            yield errorEvent;
            onEvent(errorEvent);
            return;
        }

        try {
            // Build prompt for this step
            const systemPrompt = await buildAgenticSystemPrompt(
                sessionId,
                mode,
                stepNumber,
                context.filesCreated,
                context.filesUpdated
            );

            // Make AI request
            const response = await makeAIRequest(context, systemPrompt, previousMessages, abortSignal);

            // Parse the response
            const parsed = parseAgentResponse(response);

            // Record step
            const step: AgentStep = {
                stepNumber,
                action: parsed.action,
                target: parsed.target,
                reasoning: parsed.reasoning,
                content: parsed.content,
                timestamp: Date.now(),
            };
            context.steps.push(step);

            // Execute action based on type
            switch (parsed.action) {
                case 'plan': {
                    const planEvent: AgentEvent = { type: 'planning', message: parsed.reasoning };
                    yield planEvent;
                    onEvent(planEvent);
                    break;
                }

                case 'create_file': {
                    if (parsed.target && parsed.content) {
                        const fileName = getFileName(parsed.target);

                        // Emit creating event
                        const creatingEvent: AgentEvent = { type: 'file_creating', path: parsed.target, fileName };
                        yield creatingEvent;
                        onEvent(creatingEvent);

                        // Execute file creation
                        await executeFileOperation(sessionId, 'create', parsed.target, parsed.content);
                        context.filesCreated.push(fileName);

                        // Emit created event
                        const createdEvent: AgentEvent = { type: 'file_created', path: parsed.target, fileName };
                        yield createdEvent;
                        onEvent(createdEvent);
                    }
                    break;
                }

                case 'update_file': {
                    if (parsed.target && parsed.content) {
                        const fileName = getFileName(parsed.target);

                        const updatingEvent: AgentEvent = { type: 'file_updating', path: parsed.target, fileName };
                        yield updatingEvent;
                        onEvent(updatingEvent);

                        await executeFileOperation(sessionId, 'update', parsed.target, parsed.content);
                        context.filesUpdated.push(fileName);

                        const updatedEvent: AgentEvent = { type: 'file_updated', path: parsed.target, fileName };
                        yield updatedEvent;
                        onEvent(updatedEvent);
                    }
                    break;
                }

                case 'delete_file': {
                    if (parsed.target) {
                        const fileName = getFileName(parsed.target);

                        const deletingEvent: AgentEvent = { type: 'file_deleting', path: parsed.target, fileName };
                        yield deletingEvent;
                        onEvent(deletingEvent);

                        await executeFileOperation(sessionId, 'delete', parsed.target);
                        context.filesDeleted.push(fileName);

                        const deletedEvent: AgentEvent = { type: 'file_deleted', path: parsed.target, fileName };
                        yield deletedEvent;
                        onEvent(deletedEvent);
                    }
                    break;
                }

                case 'complete': {
                    context.isComplete = true;
                    const completeEvent: AgentEvent = {
                        type: 'complete',
                        summary: parsed.reasoning,
                        filesCreated: context.filesCreated,
                        filesUpdated: context.filesUpdated,
                        filesDeleted: context.filesDeleted,
                    };
                    yield completeEvent;
                    onEvent(completeEvent);
                    break;
                }

                case 'analyze':
                default: {
                    const thinkEvent: AgentEvent = { type: 'thinking', message: parsed.reasoning };
                    yield thinkEvent;
                    onEvent(thinkEvent);
                    break;
                }
            }

            // Emit step complete
            const stepCompleteEvent: AgentEvent = { type: 'step_complete', stepNumber, action: parsed.action };
            yield stepCompleteEvent;
            onEvent(stepCompleteEvent);

            // Apply cooldown (unless complete or last step)
            if (!context.isComplete && stepNumber < maxSteps) {
                const cooldownMs = generateCooldownMs(minCooldownMs, maxCooldownMs);

                // Emit cooldown with countdown
                for (let remaining = Math.ceil(cooldownMs / 1000); remaining > 0; remaining--) {
                    const cooldownEvent: AgentEvent = {
                        type: 'cooldown',
                        durationMs: cooldownMs,
                        remaining
                    };
                    yield cooldownEvent;
                    onEvent(cooldownEvent);

                    await new Promise((resolve) => setTimeout(resolve, 1000));

                    if (abortSignal?.aborted) {
                        return;
                    }
                }
            }
        } catch (error: any) {
            // Check if this is a low balance error - pause instead of continuing
            if (error instanceof LowBalanceError) {
                // Persist pause state
                context.isPaused = true;
                context.pauseReason = 'low_balance';
                context.pausedAtStep = stepNumber;
                context.previousMessages = previousMessages;

                // Emit auth_required and paused events
                const authRequiredEvent: AgentEvent = { type: 'auth_required' };
                yield authRequiredEvent;
                onEvent(authRequiredEvent);

                const pausedEvent: AgentEvent = {
                    type: 'paused',
                    reason: 'low_balance',
                    stepNumber
                };
                yield pausedEvent;
                onEvent(pausedEvent);

                // Call onPause callback with the paused context
                if (onPause) {
                    onPause(context);
                }

                // Exit the loop - caller must resume with new auth
                return;
            }

            // Other errors
            const errorEvent: AgentEvent = {
                type: 'error',
                message: error?.message || 'Unknown error',
                recoverable: true,
            };
            yield errorEvent;
            onEvent(errorEvent);

            // Continue to next step on recoverable errors
            if (!errorEvent.recoverable) {
                return;
            }
        }
    }

    // If we hit max steps without completing
    if (!context.isComplete) {
        const completeEvent: AgentEvent = {
            type: 'complete',
            summary: `Reached maximum steps (${maxSteps}). Task may be incomplete.`,
            filesCreated: context.filesCreated,
            filesUpdated: context.filesUpdated,
            filesDeleted: context.filesDeleted,
        };
        yield completeEvent;
        onEvent(completeEvent);
    }
}

export type { AgentContext, AgentStep };
