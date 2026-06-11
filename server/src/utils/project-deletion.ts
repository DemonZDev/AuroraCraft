import { execFile } from 'child_process'
import { promisify } from 'util'
import { opencodeBridge } from '../bridges/index.js'
import { toSystemUsername } from './system-user.js'

const execFileAsync = promisify(execFile)

function isRoot(): boolean {
  return process.getuid?.() === 0
}

/** `rm -rf <path>` with sudo unless already root (matches the privilege model elsewhere). */
async function rmrf(targetPath: string): Promise<void> {
  if (isRoot()) {
    await execFileAsync('rm', ['-rf', targetPath])
  } else {
    await execFileAsync('sudo', ['rm', '-rf', targetPath])
  }
}

/**
 * Remove ALL artifacts for a single project: OpenCode conversation history, the
 * on-disk workspace (`/home/<sysuser>/<linkId>`), and the isolated config dir
 * (`/var/lib/auroracraft/configs/<sysuser>/<linkId>`).
 *
 * Each step is best-effort and logged — failures never throw, so callers (project
 * delete, full user delete) can keep going. Shared caches are never touched.
 */
export async function deleteProjectArtifacts(ownerUsername: string, linkId: string | null): Promise<void> {
  if (!linkId) return

  const systemUsername = toSystemUsername(ownerUsername)
  const projectDir = `/home/${systemUsername}/${linkId}`
  const isolatedConfigDir = `/var/lib/auroracraft/configs/${systemUsername}/${linkId}`

  await opencodeBridge.cleanupProject(systemUsername, projectDir).catch((err) => {
    console.warn(`[ProjectDeletion] OpenCode cleanup failed for ${projectDir}:`, err instanceof Error ? err.message : err)
  })
  await rmrf(projectDir).catch((err) => {
    console.warn(`[ProjectDeletion] Failed to remove ${projectDir}:`, err instanceof Error ? err.message : err)
  })
  await rmrf(isolatedConfigDir).catch((err) => {
    console.warn(`[ProjectDeletion] Failed to remove ${isolatedConfigDir}:`, err instanceof Error ? err.message : err)
  })
}
