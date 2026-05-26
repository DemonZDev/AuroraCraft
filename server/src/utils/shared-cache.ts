import { mkdir, symlink, access, constants } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// ── Shared Cache Paths ───────────────────────────────────────────────

export const SHARED_CACHE_PATHS = {
  opencode: {
    base: '/var/lib/opencode/shared',
    nodeModules: '/var/lib/opencode/shared/node_modules',
    packageJson: '/var/lib/opencode/shared/package.json',
    packageLockJson: '/var/lib/opencode/shared/package-lock.json',
  },
  gradle: {
    base: '/var/lib/gradle/shared',
    caches: '/var/lib/gradle/shared/caches',
  },
  maven: {
    base: '/var/lib/maven/shared',
    repository: '/var/lib/maven/shared/repository',
  },
} as const

// ── Initialization ───────────────────────────────────────────────────

/**
 * Initialize shared cache directories on server startup.
 * These directories are shared across all auroracraft-* users to prevent
 * per-user duplication of heavy dependency caches (OpenCode plugins,
 * Gradle caches, Maven repositories).
 */
export async function initializeSharedCaches(): Promise<void> {
  console.log('[SharedCache] Initializing shared cache directories...')

  // Create all base directories with 755 (owner rwx, group rx, others rx)
  // We use sudo since /var/lib/ requires root
  for (const [name, paths] of Object.entries(SHARED_CACHE_PATHS)) {
    try {
      await execFileAsync('sudo', ['mkdir', '-p', paths.base])
      await execFileAsync('sudo', ['chmod', '-R', '755', paths.base])
      console.log(`[SharedCache] ${name}: ${paths.base}`)
    } catch (err) {
      console.error(`[SharedCache] Failed to initialize ${name}:`, err)
      throw new Error(`Failed to initialize shared cache for ${name}`)
    }
  }

  console.log('[SharedCache] All shared cache directories initialized')
}

// ── Per-User Symlink Setup ──────────────────────────────────────────

/**
 * Set up symlinks in a user's home directory pointing to shared caches.
 * This is called after a new system user is created.
 *
 * Symlink map:
 *   ~/.config/opencode/node_modules      → /var/lib/opencode/shared/node_modules
 *   ~/.config/opencode/package.json        → /var/lib/opencode/shared/package.json
 *   ~/.config/opencode/package-lock.json   → /var/lib/opencode/shared/package-lock.json
 *   ~/.gradle/caches                       → /var/lib/gradle/shared/caches
 *   ~/.m2/repository                       → /var/lib/maven/shared/repository
 */
export async function setupUserSharedCaches(systemUsername: string): Promise<void> {
  const homeDir = `/home/${systemUsername}`

  // OpenCode config directory
  const opencodeConfigDir = `${homeDir}/.config/opencode`
  await mkdir(opencodeConfigDir, { recursive: true })

  await symlinkSafe(
    SHARED_CACHE_PATHS.opencode.nodeModules,
    `${opencodeConfigDir}/node_modules`,
    systemUsername,
  )
  await symlinkSafe(
    SHARED_CACHE_PATHS.opencode.packageJson,
    `${opencodeConfigDir}/package.json`,
    systemUsername,
  )
  await symlinkSafe(
    SHARED_CACHE_PATHS.opencode.packageLockJson,
    `${opencodeConfigDir}/package-lock.json`,
    systemUsername,
  )

  // Gradle cache directory
  const gradleDir = `${homeDir}/.gradle`
  await mkdir(gradleDir, { recursive: true })
  await symlinkSafe(
    SHARED_CACHE_PATHS.gradle.caches,
    `${gradleDir}/caches`,
    systemUsername,
  )

  // Maven repository directory
  const m2Dir = `${homeDir}/.m2`
  await mkdir(m2Dir, { recursive: true })
  await symlinkSafe(
    SHARED_CACHE_PATHS.maven.repository,
    `${m2Dir}/repository`,
    systemUsername,
  )

  console.log(`[SharedCache] Set up shared cache symlinks for ${systemUsername}`)
}

/**
 * Create a symlink, handling existing files gracefully.
 * If the path already exists (file, dir, or symlink), it's removed first.
 * Ownership is set to the target user.
 */
async function symlinkSafe(
  target: string,
  linkPath: string,
  systemUsername: string,
): Promise<void> {
  try {
    // Check if link path already exists
    const exists = await access(linkPath, constants.F_OK)
      .then(() => true)
      .catch(() => false)

    if (exists) {
      // Remove existing file/dir/symlink (as root, since we're running as root)
      await execFileAsync('sudo', ['rm', '-rf', linkPath])
    }

    // Create the symlink (as root)
    await execFileAsync('sudo', ['ln', '-s', target, linkPath])

    // Ensure the target user owns the symlink
    await execFileAsync('sudo', ['chown', '-h', `${systemUsername}:${systemUsername}`, linkPath])
  } catch (err) {
    console.warn(`[SharedCache] Failed to create symlink ${linkPath} → ${target}:`, err)
    // Non-fatal: shared caches are an optimization, not a requirement
  }
}
