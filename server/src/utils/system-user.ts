import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { setupUserSharedCaches } from './shared-cache.js'

const execFileAsync = promisify(execFile)

export async function systemUserExists(username: string): Promise<boolean> {
  const systemUsername = `auroracraft-${username}`
  try {
    await execFileAsync('id', [systemUsername])
    return true
  } catch {
    return false
  }
}

export async function createSystemUser(username: string, password: string): Promise<void> {
  const systemUsername = `auroracraft-${username}`

  const exists = await systemUserExists(username)
  if (exists) {
    console.log(`[SystemUser] User ${systemUsername} already exists, skipping creation`)
    return
  }

  console.log(`[SystemUser] Creating system user: ${systemUsername}`)

  await execFileAsync('sudo', [
    'adduser',
    '--disabled-password',
    '--gecos', '',
    systemUsername,
  ])

  try {
    await setSystemUserPassword(systemUsername, password)
  } catch (err) {
    // Rollback: remove the user if password setting failed
    await execFileAsync('sudo', ['userdel', '-r', systemUsername]).catch(() => {})
    throw err
  }

  // Set proper permissions on home directory (750 = owner rwx, group r-x, others ---)
  try {
    await execFileAsync('sudo', ['chmod', '750', `/home/${systemUsername}`])
  } catch (err) {
    console.warn(`[SystemUser] Failed to set permissions on /home/${systemUsername}:`, err)
  }

  // Set up shared cache symlinks (OpenCode, Gradle, Maven) to prevent per-user duplication
  try {
    await setupUserSharedCaches(systemUsername)
  } catch (err) {
    console.warn(`[SystemUser] Failed to set up shared caches for ${systemUsername}:`, err)
    // Non-fatal: shared caches are an optimization, not a requirement
  }

  console.log(`[SystemUser] System user ${systemUsername} created successfully`)
}

async function setSystemUserPassword(systemUsername: string, password: string): Promise<void> {
  if (password.includes('\n') || password.includes('\r')) {
    throw new Error('Password contains invalid characters (newline)')
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn('sudo', ['chpasswd'], { stdio: ['pipe', 'ignore', 'pipe'] })

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn chpasswd: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`chpasswd exited with code ${code}: ${stderr.trim()}`))
      }
    })

    child.stdin.write(`${systemUsername}:${password}\n`)
    child.stdin.end()
  })
}

export async function changeSystemUserPassword(username: string, newPassword: string): Promise<void> {
  const systemUsername = `auroracraft-${username}`
  const exists = await systemUserExists(username)
  if (!exists) {
    throw new Error(`System user ${systemUsername} does not exist`)
  }
  await setSystemUserPassword(systemUsername, newPassword)
  console.log(`[SystemUser] Password changed for ${systemUsername}`)
}
