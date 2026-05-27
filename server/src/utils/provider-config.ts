import { writeFile, mkdir } from 'fs/promises'
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
  const configPath = `${configDir}/opencode.json`
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
}
