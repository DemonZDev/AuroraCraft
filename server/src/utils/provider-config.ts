import { writeFile, mkdir, chmod } from 'fs/promises'
import type { ResolvedModel } from './ai-runtime.js'

// @ai-sdk/openai-compatible is used for all OpenAI-compatible providers in the
// direct path (when LiteLLM is unavailable). Previously blocked by OpenCode
// issue #5674 (≤1.15.13) where baseURL/apiKey were not forwarded — fixed in 1.16+.
const OPENAI_COMPATIBLE_NPM = '@ai-sdk/openai-compatible'

export interface OpenCodeProviderConfig {
  npm?: string
  name?: string
  options: {
    baseURL?: string
    apiKey?: string
    [key: string]: unknown
  }
  models?: Record<string, { name: string }>
}

export interface OpenCodeConfig {
  $schema: string
  permission: string
  tools: { question: boolean }
  provider?: Record<string, OpenCodeProviderConfig>
  model?: string
}

/**
 * Per-project isolated config directory.
 * Maps /home/auroracraft-{username}/{linkId} → /var/lib/auroracraft/configs/{username}/{linkId}
 * Root-only (700/600) so users cannot extract API keys from the workspace editor.
 */
export function getProjectConfigDirectory(projectDir: string): string {
  const match = projectDir.match(/^\/home\/(auroracraft-[^/]+)\/(.+)$/)
  if (match) {
    return `/var/lib/auroracraft/configs/${match[1]}/${match[2]}`
  }
  // Fallback: hash the path for a safe directory name
  const safe = projectDir.replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
  return `/var/lib/auroracraft/configs/default/${safe}`
}

/**
 * Generate an OpenCode config that talks to a provider directly (no LiteLLM).
 * Used for the built-in Zen provider and for free OpenAI-compatible providers.
 */
export function generateProviderConfig(
  model: ResolvedModel,
  apiKey: string | undefined,
): OpenCodeConfig {
  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    permission: 'allow',
    tools: { question: false },
  }

  // Zen: no provider block — OpenCode resolves `opencode/<id>` ids natively
  // (and reads an optional Zen key from auth.json for higher rate limits).
  if (model.provider.kind === 'zen') {
    config.model = model.realName
    return config
  }

  // OpenAI-compatible provider, keyed by its slug.
  // @ai-sdk/openai-compatible (1.16+) forwards baseURL/apiKey correctly
  // and accepts any model name format including ones with '/' (e.g.
  // NVIDIA NIM's "moonshotai/kimi-k2.6").
  config.provider = {
    [model.provider.slug]: {
      npm: OPENAI_COMPATIBLE_NPM,
      name: model.provider.name,
      options: {
        baseURL: model.provider.baseUrl,
        apiKey,
      },
      models: {
        [model.realName]: { name: model.showName },
      },
    },
  }
  // Single provider configured → OpenCode resolves by the model key (no providerId/ prefix).
  config.model = model.realName

  return config
}

/** Minimal project-level config — no API keys, no provider details.
 *  OpenCode will read provider credentials from the isolated per-project
 *  HOME directory set at spawn time.
 */
export function generateMinimalProjectConfig(modelId?: string): OpenCodeConfig {
  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    permission: 'allow',
    tools: { question: false },
  }
  if (modelId) {
    // OpenCode models use either 'model-id' or 'opencode/model-id' format
    config.model = modelId
  }
  return config
}

export async function writeProjectConfig(
  projectDir: string,
  config: OpenCodeConfig,
): Promise<void> {
  const configPath = `${projectDir}/opencode.json`
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
}

export async function writeUserConfig(
  userHome: string,
  config: OpenCodeConfig,
): Promise<void> {
  const configDir = `${userHome}/.config/opencode`
  await mkdir(configDir, { recursive: true })
  // Lock down the directory so only the owner can list or read inside it
  await chmod(configDir, 0o700)
  const configPath = `${configDir}/opencode.json`
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  await chmod(configPath, 0o600)
}

/** Write the full provider config (with real API key) to the isolated
 *  per-project config directory so it is never exposed in the workspace tree.
 */
export async function writeIsolatedProjectConfig(
  projectDir: string,
  config: OpenCodeConfig,
): Promise<void> {
  const configDir = `${getProjectConfigDirectory(projectDir)}/.config/opencode`
  await mkdir(configDir, { recursive: true })
  await chmod(configDir, 0o700)
  const configPath = `${configDir}/opencode.json`
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  await chmod(configPath, 0o600)
}

/**
 * Write the Zen API key to the OpenCode auth.json file.
 * OpenCode stores provider credentials in ~/.local/share/opencode/auth.json.
 * The Zen API key is stored under the "opencode" provider since Zen is
 * a built-in OpenCode feature, not a separate external provider.
 */
export async function writeZenAuthJson(
  projectDir: string,
  zenApiKey: string,
): Promise<void> {
  const authDir = `${getProjectConfigDirectory(projectDir)}/.local/share/opencode`
  await mkdir(authDir, { recursive: true })
  const authPath = `${authDir}/auth.json`
  const authData = {
    opencode: {
      apiKey: zenApiKey,
    },
  }
  await writeFile(authPath, JSON.stringify(authData, null, 2), 'utf8')
  await chmod(authPath, 0o600)
}

/**
 * Generate an OpenCode provider config that routes through a local LiteLLM Proxy
 * instead of hitting the upstream provider directly. This enables per-project
 * dynamic routing, custom pricing, and budget enforcement (paid models).
 */
export function generateLiteLLMProviderConfig(
  model: ResolvedModel,
  litellmUrl: string,
  masterKey: string,
): OpenCodeConfig {
  // Use OpenCode's @ai-sdk/openai-compatible with custom baseURL.
  // Switched from built-in openai provider because @ai-sdk/openai uses
  // the Responses API (/v1/responses), which many providers (NVIDIA NIM,
  // OpenRouter) don't support. @ai-sdk/openai-compatible uses standard
  // /v1/chat/completions. Fixed in OpenCode 1.16+ (#5674).
  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    permission: 'allow',
    tools: { question: false },
    provider: {
      openai: {
        npm: '@ai-sdk/openai-compatible',
        options: {
          baseURL: `${litellmUrl}/v1`,
          apiKey: masterKey,
        },
        models: {
          [model.id]: { name: model.showName },
        },
      },
    },
    model: `openai/${model.id}`,
  }

  return config
}
