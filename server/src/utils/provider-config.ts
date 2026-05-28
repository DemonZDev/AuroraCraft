import { writeFile, mkdir, chmod } from 'fs/promises'
import { dirname } from 'path'
import type { AIModelDef, ModelProvider, ProviderId } from '../config/ai-models.js'
import { PROVIDER_CONFIG } from '../config/ai-models.js'

export interface OpenCodeProviderConfig {
  npm: string
  name: string
  options: {
    baseURL: string
    apiKey: string
  }
  models: Record<string, { name: string }>
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

export function generateProviderConfig(
  model: AIModelDef,
  provider: ModelProvider,
  apiKey: string,
): OpenCodeConfig {
  const providerConfig = PROVIDER_CONFIG[provider.id]
  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    permission: 'allow',
    tools: { question: false },
  }

  if (provider.id === 'opencode') {
    config.model = provider.modelId
    return config
  }

  config.provider = {
    [provider.id]: {
      npm: providerConfig.npmPackage,
      name: providerConfig.name,
      options: {
        baseURL: providerConfig.baseUrl,
        apiKey,
      },
      models: {
        [provider.modelId]: {
          name: model.name,
        },
      },
    },
  }

  config.model = `${provider.id}/${provider.modelId}`

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
  if (modelId && !modelId.includes('/')) {
    // opencode internal models don't need a provider prefix
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
