/**
 * PuterAIWrapper
 * Centralized wrapper for all Puter.js AI calls with error detection and auth management
 */

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIOptions {
    model?: string;
    stream?: boolean;
}

/**
 * Custom error for low balance / quota exhaustion
 */
export class LowBalanceError extends Error {
    readonly type = 'LOW_BALANCE' as const;
    readonly originalError: unknown;

    constructor(message: string, originalError?: unknown) {
        super(message);
        this.name = 'LowBalanceError';
        this.originalError = originalError;
    }
}

/**
 * Patterns that indicate low balance / quota errors
 */
const LOW_BALANCE_PATTERNS = [
    /balance/i,
    /quota/i,
    /exhausted/i,
    /limit\s*(exceeded|reached)/i,
    /insufficient/i,
    /usage\s*limit/i,
    /credits?\s*(depleted|exhausted|ran out)/i,
    /no\s*(remaining|available)\s*(usage|credits?)/i,
    /payment\s*required/i,
    /upgrade\s*(required|to continue)/i,
    /subscription/i,
    /billing/i,
];

/**
 * HTTP status codes that indicate billing issues
 */
const BILLING_STATUS_CODES = [402, 429];

/**
 * Check if an error is a low balance / quota error
 */
export function isLowBalanceError(error: unknown): boolean {
    if (error instanceof LowBalanceError) {
        return true;
    }

    if (!error) return false;

    // Check error message
    const errorMessage = getErrorMessage(error);
    if (errorMessage && LOW_BALANCE_PATTERNS.some(pattern => pattern.test(errorMessage))) {
        return true;
    }

    // Check error code
    const errorCode = getErrorCode(error);
    if (errorCode && BILLING_STATUS_CODES.includes(errorCode)) {
        return true;
    }

    // Check error type field
    const errorType = getErrorType(error);
    if (errorType && LOW_BALANCE_PATTERNS.some(pattern => pattern.test(errorType))) {
        return true;
    }

    return false;
}

/**
 * Extract error message from various error formats
 */
function getErrorMessage(error: unknown): string | null {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
        const obj = error as Record<string, unknown>;
        if (typeof obj.message === 'string') return obj.message;
        if (typeof obj.error === 'string') return obj.error;
        if (typeof obj.error === 'object' && obj.error !== null) {
            const innerError = obj.error as Record<string, unknown>;
            if (typeof innerError.message === 'string') return innerError.message;
        }
    }
    return null;
}

/**
 * Extract error code from various error formats
 */
function getErrorCode(error: unknown): number | null {
    if (typeof error === 'object' && error !== null) {
        const obj = error as Record<string, unknown>;
        if (typeof obj.status === 'number') return obj.status;
        if (typeof obj.statusCode === 'number') return obj.statusCode;
        if (typeof obj.code === 'number') return obj.code;
    }
    return null;
}

/**
 * Extract error type from various error formats
 */
function getErrorType(error: unknown): string | null {
    if (typeof error === 'object' && error !== null) {
        const obj = error as Record<string, unknown>;
        if (typeof obj.type === 'string') return obj.type;
        if (typeof obj.name === 'string') return obj.name;
        if (typeof obj.errorType === 'string') return obj.errorType;
    }
    return null;
}

/**
 * Get the Puter.js instance from window
 */
function getPuter(): any {
    const anyWindow = window as any;
    return anyWindow?.puter;
}

/**
 * Check if Puter is available
 */
export function isPuterAvailable(): boolean {
    const puter = getPuter();
    return !!(puter?.ai?.chat);
}

/**
 * Check if user is signed into Puter
 */
export function isPuterSignedIn(): boolean {
    const puter = getPuter();
    if (!puter?.auth?.isSignedIn) return false;
    return puter.auth.isSignedIn();
}

/**
 * Get current Puter user info
 */
export async function getPuterUser(): Promise<{ username: string } | null> {
    const puter = getPuter();
    if (!puter?.auth?.getUser) return null;
    try {
        const user = await puter.auth.getUser();
        return user;
    } catch {
        return null;
    }
}

/**
 * Sign out from Puter (local session only)
 * This detaches the current Puter auth without affecting AuroraCraft account
 */
export async function signOutPuter(): Promise<void> {
    const puter = getPuter();
    if (!puter?.auth?.signOut) {
        throw new Error('Puter.js signOut not available');
    }

    try {
        await puter.auth.signOut();
    } catch (error) {
        console.warn('[PuterAIWrapper] signOut error (non-fatal):', error);
        // Non-fatal - continue anyway
    }
}

/**
 * Sign in to Puter (opens auth popup)
 * Allows the user to authenticate with a different Puter account
 */
export async function signInPuter(): Promise<boolean> {
    const puter = getPuter();
    if (!puter?.auth?.signIn) {
        throw new Error('Puter.js signIn not available');
    }

    try {
        await puter.auth.signIn();
        return true;
    } catch (error) {
        console.error('[PuterAIWrapper] signIn error:', error);
        return false;
    }
}

/**
 * Safe wrapper for Puter.js AI chat
 * Intercepts errors and detects low balance conditions
 * 
 * @throws LowBalanceError if the request fails due to balance/quota issues
 * @throws Error for other failures
 */
export async function safeAIChat(
    messages: ChatMessage[],
    options: AIOptions = {}
): Promise<string> {
    const puter = getPuter();

    if (!puter?.ai?.chat) {
        throw new Error('Puter.js is not available. Make sure the Puter.js script is loaded.');
    }

    try {
        // Non-streaming call
        const response = await puter.ai.chat(messages, false, {
            model: options.model,
        });

        return response?.message?.content || response?.text || '';
    } catch (error: unknown) {
        // Check if this is a low balance error
        if (isLowBalanceError(error)) {
            throw new LowBalanceError(
                'Your Puter account has no remaining AI usage. Please authenticate another account to continue.',
                error
            );
        }

        // Re-throw other errors
        throw error;
    }
}

/**
 * Safe wrapper for Puter.js AI chat with streaming
 * Returns an async iterable that yields chunks
 * 
 * @throws LowBalanceError if the request fails due to balance/quota issues
 * @throws Error for other failures
 */
export async function* safeAIChatStream(
    messages: ChatMessage[],
    options: AIOptions = {}
): AsyncGenerator<string> {
    const puter = getPuter();

    if (!puter?.ai?.chat) {
        throw new Error('Puter.js is not available. Make sure the Puter.js script is loaded.');
    }

    let stream: AsyncIterable<any>;
    try {
        stream = await puter.ai.chat(messages, false, {
            stream: true,
            model: options.model,
        });
    } catch (error: unknown) {
        if (isLowBalanceError(error)) {
            throw new LowBalanceError(
                'Your Puter account has no remaining AI usage. Please authenticate another account to continue.',
                error
            );
        }
        throw error;
    }

    try {
        for await (const part of stream as any) {
            const text = part?.text || '';
            if (text) {
                yield text;
            }
        }
    } catch (error: unknown) {
        if (isLowBalanceError(error)) {
            throw new LowBalanceError(
                'Your Puter account has no remaining AI usage. Please authenticate another account to continue.',
                error
            );
        }
        throw error;
    }
}

/**
 * Re-authenticate with a different Puter account
 * Signs out the current session and prompts for new login
 */
export async function reAuthenticatePuter(): Promise<boolean> {
    // Sign out current session first
    await signOutPuter();

    // Sign in with new account
    return signInPuter();
}
