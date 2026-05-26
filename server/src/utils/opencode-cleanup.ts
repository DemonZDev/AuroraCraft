import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdir, unlink, rm } from 'fs/promises'
import { join } from 'path'

const execFileAsync = promisify(execFile)

/**
 * Clean up OpenCode session data for a deleted project.
 *
 * OpenCode stores conversation history in:
 *   - SQLite DB: ~/.local/share/opencode/opencode.db (sessions, messages, parts, todos)
 *   - JSON diffs: ~/.local/share/opencode/storage/session_diff/{sessionId}.json
 *   - Snapshots:  ~/.local/share/opencode/snapshot/{linkId}/
 *
 * When a project is deleted from AuroraCraft, this removes all associated
 * OpenCode data to prevent storage leaks.
 *
 * @param systemUsername The Linux user (e.g. "auroracraft-admin")
 * @param projectDir   Full path to the project directory (e.g. "/home/auroracraft-admin/test-abc123")
 */
export async function cleanupOpenCodeProject(
  systemUsername: string,
  projectDir: string,
): Promise<void> {
  const homeDir = `/home/${systemUsername}`
  const opencodeDataDir = `${homeDir}/.local/share/opencode`
  const dbPath = `${opencodeDataDir}/opencode.db`

  console.log(`[OpenCodeCleanup] Cleaning up OpenCode data for ${projectDir}`)

  // 1. Get session IDs for this project from the SQLite DB
  let sessionIds: string[] = []
  try {
    const { stdout } = await execFileAsync('sudo', [
      '-u', systemUsername,
      'sqlite3', dbPath,
      `SELECT id FROM session WHERE directory = '${projectDir}';`,
    ])
    sessionIds = stdout.trim().split('\n').filter(Boolean)
  } catch (err) {
    console.warn(`[OpenCodeCleanup] Failed to query sessions for ${projectDir}:`, err)
  }

  // 2. Delete JSON diff files for those sessions
  for (const sessionId of sessionIds) {
    try {
      await unlink(`${opencodeDataDir}/storage/session_diff/${sessionId}.json`)
    } catch {
      // File may not exist; ignore
    }
  }

  // 3. Delete snapshot directory for this project
  const linkId = projectDir.split('/').pop()
  if (linkId) {
    try {
      await rm(`${opencodeDataDir}/snapshot/${linkId}`, { recursive: true, force: true })
    } catch {
      // Directory may not exist; ignore
    }
  }

  // 4. Delete the project row from SQLite (cascade deletes sessions, messages, parts, todos, permissions, etc.)
  try {
    await execFileAsync('sudo', [
      '-u', systemUsername,
      'sqlite3', dbPath,
      `PRAGMA foreign_keys = ON; DELETE FROM project WHERE worktree = '${projectDir}';`,
    ])
    console.log(`[OpenCodeCleanup] Deleted OpenCode project data for ${projectDir}`)
  } catch (err) {
    console.warn(`[OpenCodeCleanup] Failed to delete OpenCode project for ${projectDir}:`, err)
  }

  // 5. Vacuum the SQLite DB to reclaim disk space (best effort)
  try {
    await execFileAsync('sudo', [
      '-u', systemUsername,
      'sqlite3', dbPath,
      'VACUUM;',
    ])
  } catch {
    // Ignore vacuum errors; DB may be locked by a running OpenCode process
  }
}

/**
 * Clean up ALL OpenCode data for a system user.
 * Use this when the user account is deleted (not per-project).
 */
export async function cleanupOpenCodeUser(systemUsername: string): Promise<void> {
  const homeDir = `/home/${systemUsername}`
  const opencodeDataDir = `${homeDir}/.local/share/opencode`

  try {
    await execFileAsync('sudo', ['rm', '-rf', opencodeDataDir])
    console.log(`[OpenCodeCleanup] Deleted all OpenCode data for ${systemUsername}`)
  } catch (err) {
    console.warn(`[OpenCodeCleanup] Failed to delete OpenCode data for ${systemUsername}:`, err)
  }
}
