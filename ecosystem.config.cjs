const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname)
const LOGS = path.resolve(ROOT, 'logs')

// Resolve tsx's ESM entry point dynamically so a tsx version bump in node_modules/.pnpm
// (e.g. 4.22.3 → 4.22.4) doesn't break startup. Must be the .mjs entry, not the shell wrapper.
function resolveTsxCli() {
  const pnpmDir = path.resolve(ROOT, 'node_modules/.pnpm')
  const dir = fs.readdirSync(pnpmDir).find((d) => /^tsx@/.test(d))
  if (!dir) throw new Error('tsx not found in node_modules/.pnpm — run pnpm install')
  return path.resolve(pnpmDir, dir, 'node_modules/tsx/dist/cli.mjs')
}

module.exports = {
  apps: [
    {
      name: 'auroracraft-server',
      cwd: ROOT,
      script: resolveTsxCli(),
      args: 'server/src/index.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      wait_ready: false,
      restart_delay: 3000,
      kill_timeout: 10000,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: path.resolve(LOGS, 'server-error.log'),
      out_file: path.resolve(LOGS, 'server-out.log'),
      merge_logs: true,
    },
  ],
}
