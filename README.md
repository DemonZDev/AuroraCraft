# AuroraCraft

AI-powered Minecraft plugin development platform. Describe what you want and an AI agent writes the plugin code — supporting Java & Kotlin, Maven & Gradle, and multiple server software types.

## Features

- **AI Plugin Generation** — Chat with an AI coding agent (OpenCode) that writes, edits, and scaffolds Minecraft plugins
- **Multi-Model Support** — Choose from free AI models (DeepSeek V4 Flash Free, Nemotron 3 Super Free)
- **Project Management** — Create, configure, and manage multiple plugin projects
- **Real-Time Streaming** — Live streaming of AI responses with thinking blocks, file operations, and progress tracking
- **Monaco Code Editor** — Built-in code editor with syntax highlighting and file tree navigation
- **Admin Panel** — User management, project oversight, and AI runtime configuration
- **Multi-User** — Role-based access control (admin / user)
- **CodeRabbit Integration** — AI-powered code review for uncommitted changes

## Tech Stack

| Layer     | Technology                                                  |
| --------- | ----------------------------------------------------------- |
| Frontend  | React 19, Vite 7, TailwindCSS 4, React Router, TanStack Query, Zustand, Monaco Editor |
| Backend   | Fastify 5, Drizzle ORM, PostgreSQL, WebSocket               |
| AI Bridge | OpenCode (open-source AI coding agent)                       |
| Review    | CodeRabbit CLI                                              |
| Process   | PM2 (process manager with auto-restart)                      |
| Language  | TypeScript (ES2024, strict mode)                             |

---

## Prerequisites

- **OS:** Ubuntu 24.04 LTS (or Debian 12)
- **RAM:** 2 GB minimum, 4 GB recommended
- **Root or sudo access** (required for `adduser`, `runuser`, and `chmod`)
- **Domain** (optional, for production with HTTPS)

---

## Deployment

Run all commands as `root` unless noted.

### Step 1 — System Packages

```bash
apt update && apt install -y curl ca-certificates build-essential git unzip sqlite3 postgresql postgresql-contrib
```

### Step 2 — Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

Verify:

```bash
node -v   # v24.x.x
npm -v    # 10.x.x or 11.x.x
```

### Step 3 — pnpm

```bash
npm install -g pnpm
pnpm -v   # 11.x.x
```

### Step 4 — PM2

```bash
npm install -g pm2
pm2 -v    # 7.x.x
```

### Step 5 — PostgreSQL

PostgreSQL is already installed from Step 1. Enable and start it:

```bash
systemctl enable postgresql
systemctl start postgresql
pg_isready
```

Expected output: `/var/run/postgresql:5432 - accepting connections`

### Step 6 — OpenCode (AI Agent)

```bash
curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/refs/heads/main/install | bash
```

Verify:

```bash
opencode --version   # 1.15.x or higher
```

**Prerequisite:** `sqlite3` must be installed (included in Step 1). OpenCode stores conversation history in an SQLite database, and AuroraCraft uses `sqlite3` to clean up that data when projects are deleted.

**Copy the binary to a globally accessible location** (required for per-user isolation):

```bash
# Find where opencode is installed
which opencode

# If installed via npm (global), copy the package
cp -r $(npm root -g)/opencode-ai /usr/local/lib/node_modules/
ln -sf /usr/local/lib/node_modules/opencode-ai/bin/opencode.exe /usr/local/bin/opencode

# If installed via pnpm (global), use pnpm's global store
# cp -r $(pnpm root -g)/opencode-ai /usr/local/lib/node_modules/

# Verify
cd /tmp
/usr/local/bin/opencode --version
```

**Why this is required:** OpenCode spawns under each user's Linux account (`runuser -l auroracraft-{username}`). A binary inside `/root/.nvm/...` or `/root/.local/share/pnpm/...` is **inaccessible** to other users. `/usr/local/bin/opencode` must be readable by everyone.

### Step 7 — CodeRabbit (Code Review)

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | CODERABBIT_INSTALL_DIR=/usr/local/bin sh
```

Verify:

```bash
coderabbit --version   # 0.5.x
```

### Step 8 — Clone and Install

```bash
cd /root   # or your preferred deployment directory
git clone https://github.com/YOUR_USERNAME/AuroraCraft.git
cd AuroraCraft
pnpm install
```

This installs dependencies for both `client/` and `server/` workspaces.

### Step 9 — Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and set a strong random `SESSION_SECRET` (64+ hex characters):

```bash
# Generate a secret
openssl rand -hex 32
```

Paste the generated value into `.env`:

```env
# Database
DATABASE_URL=postgresql://auroracraft:auroracraft@localhost:5432/auroracraft

# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Session — CHANGE THIS to a random string (64+ characters)
SESSION_SECRET=your-generated-secret-here

# Cookie domain — set to your domain in production
COOKIE_DOMAIN=codeaurora.online

# Client URL (for CORS and redirects)
CLIENT_URL=https://codeaurora.online

# OpenCode per-project instance settings
OPENCODE_PORT_MIN=9000
OPENCODE_PORT_MAX=9999
OPENCODE_IDLE_TIMEOUT=120000

# GitHub OAuth — configured for codeaurora.online
# See Post-Deployment Setup below for GitHub App configuration steps
GITHUB_CLIENT_ID=Ov23liWP6laGMwXuXAm6
GITHUB_CLIENT_SECRET=fa5e63f18b730f7f0f5b31415805b637032d796c
GITHUB_CALLBACK_URL=https://codeaurora.online/api/auth/github/callback
```

### Step 10 — Database Setup

Create the PostgreSQL role and database:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE auroracraft WITH LOGIN PASSWORD 'auroracraft';
CREATE DATABASE auroracraft OWNER auroracraft;
GRANT ALL PRIVILEGES ON DATABASE auroracraft TO auroracraft;
SQL
```

Verify:

```bash
PGPASSWORD=auroracraft psql -U auroracraft -d auroracraft -h localhost -c 'SELECT 1;'
```

### Step 11 — Run Migrations

```bash
cd /root/AuroraCraft/server
DATABASE_URL="postgresql://auroracraft:auroracraft@localhost:5432/auroracraft" npx tsx src/db/migrate.ts
```

Expected output: `Migrations complete`

> **Note:** If you see errors about missing tables or columns, the Drizzle journal may be out of sync with the actual `.sql` files. Check `drizzle/meta/_journal.json` against the files in `drizzle/` and apply any missing files manually via `psql -f`.
>
> If the `0014_fix_token_transactions_fk.sql` migration is missing from your database, apply it manually:
>
> ```bash
> sudo -u postgres psql -d auroracraft -f server/drizzle/0014_fix_token_transactions_fk.sql
> ```
>
> This fixes project deletion by changing `token_transactions.session_id` from `ON DELETE NO ACTION` to `ON DELETE SET NULL`.

### Step 12 — Seed the Database

```bash
cd /root/AuroraCraft/server
DATABASE_URL="postgresql://auroracraft:auroracraft@localhost:5432/auroracraft" npx tsx src/db/seed.ts
```

The seed script creates:
- An `admin` user in the database
- A Linux system user `auroracraft-admin`

**Important:** The seed script may silently fail to create the Linux user if run without root or if `sudo`/`adduser` is not available. **Always verify:**

```bash
# Verify DB user exists
sudo -u postgres psql -d auroracraft -c "SELECT username, role FROM users WHERE username = 'admin';"

# Verify Linux user exists
id auroracraft-admin
```

If the Linux user is missing, create it manually:

```bash
adduser --disabled-password --gecos "" auroracraft-admin
echo "auroracraft-admin:admin123" | chpasswd
chmod 750 /home/auroracraft-admin
chown -R auroracraft-admin:auroracraft-admin /home/auroracraft-admin
```

Default admin credentials:

| Field    | Value              |
| -------- | ------------------ |
| Username | `admin`            |
| Password | `admin123`         |
| Email    | admin@auroracraft.dev |
| Role     | admin              |

> **Change the admin password after your first login.**

### Step 13 — Build the Frontend

```bash
cd /root/AuroraCraft/client
pnpm build
```

This creates `client/dist/` with static files. The backend serves these automatically.

### Step 14 — Initialize Shared Caches

OpenCode, Gradle, and Maven caches are shared across all users to prevent storage duplication. Every `auroracraft-{username}` user needs read/write access.

```bash
# Create shared directories
mkdir -p /var/lib/opencode/shared
mkdir -p /var/lib/gradle/shared
mkdir -p /var/lib/maven/shared

# Base package.json for OpenCode
cat > /var/lib/opencode/shared/package.json <<'EOF'
{
  "name": "opencode-shared-cache",
  "version": "1.0.0",
  "description": "Shared OpenCode plugin cache",
  "private": true
}
EOF

touch /var/lib/opencode/shared/package-lock.json

# Allow all auroracraft-* users to read and write
chmod -R 777 /var/lib/opencode/shared
chmod -R 777 /var/lib/gradle/shared
chmod -R 777 /var/lib/maven/shared
```

> **Why 777?** Each user runs as their own UID. A group-based approach would require a shared `auroracraft` group and `sg` on every `runuser` call, which is fragile. `777` on shared caches is the simplest correct solution.

### Step 15 — Verify OpenCode Accessibility

Before starting the server, confirm OpenCode works as a non-root user:

```bash
su - auroracraft-admin -c "opencode --version"
```

If this fails with "command not found", the binary is not in a globally accessible path. Go back to Step 6 and fix the symlink.

### Step 16 — Start with PM2

AuroraCraft includes a unified management script:

```bash
cd /root/AuroraCraft
mkdir -p logs
chmod +x auroracraft.sh
./auroracraft.sh start
```

Or use the interactive menu:

```bash
./auroracraft.sh
```

Select option `1` to start.

Verify all services are online:

```bash
./auroracraft.sh web
```

> **If the backend fails to start**, check `ecosystem.config.cjs`. The `script` field must point to the **direct `.mjs` entry point**, not the `tsx` shell wrapper:
>
> ```js
> script: '/root/AuroraCraft/node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs',
> ```
> Adjust the exact path to match your installed tsx version.

### Step 17 — Auto-Start on Boot

Save the PM2 process list:

```bash
pm2 save
```

Generate the startup script:

```bash
pm2 startup systemd -u root --hp /root
```

PM2 will print a command — copy and execute it. Example:

```bash
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

Then add the boot command to crontab so PostgreSQL starts before PM2:

```bash
crontab -l 2>/dev/null | grep -v auroracraft.sh > /tmp/crontab.txt || true
echo "@reboot /root/AuroraCraft/auroracraft.sh start >> /root/AuroraCraft/logs/boot.log 2>&1" >> /tmp/crontab.txt
crontab /tmp/crontab.txt
rm -f /tmp/crontab.txt
```

The `auroracraft.sh start` command will:
1. Start PostgreSQL
2. Wait for it to be ready
3. Resurrect PM2 processes
4. Restart to load latest code
5. Save the process list

### Step 18 — Verify Full Deployment

Run the unified status command:

```bash
./auroracraft.sh web
```

Expected output:
- ✅ Backend is RUNNING
- ✅ PostgreSQL is RUNNING
- ✅ PM2 process `auroracraft-server` shows as `online`
- ✅ Health response: `{"status":"ok"}`
- URLs printed (local + network IP)

For a deeper check, run:

```bash
echo "=== AuroraCraft Deployment Verification ==="

echo ""
echo "1. PostgreSQL:"
systemctl is-active postgresql
systemctl is-enabled postgresql

echo ""
echo "2. PM2 Process:"
pm2 list | grep auroracraft-server

echo ""
echo "3. Health:"
curl -s http://localhost:3000/api/health

echo ""
echo "4. Frontend serving:"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/

echo ""
echo "5. Database tables:"
PGPASSWORD=auroracraft psql -U auroracraft -d auroracraft -h localhost -c "
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
"

echo ""
echo "6. OpenCode global:"
/usr/local/bin/opencode --version

echo ""
echo "7. CodeRabbit CLI:"
coderabbit --version

echo ""
echo "8. Shared caches:"
ls -la /var/lib/opencode/shared/
ls -la /var/lib/gradle/shared/
ls -la /var/lib/maven/shared/

echo ""
echo "9. Admin Linux user:"
id auroracraft-admin

echo ""
echo "10. sqlite3 (required for OpenCode cleanup):"
sqlite3 --version

echo ""
echo "11. Token transactions FK (prevents project deletion if wrong):"
sudo -u postgres psql -d auroracraft -tc "
SELECT 'OK' FROM information_schema.table_constraints
WHERE constraint_name = 'token_transactions_session_id_agent_sessions_id_fk'
AND delete_rule = 'SET NULL';
"

echo ""
echo "12. Isolated config base directory (for per-project API key isolation):"
ls -ld /var/lib/auroracraft/configs/ 2>/dev/null && echo "OK" || echo "MISSING — create with: mkdir -p /var/lib/auroracraft/configs && chmod 700 /var/lib/auroracraft && chmod 711 /var/lib/auroracraft/configs"

echo ""
echo "All checks complete."
```

Expected: All green, 11 checks passed, all versions showing.

---

## Post-Deployment Setup

### 1. First Login

Open `http://your-server-ip:3000` in a browser.

Login with:
- Username: `admin`
- Password: `admin123`

**Immediately change the admin password** via the UI.

### 2. Configure GitHub OAuth (Optional)

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Fill in the details:
   - **Application name**: AuroraCraft
   - **Homepage URL**: `https://codeaurora.online` (or your domain)
   - **Authorization callback URL**: `https://codeaurora.online/api/auth/github/callback`
   - **Enable Device Flow**: No
   - **Request user authorization (OAuth) during installation**: Yes
4. Copy the **Client ID** and generate a **Client Secret**
5. Update `.env`:

```env
GITHUB_CLIENT_ID=Ov23liWP6laGMwXuXAm6
GITHUB_CLIENT_SECRET=fa5e63f18b730f7f0f5b31415805b637032d796c
GITHUB_CALLBACK_URL=https://codeaurora.online/api/auth/github/callback
```

6. Restart the server: `./auroracraft.sh restart`

**Note:** The callback URL must match exactly what you configured in the GitHub OAuth App. If your domain uses HTTP instead of HTTPS, update accordingly.

### 3. Configure CodeRabbit (Optional)

1. Go to [CodeRabbit Settings](https://app.coderabbit.ai/settings/api-keys)
2. Generate an API key
3. In AuroraCraft Admin Panel → Users → click "Grant Access" on any user
4. Paste the API key

### 4. Set Up HTTPS / Reverse Proxy (Recommended for Production)

Use Nginx or Caddy to terminate SSL and proxy to port 3000:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Update `.env`:

```env
COOKIE_DOMAIN=your-domain.com
CLIENT_URL=https://your-domain.com
```

Restart: `./auroracraft.sh restart`

### 5. Firewall

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3000/tcp   # Block direct backend access
ufw deny 9000:9999/tcp  # Block OpenCode ports
ufw enable
```

---

## Architecture Overview

### Per-User Isolation

Each registered AuroraCraft user gets a Linux system user:

- **Username pattern:** `auroracraft-{username}`
- **Home directory:** `/home/auroracraft-{username}/`
- **Permissions:** `drwxr-x---` (750) — owner only
- **OpenCode instances:** Run as the user's system account via `runuser`
- **File isolation:** Users cannot access each other's files or processes

**Important:** When a new user registers through the web UI, the backend calls `adduser` via `sudo`. The server must run as root, or the `auroracraft` user must have passwordless `sudo` for `adduser`, `userdel`, `chmod`, `chown`, and `runuser`.

### OpenCode Instance Lifecycle

```
User sends AI message
    ↓
Backend allocates port (9000-9999)
    ↓
Spawns OpenCode via runuser as auroracraft-{user}
    ↓
Waits for /session endpoint to respond
    ↓
Streams AI response via SSE
    ↓
User stops chatting → 120s idle timeout
    ↓
SIGTERM → SIGKILL → Port released
```

- **No global/shared OpenCode process**
- **Each message gets a fresh instance**
- **Ports are reused after release**
- **1000 concurrent projects max** (9000-9999 range)

### API Key Isolation (Per-Project)

Provider API keys (Fireworks, Blueminds, Modal) are **never stored in the workspace tree**. They are isolated per-project to prevent exposure through the code editor:

| Location | Contents | Permissions | Visibility |
|----------|----------|-------------|------------|
| `{projectDir}/opencode.json` | Minimal stub (`$schema`, `permission`, `tools`, `model`) | `644` | Workspace editor |
| `/var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/opencode.json` | Full provider config with real `apiKey` | `600` (user-only) | **Hidden from workspace** |
| `/var/lib/auroracraft/configs/{user}/{linkId}/.local/share/opencode/` | Per-project SQLite DB & session data | `700` (user-only) | **Isolated per project** |

**How it works:**
1. When a user sends an AI message, the backend writes the provider config (with the real API key) to an isolated directory outside the project tree
2. The workspace `opencode.json` contains only a minimal stub with no secrets
3. OpenCode is spawned with `HOME=/var/lib/auroracraft/configs/{user}/{linkId}` so it reads the isolated config
4. Each project gets its own isolated `HOME`, preventing concurrent projects from interfering with each other's provider settings or SQLite databases
5. Other Linux users cannot read the isolated config (Permission denied)

**Result:** Even if a user opens `opencode.json` in the workspace editor, they only see the minimal stub — not the real API key.

#### OpenCode Zen API Keys (Special Handling)

OpenCode Zen is **not a separate external provider** — it's a built-in OpenCode feature. Zen models (e.g., `opencode/deepseek-v4-flash-free`) work in two modes:

| Mode | API Key Required | How it works |
|------|-----------------|--------------|
| **Free tier** | No | Works out of the box with OpenCode's free models |
| **Zen tier** | Yes | User's Zen API key is written to `~/.local/share/opencode/auth.json` |

When a user has a Zen API key configured, the backend writes it to:
```
/var/lib/auroracraft/configs/{user}/{linkId}/.local/share/opencode/auth.json
```

Format:
```json
{
  "opencode": {
    "apiKey": "zen-api-key-here"
  }
}
```

OpenCode reads this auth file automatically. Without a Zen key, the model falls back to the free tier.

**Important:** Zen models use the `opencode/{model_id}` format (e.g., `opencode/deepseek-v4-flash-free`), not a separate `zen/` provider prefix.

### Shared Caches

| Cache | Location | Per-User Symlink |
|-------|----------|------------------|
| OpenCode plugins | `/var/lib/opencode/shared/node_modules` | `~/.config/opencode/shared/node_modules` |
| OpenCode manifest | `/var/lib/opencode/shared/package.json` | `~/.config/opencode/shared/package.json` |
| Gradle dependencies | `/var/lib/gradle/shared` | `~/.gradle/caches` |
| Maven artifacts | `/var/lib/maven/shared` | `~/.m2/repository` |

When a new user registers, the server automatically creates these symlinks. Plugin downloads are shared across all users.

---

## Management Commands

Use the unified script for everyday operations:

```bash
./auroracraft.sh        # Interactive menu
./auroracraft.sh start  # Start PostgreSQL + Backend
./auroracraft.sh restart # Full restart
./auroracraft.sh stop   # Stop everything
./auroracraft.sh web    # Status, URLs & logs
```

For advanced PM2 operations:

```bash
pm2 list                        # Show all processes
pm2 logs                        # Tail all logs
pm2 logs auroracraft-server     # Tail server logs
pm2 restart all                 # Restart all
pm2 restart auroracraft-server  # Restart one service
pm2 stop all                    # Stop all
pm2 delete all                  # Remove all from PM2
pm2 start ecosystem.config.cjs  # Start from config
pm2 save                        # Save current process list
pm2 monit                       # Real-time monitoring dashboard
```

---

## Troubleshooting

### Backend won't start

```bash
./auroracraft.sh restart
./auroracraft.sh web
pm2 logs auroracraft-server --lines 50
cat /root/AuroraCraft/logs/server-error.log | tail -20
```

Common causes: port 3000 in use, database connection failure, missing `.env`, `ecosystem.config.cjs` pointing to wrong tsx path.

### Database connection failed

```bash
pg_isready
PGPASSWORD=auroracraft psql -U auroracraft -d auroracraft -h localhost -c 'SELECT 1;'
```

### OpenCode instance stuck or "command not found"

```bash
# Check if opencode is globally accessible
su - auroracraft-admin -c "opencode --version"

# If it fails, fix the symlink
ls -la /usr/local/bin/opencode
ls -la /usr/local/lib/node_modules/opencode-ai/

# Kill stuck processes
ps aux | grep opencode
pkill -f "opencode serve"
./auroracraft.sh restart
```

### Port allocation exhausted

```bash
netstat -tuln | grep -E "900[0-9]|99[0-9][0-9]"
./auroracraft.sh restart
```

### PostgreSQL won't start after reboot

```bash
service postgresql start
pg_isready
```

If stale PID file: `pg_ctlcluster 16 main start` (replace `16` with your PostgreSQL version).

### Shared cache permission denied

```bash
chmod -R 777 /var/lib/opencode/shared
chmod -R 777 /var/lib/gradle/shared
chmod -R 777 /var/lib/maven/shared
```

### Linux user not created on registration

If a user registers via the web UI but `id auroracraft-{username}` returns "no such user":

1. The server may not be running as root
2. `sudo` may require a password for the `auroracraft` system user
3. `adduser` may not be installed

Fix manually:

```bash
adduser --disabled-password --gecos "" auroracraft-{username}
echo "auroracraft-{username}:{password}" | chpasswd
chmod 750 /home/auroracraft-{username}
chown -R auroracraft-{username}:auroracraft-{username} /home/auroracraft-{username}
```

Then set up shared caches:

```bash
USER="auroracraft-{username}"
mkdir -p /home/$USER/.config/opencode
ln -sf /var/lib/opencode/shared /home/$USER/.config/opencode/shared
mkdir -p /home/$USER/.gradle
ln -sf /var/lib/gradle/shared /home/$USER/.gradle/caches
mkdir -p /home/$USER/.m2
ln -sf /var/lib/maven/shared /home/$USER/.m2/repository
chown -R $USER:$USER /home/$USER
```

### Project deletion fails (HTTP 500)

If deleting a project returns `Failed query: delete from "projects"...`, a foreign key constraint may be blocking the cascade delete.

**Root cause:** `token_transactions.session_id` references `agent_sessions(id)` with `ON DELETE NO ACTION`. When a project is deleted, its sessions are cascade-deleted, but the FK blocks it because transactions still reference those sessions.

**Fix:**

```bash
sudo -u postgres psql -d auroracraft -c "
ALTER TABLE token_transactions DROP CONSTRAINT token_transactions_session_id_fkey;
ALTER TABLE token_transactions ADD CONSTRAINT token_transactions_session_id_agent_sessions_id_fk
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;
"
```

If using Drizzle migrations, apply migration `0014_fix_token_transactions_fk.sql` (included in the repo).

### API key visible in workspace editor / opencode.json

If you open `opencode.json` in the project workspace and see a raw API key, the server is running an older version. In the current architecture:

- **Workspace `opencode.json`** (in the project directory) contains only a minimal stub with no API keys
- **Real provider config** lives in `/var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/opencode.json` with `600` permissions (user-only)
- **Each project** gets its own isolated `HOME` directory, so concurrent projects never share config or SQLite databases

Restart the server to ensure the latest code is loaded:

```bash
./auroracraft.sh restart
```

Verify the isolation:

```bash
# Should show only $schema, permission, tools (no apiKey)
cat /home/auroracraft-{username}/{linkId}/opencode.json

# Should contain the real apiKey (root or owner only)
sudo cat /var/lib/auroracraft/configs/auroracraft-{username}/{linkId}/.config/opencode/opencode.json | grep apiKey
```

### Zen model not working / "Model not found" error

If you see an error like:

```
Model not found: opencode/opencode/deepseek-v4-flash-free
```

**Root cause:** The model ID was incorrectly prefixed with `opencode/opencode/` instead of `opencode/`.

**Fix:** This has been fixed in the current code. The model ID is now correctly set to `opencode/deepseek-v4-flash-free`. Restart the server:

```bash
./auroracraft.sh restart
```

If the issue persists, verify the Zen auth file exists:

```bash
# Check Zen auth.json (only exists if user has Zen API key)
sudo cat /var/lib/auroracraft/configs/auroracraft-{username}/{linkId}/.local/share/opencode/auth.json

# Should show: {"opencode": {"apiKey": "..."}}
```

**Note:** Zen is not a separate provider. Zen models always use the `opencode/` prefix (e.g., `opencode/deepseek-v4-flash-free`). The Zen API key is stored in `auth.json`, not in the provider config.

### AI model returns "Provider not available"

Some models have only a single provider with a non-`fast` speed (e.g. `glm-5.1-free` → Modal, speed `rate_limited`). If the frontend sends `speed: 'fast'` and no matching provider is found, you get:

```
Provider not available for GLM-5.1 at fast speed
```

**Fix:** The backend now falls back to any available provider when the exact speed doesn't match. If you still see this, the `getProviderForModel()` function in `server/src/config/ai-models.ts` may need updating.

### Modal API returns 429 (Too many concurrent requests)

Modal's `zai-org/GLM-5.1-FP8` model is heavily rate-limited. The API key is valid, but you may see:

```json
{"error": "Too many concurrent requests for this model"}
```

This is a provider-side limitation, not a configuration bug. Retry after a few minutes or switch to a different model.

### Blueminds model returns upstream error

The `moonshotai/kimi-k2.6` model on Blueminds may return:

```json
{"error":{"message":"openai_error","type":"bad_response_status_code"}}
```

This is an upstream provider error. Use the Fireworks provider for `kimi-k2.6` instead (it works reliably).

### DeepSeek V4 Pro via Bluesminds uses Fireworks routing

Blueminds routes some models through Fireworks under the hood. The model ID for DeepSeek V4 Pro on Blueminds is:

```
accounts/fireworks/models/deepseek-v4-pro
```

Not `deepseek-v4-pro` (the official DeepSeek route, which is currently unavailable). This is configured automatically in `server/src/config/ai-models.ts`.

### Thinking badges not showing / raw reasoning text in chat

Some models (DeepSeek via Fireworks/Blueminds) emit reasoning as plain text rather than native reasoning parts. AuroraCraft now parses three formats automatically:

- `<thinking>...</thinking>` — Generic thinking tags
- `<reasoning>...</reasoning>` — Generic reasoning tags  
- ` ... ` — DeepSeek native format

If you still see raw reasoning text in the chat, the model may not be wrapping its thinking in these tags. The system prompt (in `server/src/bridges/system-prompt.ts`) instructs the model to use `<thinking>...</thinking>` tags.

### "No response after 30 seconds" error with slow models

Older versions of AuroraCraft had a 30-second initial response timeout that would fire even when the model was actively responding. This has been removed. The server now only warns after **3 minutes** of inactivity and times out after **30 minutes**.

If you still see a 30-second error, restart the server to load the latest code:

```bash
./auroracraft.sh restart
```

---

## Project Structure

```
AuroraCraft/
├── client/                   # React frontend (Vite)
│   ├── src/
│   │   ├── components/       # Shared UI components
│   │   ├── pages/            # Route pages (dashboard, admin, projects)
│   │   ├── stores/           # Zustand state stores
│   │   ├── types/            # TypeScript types & AI model definitions
│   │   └── ...
│   ├── dist/                 # Production build (served by backend)
│   └── package.json
├── server/                   # Fastify backend
│   ├── drizzle/              # SQL migration files
│   ├── src/
│   │   ├── agents/           # AI agent execution logic
│   │   ├── bridges/          # OpenCode bridge (SSE streaming)
│   │   ├── db/               # Database connection, schema, migrations, seed
│   │   ├── middleware/       # Authentication middleware
│   │   ├── plugins/          # Fastify plugins (CORS, cookies, WebSocket)
│   │   ├── routes/           # API routes (auth, projects, agents, admin)
│   │   └── index.ts          # Server entry point
│   ├── drizzle.config.ts
│   └── package.json
├── ecosystem.config.cjs      # PM2 process configuration
├── auroracraft.sh            # Unified management script (start / restart / stop / web)
├── .env                      # Environment variables (secrets)
├── .env.example              # Environment variable template
├── package.json              # Root workspace configuration
├── tsconfig.base.json        # Shared TypeScript configuration
└── /var/lib/auroracraft/     # Runtime data (created on first start)
    ├── configs/              # Per-project isolated OpenCode configs (600 perms)
    │   └── auroracraft-{user}/
    │       └── {linkId}/     # Isolated HOME for each project
    │           ├── .config/opencode/opencode.json   # Provider config with API key
    │           └── .local/share/opencode/           # Per-project SQLite DB
    └── shared/               # Shared dependency caches
        ├── opencode/         # Shared node_modules for OpenCode plugins
        ├── gradle/           # Shared Gradle cache
        └── maven/            # Shared Maven repository
```

---

## License

MIT
