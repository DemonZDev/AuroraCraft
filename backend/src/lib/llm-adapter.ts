import { decrypt } from './encryption.js';
import { Provider, Model, Session } from '@prisma/client';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatOptions {
    provider: Provider;
    model: Model;
    messages: ChatMessage[];
    mode: 'AGENT' | 'PLAN' | 'QUESTION';
    session: Session;
    onStream?: (chunk: string) => void;
}

interface EnhanceOptions {
    provider: Provider;
    model: Model;
    prompt: string;
}

interface ChatResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

interface EnhanceResponse {
    enhanced: string;
}

// System prompts for different modes
const SYSTEM_PROMPTS = {
    AGENT: `You are AuroraCraft, an expert AI agent specialized in building Minecraft plugins for Paper, Spigot, Purpur, Folia, Velocity, BungeeCord, and other server platforms.

Your capabilities:
- Generate complete, production-ready Java code for Minecraft plugins
- Follow best practices for plugin development (events, commands, configs)
- Use Maven for dependency management
- Support Java 21 features
- Create modular, maintainable code structures

When building:
1. Plan the implementation first
2. Create necessary files and folders
3. Write clean, documented code
4. Add proper error handling
5. Include configuration options

Always explain what you're doing and why.`,

    PLAN: `You are AuroraCraft, an AI planning assistant for Minecraft plugin development.

Your role is to create detailed implementation plans for plugin development projects.

When planning:
1. Analyze the user's requirements thoroughly
2. Break down the project into phases
3. List all files that need to be created
4. Identify dependencies and external APIs needed
5. Consider edge cases and error handling
6. Estimate complexity and potential challenges

Output your plan in a structured format with clear phases and tasks.`,

    QUESTION: `You are AuroraCraft, a helpful assistant for Minecraft plugin development questions.

Answer questions about:
- Bukkit/Spigot/Paper APIs
- Plugin development best practices
- Java programming for Minecraft
- Server configuration and optimization
- Common plugin patterns and solutions

Be concise but thorough in your explanations.`,
};

class LLMAdapter {
    /**
     * Send a chat request to the configured provider
     */
    async chat(options: ChatOptions): Promise<ChatResponse> {
        const { provider, model, messages, mode, onStream } = options;

        // Get system prompt for mode
        const systemPrompt = SYSTEM_PROMPTS[mode];

        // Build messages array with system prompt
        const fullMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...messages,
        ];

        // Decrypt credentials
        let credentials: string;
        try {
            credentials = decrypt(provider.credentialsEncrypted);
        } catch {
            // If decryption fails (placeholder), simulate response
            return this.simulateResponse(messages, onStream);
        }

        // Build request based on provider
        const requestBody = this.buildRequestBody(provider, model, fullMessages);

        try {
            const response = await fetch(`${provider.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.buildHeaders(provider, credentials),
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            // Handle streaming if supported
            if (onStream && response.body) {
                return this.handleStreamingResponse(response, onStream);
            }

            const data = await response.json();
            return {
                content: data.choices?.[0]?.message?.content || '',
                usage: data.usage,
            };
        } catch (error: any) {
            console.error('LLM API error:', error.message);
            // Fallback to simulation
            return this.simulateResponse(messages, onStream);
        }
    }

    /**
     * Enhance a user prompt
     */
    async enhance(options: EnhanceOptions): Promise<EnhanceResponse> {
        const { provider, model, prompt } = options;

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `You are a prompt enhancement assistant. Take the user's rough idea and expand it into a detailed, well-structured prompt for building a Minecraft plugin. Include:
- Clear project goals
- Specific features to implement
- Technical requirements
- Configuration options
- User experience considerations

Output only the enhanced prompt, no explanations.`,
            },
            {
                role: 'user',
                content: prompt,
            },
        ];

        // For now, simulate enhancement
        const enhanced = this.generateEnhancedPrompt(prompt);
        return { enhanced };
    }

    /**
     * Build request body for provider
     */
    private buildRequestBody(provider: Provider, model: Model, messages: ChatMessage[]): any {
        const defaultPayload = provider.defaultPayload as Record<string, any> || {};
        const modelParams = model.defaultParams as Record<string, any> || {};

        return {
            model: model.modelId,
            messages,
            max_tokens: model.maxTokens,
            stream: false,
            ...defaultPayload,
            ...modelParams,
        };
    }

    /**
     * Build headers for provider
     */
    private buildHeaders(provider: Provider, credentials: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        switch (provider.authType) {
            case 'BEARER':
                headers['Authorization'] = `Bearer ${credentials}`;
                break;
            case 'API_KEY':
                headers['X-API-Key'] = credentials;
                break;
            case 'CUSTOM_HEADER':
                // Use headers from provider config
                if (provider.headersJson) {
                    const customHeaders = provider.headersJson as Record<string, string>;
                    Object.assign(headers, customHeaders);
                }
                break;
        }

        return headers;
    }

    /**
     * Handle streaming response
     */
    private async handleStreamingResponse(
        response: Response,
        onStream: (chunk: string) => void
    ): Promise<ChatResponse> {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let content = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.choices?.[0]?.delta?.content || '';
                    if (text) {
                        content += text;
                        onStream(text);
                    }
                } catch {
                    // Skip malformed lines
                }
            }
        }

        return { content };
    }

    /**
     * Simulate AI response when provider not configured
     */
    private async simulateResponse(
        messages: ChatMessage[],
        onStream?: (chunk: string) => void
    ): Promise<ChatResponse> {
        const lastMessage = messages[messages.length - 1];
        const userQuery = lastMessage?.content || '';

        const response = `I understand you want to: ${userQuery.slice(0, 100)}...

**Note:** The AI provider is not yet configured. To enable real AI responses:

1. Go to Admin Panel → Providers
2. Add your API provider (OpenRouter, Anthropic, etc.)
3. Configure your API key
4. Enable the models you want to use

For now, here's a scaffold to get you started:

\`\`\`java
package com.example.plugin;

import org.bukkit.plugin.java.JavaPlugin;

public class Main extends JavaPlugin {
    @Override
    public void onEnable() {
        // TODO: Implement your plugin logic
        getLogger().info("Plugin enabled!");
    }
}
\`\`\`

Configure your AI provider to get intelligent code generation!`;

        // Simulate streaming
        if (onStream) {
            const words = response.split(' ');
            for (const word of words) {
                onStream(word + ' ');
                await new Promise(r => setTimeout(r, 30));
            }
        }

        return { content: response };
    }

    /**
     * Generate enhanced prompt (simulation)
     */
    private generateEnhancedPrompt(prompt: string): string {
        return `## Plugin Development Request

### Project Overview
${prompt}

### Detailed Requirements

**Core Features:**
- Implement the main functionality described above
- Add proper command handling with permissions
- Include configuration file for customization
- Implement event listeners as needed

**Technical Specifications:**
- Target Platform: Paper 1.20.4+
- Java Version: 21
- Build System: Maven
- API Version: 1.20

**User Experience:**
- Clear command feedback with color coding
- Tab completion for commands
- Helpful error messages
- In-game help documentation

**Configuration Options:**
- Enable/disable features via config.yml
- Customizable messages
- Permission-based access control

**Quality Requirements:**
- Clean, documented code
- Proper error handling
- Efficient resource usage
- Thread-safe operations where needed`;
    }
}

export const llmAdapter = new LLMAdapter();
