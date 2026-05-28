import type { OpenCodeConfig } from './provider-config.js'

export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * Add or update a local MCP server on a running OpenCode instance.
 *
 * OpenCode exposes `POST /mcp` with body `{ name, config }` where
 * `config` matches its `McpLocalConfig` type:
 *   { type: "local", command: string[], environment?: Record<string, string>, enabled?: boolean }
 */
export async function addMCPServer(
  baseUrl: string,
  name: string,
  config: MCPServerConfig,
): Promise<void> {
  const body = {
    name,
    config: {
      type: 'local' as const,
      command: [config.command, ...(config.args ?? [])],
      environment: config.env ?? {},
      enabled: true,
    },
  }

  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`Failed to add MCP server ${name}: ${res.status} ${text}`)
  }
}

/**
 * Disconnect (remove) a named MCP server from a running OpenCode instance.
 */
export async function disconnectMCPServer(
  baseUrl: string,
  name: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/mcp/${name}/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`Failed to disconnect MCP server ${name}: ${res.status} ${text}`)
  }
}

/**
 * List currently configured MCP servers.
 */
export async function listMCPServers(
  baseUrl: string,
): Promise<Record<string, { status: string }>> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    return {}
  }

  return (await res.json()) as Record<string, { status: string }>
}

/**
 * Build a Firecrawl MCP server configuration.
 */
export function buildFirecrawlMCPConfig(apiKey: string): MCPServerConfig {
  return {
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    env: {
      FIRECRAWL_API_KEY: apiKey,
    },
  }
}
