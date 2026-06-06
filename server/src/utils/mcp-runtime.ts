// Resolves which MCP servers a user's OpenCode instance should run, from the
// admin-managed `mcps` table + the user's per-MCP keys. Replaces the old
// Firecrawl-only hardcoding in bridges/opencode.ts.

import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mcps } from '../db/schema/mcps.js'
import { getUserMcpKeyMap } from './ai-runtime.js'

export const MCP_API_PLACEHOLDER = 'MCP-API-Key'

export interface ResolvedMcpServer {
  name: string
  config: Record<string, unknown>
}
export interface UserMcpServers {
  servers: ResolvedMcpServer[]
  disconnect: string[]
}

/** Stable OpenCode MCP registration name derived from the admin label. */
export function mcpRegistrationName(name: string, id: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || `mcp-${id.slice(0, 8)}`
}

function safeParseConfig(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The MCP servers a user should have registered on their OpenCode instance.
 *  - non_api MCPs: registered verbatim.
 *  - api MCPs: registered only when the user holds a key; the literal
 *    `MCP-API-Key` in the config is replaced with that key.
 *    api MCPs without a key go into `disconnect` so any stale registration is removed.
 */
export async function buildUserMcpServers(userId: string): Promise<UserMcpServers> {
  const rows = await db.select().from(mcps).where(eq(mcps.isActive, true))
  if (rows.length === 0) return { servers: [], disconnect: [] }

  const keys = await getUserMcpKeyMap(userId)
  const servers: ResolvedMcpServer[] = []
  const disconnect: string[] = []

  for (const m of rows) {
    const name = mcpRegistrationName(m.name, m.id)
    if (m.apiType === 'api') {
      const key = keys[m.id]
      if (!key) { disconnect.push(name); continue }
      const cfg = safeParseConfig(m.config.split(MCP_API_PLACEHOLDER).join(key))
      if (cfg) servers.push({ name, config: cfg })
    } else {
      const cfg = safeParseConfig(m.config)
      if (cfg) servers.push({ name, config: cfg })
    }
  }
  return { servers, disconnect }
}
