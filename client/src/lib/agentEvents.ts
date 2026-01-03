/**
 * Agent Event Types
 * Typed events emitted during agentic execution
 */

export type AgentActionType =
    | 'plan'
    | 'create_file'
    | 'update_file'
    | 'delete_file'
    | 'analyze'
    | 'complete';

export interface FileAction {
    type: 'create' | 'update' | 'delete';
    path: string;
    fileName: string;
    content?: string;
}

export type AgentEvent =
    | { type: 'thinking'; message: string }
    | { type: 'planning'; message: string }
    | { type: 'file_creating'; path: string; fileName: string }
    | { type: 'file_created'; path: string; fileName: string }
    | { type: 'file_updating'; path: string; fileName: string }
    | { type: 'file_updated'; path: string; fileName: string }
    | { type: 'file_deleting'; path: string; fileName: string }
    | { type: 'file_deleted'; path: string; fileName: string }
    | { type: 'step_complete'; stepNumber: number; action: AgentActionType }
    | { type: 'cooldown'; durationMs: number; remaining: number }
    | { type: 'complete'; summary: string; filesCreated: string[]; filesUpdated: string[]; filesDeleted: string[] }
    | { type: 'error'; message: string; recoverable: boolean }
    // Pause/Resume events for low balance handling
    | { type: 'paused'; reason: 'low_balance' | 'user_cancelled'; stepNumber: number }
    | { type: 'resuming'; stepNumber: number }
    | { type: 'auth_required' };

export interface AgentStep {
    stepNumber: number;
    action: AgentActionType;
    target: string | null;
    reasoning: string;
    content?: string;
    timestamp: number;
}

export type PauseReason = 'low_balance' | 'user_cancelled' | null;

export interface AgentContext {
    sessionId: number;
    task: string;
    mode: 'agent' | 'plan' | 'question';
    modelName: string;
    steps: AgentStep[];
    filesCreated: string[];
    filesUpdated: string[];
    filesDeleted: string[];
    isComplete: boolean;
    error?: string;
    // Pause/Resume state
    isPaused?: boolean;
    pauseReason?: PauseReason;
    pausedAtStep?: number;
    previousMessages?: Array<{ role: string; content: string }>;
}

/**
 * Parse AI response to extract single action
 */
export function parseAgentResponse(response: string): {
    action: AgentActionType;
    target: string | null;
    reasoning: string;
    content?: string;
} {
    const lines = response.split('\n');
    let action: AgentActionType = 'plan';
    let target: string | null = null;
    let reasoning = '';
    let content: string | undefined;

    // Parse structured response
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ACTION:')) {
            const actionStr = trimmed.replace('ACTION:', '').trim().toLowerCase();
            if (['plan', 'create_file', 'update_file', 'delete_file', 'analyze', 'complete'].includes(actionStr)) {
                action = actionStr as AgentActionType;
            }
        } else if (trimmed.startsWith('TARGET:')) {
            target = trimmed.replace('TARGET:', '').trim();
            if (target === 'none' || target === '') target = null;
        } else if (trimmed.startsWith('REASONING:')) {
            reasoning = trimmed.replace('REASONING:', '').trim();
        }
    }

    // Extract content after separator
    const separatorIndex = response.indexOf('---');
    if (separatorIndex !== -1) {
        content = response.slice(separatorIndex + 3).trim();
    }

    // Fallback: try to parse old :::CREATE_FILE format for backwards compatibility
    if (action === 'plan' && response.includes(':::CREATE_FILE')) {
        const match = /:::CREATE_FILE\s+([^\n]+)\n([\s\S]*?):::END_FILE/.exec(response);
        if (match) {
            action = 'create_file';
            target = match[1].trim();
            content = match[2].trim();
            reasoning = `Creating file: ${target}`;
        }
    }

    if (action === 'plan' && response.includes(':::UPDATE_FILE')) {
        const match = /:::UPDATE_FILE\s+([^\n]+)\n([\s\S]*?):::END_FILE/.exec(response);
        if (match) {
            action = 'update_file';
            target = match[1].trim();
            content = match[2].trim();
            reasoning = `Updating file: ${target}`;
        }
    }

    if (action === 'plan' && response.includes(':::DELETE_FILE')) {
        const match = /:::DELETE_FILE\s+([^\n]+)/.exec(response);
        if (match) {
            action = 'delete_file';
            target = match[1].trim();
            reasoning = `Deleting file: ${target}`;
        }
    }

    return { action, target, reasoning, content };
}

/**
 * Generate random cooldown duration between min and max
 */
export function generateCooldownMs(minMs: number = 5000, maxMs: number = 10000): number {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Extract filename from path
 */
export function getFileName(path: string): string {
    return path.split('/').pop() || path;
}
