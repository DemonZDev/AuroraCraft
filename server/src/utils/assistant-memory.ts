import { eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { assistantMemory } from '../db/schema/assistant-memory.js'

const MAX_MEMORY_CHARS = 8000 // keep memory compact for "blazing fast" context

export async function getMemory(projectId: string): Promise<string> {
  const [row] = await db
    .select({ summary: assistantMemory.summary })
    .from(assistantMemory)
    .where(eq(assistantMemory.projectId, projectId))
    .limit(1)
  return row?.summary ?? ''
}

export async function setMemory(projectId: string, summary: string): Promise<void> {
  const trimmed = (summary ?? '').slice(0, MAX_MEMORY_CHARS)
  await db
    .insert(assistantMemory)
    .values({ projectId, summary: trimmed, version: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: assistantMemory.projectId,
      set: { summary: trimmed, version: sql`${assistantMemory.version} + 1`, updatedAt: new Date() },
    })
}
