#!/bin/bash
set -e

# AuroraCraft Unified Management Script
# Usage: ./auroracraft.sh [start|restart|stop|status|web]
# Or run without arguments for interactive menu

PROJECT_DIR="/root/AuroraCraft"
LOGDIR="$PROJECT_DIR/logs"
export PATH="/root/.nvm/versions/node/v24.16.0/bin:$PATH"

# ── Colors ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────
die() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
ok()  { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
info() { echo -e "${CYAN}ℹ $1${NC}"; }

ensure_postgres() {
  if ! pg_isready -q 2>/dev/null; then
    info "Starting PostgreSQL..."
    service postgresql start || die "Failed to start PostgreSQL"
    local timeout=30
    while ! pg_isready -q; do
      sleep 1
      timeout=$((timeout - 1))
      if [ $timeout -le 0 ]; then
        die "PostgreSQL failed to start within 30s"
      fi
    done
    ok "PostgreSQL is ready"
  else
    ok "PostgreSQL already running"
  fi
}

check_health() {
  local url="http://localhost:3000/api/health"
  local retries=10
  local delay=1
  local i=0

  while [ $i -lt $retries ]; do
    if curl -s "$url" >/dev/null 2>&1; then
      local resp
      resp=$(curl -s "$url" 2>/dev/null || echo '{"status":"unknown"}')
      ok "Backend healthy — $url"
      info "Response: $resp"
      return 0
    fi
    i=$((i + 1))
    [ $i -lt $retries ] && sleep $delay
  done

  warn "Backend not responding on port 3000 after ${retries}s"
}

# ── Menu ──────────────────────────────────────────────
show_menu() {
  echo ""
  echo "╔═══════════════════════════════════════════╗"
  echo "║         AuroraCraft Management            ║"
  echo "╠═══════════════════════════════════════════╣"
  echo "║  1) Start   — PostgreSQL + Backend        ║"
  echo "║  2) Restart — Full restart                ║"
  echo "║  3) Stop    — Backend + PostgreSQL        ║"
  echo "║  4) Web     — Status, URL & access info   ║"
  echo "╚═══════════════════════════════════════════╝"
  echo ""
  read -rp "Select option [1-4 or q to quit]: " choice
  case "$choice" in
    1|start|Start|START) cmd_start ;;
    2|restart|Restart|RESTART) cmd_restart ;;
    3|stop|Stop|STOP) cmd_stop ;;
    4|web|Web|WEB) cmd_web ;;
    q|Q|quit|exit) echo "Bye."; exit 0 ;;
    *) warn "Invalid option: $choice"; show_menu ;;
  esac
}

# ── Commands ────────────────────────────────────────────
cmd_start() {
  echo ""
  info "=== Starting AuroraCraft ==="
  ensure_postgres

  cd "$PROJECT_DIR" || die "Cannot enter $PROJECT_DIR"

  if pm2 list 2>/dev/null | grep -q "auroracraft-server"; then
    ok "PM2 process already registered — resurrecting..."
    pm2 resurrect 2>/dev/null || true
    pm2 restart auroracraft-server 2>/dev/null || pm2 start ecosystem.config.cjs
  else
    info "Starting auroracraft-server via PM2..."
    pm2 start ecosystem.config.cjs
  fi

  sleep 2
  pm2 save >/dev/null 2>&1 || true

  echo ""
  check_health
  echo ""
  ok "AuroraCraft started successfully"
  info "Dashboard: http://localhost:3000"
  info "Admin login: admin / admin123"
}

cmd_restart() {
  echo ""
  info "=== Restarting AuroraCraft ==="

  # Stop backend
  info "Stopping PM2 processes..."
  pm2 stop all 2>/dev/null || true
  sleep 1

  # Restart PostgreSQL
  info "Restarting PostgreSQL..."
  service postgresql restart || die "Failed to restart PostgreSQL"
  local timeout=30
  while ! pg_isready -q; do
    sleep 1
    timeout=$((timeout - 1))
    if [ $timeout -le 0 ]; then
      die "PostgreSQL failed to start within 30s"
    fi
  done
  ok "PostgreSQL restarted"

  # Start backend
  cd "$PROJECT_DIR" || die "Cannot enter $PROJECT_DIR"
  pm2 restart all 2>/dev/null || pm2 start ecosystem.config.cjs
  sleep 2
  pm2 save >/dev/null 2>&1 || true

  echo ""
  check_health
  echo ""
  ok "AuroraCraft restarted successfully"
}

cmd_stop() {
  echo ""
  info "=== Stopping AuroraCraft ==="

  info "Stopping PM2 processes..."
  pm2 stop all 2>/dev/null || true
  pm2 delete all 2>/dev/null || true
  ok "PM2 processes stopped"

  info "Stopping PostgreSQL..."
  service postgresql stop 2>/dev/null || true
  ok "PostgreSQL stopped"

  echo ""
  ok "AuroraCraft stopped"
}

cmd_web() {
  echo ""
  info "=== AuroraCraft Web Status ==="
  echo ""

  # Check if backend is running
  if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
    local resp
    resp=$(curl -s http://localhost:3000/api/health 2>/dev/null)
    ok "Backend is RUNNING"
    info "Health: $resp"
  else
    warn "Backend is NOT running on port 3000"
  fi

  # Check PostgreSQL
  if pg_isready -q 2>/dev/null; then
    ok "PostgreSQL is RUNNING"
  else
    warn "PostgreSQL is NOT running"
  fi

  # Check PM2
  echo ""
  pm2 list 2>/dev/null || warn "PM2 not running"

  # URLs
  echo ""
  info "Access URLs:"
  echo "  Local:     http://localhost:3000"
  echo "  Health:    http://localhost:3000/api/health"
  echo "  Admin:     http://localhost:3000  (admin / admin123)"

  # Check if bound to 0.0.0.0
  local ip
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -n "$ip" ]; then
    echo "  Network:   http://$ip:3000"
  fi

  # Cloudflare tunnel note
  echo ""
  info "Public Access (Cloudflare Tunnel):"
  echo "  If you have cloudflared installed, run:"
  echo "    cloudflared tunnel --url http://localhost:3000"
  echo "  For a permanent tunnel, create one at https://one.dash.cloudflare.com"

  # Recent logs
  echo ""
  if [ -f "$LOGDIR/server-out.log" ]; then
    info "Recent backend logs (last 3 lines):"
    tail -n 3 "$LOGDIR/server-out.log" | sed 's/^/  /'
  fi
}

# ── Main ──────────────────────────────────────────────
if [ $# -eq 0 ]; then
  show_menu
else
  case "$1" in
    start|1)   cmd_start ;;
    restart|2) cmd_restart ;;
    stop|3)    cmd_stop ;;
    web|status|4) cmd_web ;;
    *)
      echo "Usage: $0 [start|restart|stop|web]"
      echo ""
      show_menu
      ;;
  esac
fi
