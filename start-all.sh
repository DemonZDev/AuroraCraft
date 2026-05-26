#!/bin/bash
set -e

LOGDIR="/workspaces/AuroraCraft/logs"
mkdir -p "$LOGDIR"

echo "[$(date)] Starting AuroraCraft boot sequence..." >> "$LOGDIR/boot.log"

# Start PostgreSQL first
echo "[$(date)] Starting PostgreSQL..." >> "$LOGDIR/boot.log"
sudo service postgresql start || true
sleep 3

# Wait for PostgreSQL to be ready
timeout=30
while ! pg_isready -q; do
  sleep 1
  timeout=$((timeout - 1))
  if [ $timeout -le 0 ]; then
    echo "[$(date)] ERROR: PostgreSQL failed to start" >> "$LOGDIR/boot.log"
    exit 1
  fi
done

echo "[$(date)] PostgreSQL is ready" >> "$LOGDIR/boot.log"

# Export PATH for PM2
export PATH="/home/codespace/.local/share/pnpm:/home/codespace/nvm/current/bin:$PATH"

# Resurrect PM2 processes
pm2 resurrect >> "$LOGDIR/boot.log" 2>&1 || true
sleep 2

# Restart to ensure latest code is loaded (per RESTART_NOTES.md)
pm2 restart all >> "$LOGDIR/boot.log" 2>&1 || true
pm2 save >> "$LOGDIR/boot.log" 2>&1 || true

echo "[$(date)] AuroraCraft boot sequence complete" >> "$LOGDIR/boot.log"
