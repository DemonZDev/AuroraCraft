# AuroraCraft

AI-powered Minecraft plugin development platform. Describe what you want and an AI agent writes the plugin code — supporting Java & Kotlin, Maven & Gradle, and multiple server software types.

## Features

- **AI Plugin Generation** — Chat with an AI coding agent (OpenCode) that writes, edits, and scaffolds Minecraft plugins
- **Multi-Model Support** — Choose from 9 AI models across free and paid tiers (DeepSeek V4 Flash Free, Nemotron 3 Super Free, GLM-5.1, MiniMax M2.7, Kimi K2.6, Qwen3.6, and more)
- **Token-Based Pricing** — Precise per-message cost calculation with per-provider pricing differentiation, cached-input discounts, and automatic reconciliation (refunds when actual < estimated, capped overage when actual > estimated)
- **Web Search via Firecrawl MCP** — Paid users get real-time web search, scraping, and crawling via Firecrawl's Model Context Protocol (MCP) server
- **Graphify Token Savings** — Paid users can build a per-project code knowledge graph (`graph.json` + `graph.html`) with **zero AI/token cost** (AST-only). The AI agent then queries the graph (`graphify query/path/explain`) instead of re-reading files, and an interactive graph viewer renders inside the workspace editor
- **Project Management** — Create, configure, and manage multiple plugin projects
- **Real-Time Streaming** — Live streaming of AI responses with thinking blocks, file operations, and progress tracking
- **Monaco Code Editor** — Built-in code editor with syntax highlighting and file tree navigation
- **Admin Panel** — User management, project oversight, and AI runtime configuration
- **Multi-User** — Role-based access control (admin / user)
- **CodeRabbit Integration** — AI-powered code review for uncommitted changes
- **Dynamic Rules & Skills** — Per-project AI rules and skills auto-generated from platform-specific knowledge base (14 sections, 8 skills) covering Paper, Spigot, Folia, Velocity, BungeeCord, and 13 more platforms
- **Platform-Aware Code Generation** — AI automatically uses correct APIs (Adventure Components vs ChatColor), scheduler types (BukkitScheduler vs RegionScheduler), and build systems (Maven vs Gradle) based on project configuration
- **AI Error Prevention** — Built-in statistics on most common AI mistakes (78% sync DB queries, 64% unthrottled PlayerMoveEvent, etc.) embedded in every project's rules

## Supported Server Software

AuroraCraft supports **18 Minecraft server platforms** organized into 4 categories:

### Game Servers (Plugin-Compatible)
| Platform | Description | Fork Of |
|----------|-------------|---------|
| **Paper** | Industry standard — high performance, stable, most plugins | Spigot |
| **Purpur** | Paper + 400+ gameplay config options (rideable mobs, etc.) | Paper |
| **Pufferfish** | Paper optimized for 100+ players (DAB, SIMD) | Paper |
| **Folia** | Paper with regionized multi-threading for massive servers | Paper |
| **Spigot** | Legacy Bukkit fork — maximum plugin compatibility | CraftBukkit |
| **Leaf** | Paper fork balancing performance, vanilla parity & stability | Paper |
| **Leaves** | Paper fork repairing broken vanilla redstone/mechanics | Paper |
| **DivineMC** | Purpur fork with parallel ticking, async ops, 1024-bit seeds | Purpur |
| **Pluto** | Pufferfish fork with memory, hopper & farm optimizations | Pufferfish |
| **ASPaper** | Paper with Slime World Manager built-in for instancing | Paper |

### Hybrid Servers (Mods + Plugins)
| Platform | Description | Mod Loader |
|----------|-------------|------------|
| **Mohist** | Forge + Bukkit/Spigot/Paper APIs (formerly Thermos) | Forge |
| **Arclight** | Bukkit on Forge/NeoForge/Fabric via Mixin remapping | Forge/NeoForge/Fabric |
| **Magma** | NeoForge + Spigot — next-gen hybrid server | NeoForge |
| **Youer** | NeoForge + Paper/Purpur API (MohistMC successor) | NeoForge |

### Proxy Servers (Multi-Server Networks)
| Platform | Description | Fork Of |
|----------|-------------|---------|
| **Velocity** | Modern, secure, high-performance proxy (recommended) | — |
| **BungeeCord** | Legacy proxy — mature but slower development | — |
| **Waterfall** | Paper-maintained BungeeCord fork (discontinued) | BungeeCord |
| **Velocity-CTD** | Velocity fork with queues, extra commands & fixes | Velocity |

> **Note:** The AI agent tailors generated code, `plugin.yml` descriptors, and API imports based on the selected platform. Each project gets a **dynamically generated AGENTS.md rules file** (14 sections) and **8 on-demand skills** loaded into OpenCode, covering platform-specific APIs, threading models, build systems, and coding conventions. Hybrid servers get both plugin and mod-aware scaffolding.

## Tech Stack

| Layer     | Technology                                                  |
| --------- | ----------------------------------------------------------- |
| Frontend  | React 19, Vite 7, TailwindCSS 4, React Router, TanStack Query, Zustand, Monaco Editor |
| Backend   | Fastify 5, Drizzle ORM, PostgreSQL, WebSocket               |
| AI Bridge | OpenCode (open-source AI coding agent) + MCP servers          |
| AI Rules  | Dynamic AGENTS.md + SKILL.md per-project, 10 platform fragments, 8 skills |
| Review    | CodeRabbit CLI                                              |
| Process   | PM2 (process manager with auto-restart)                      |
| Language  | TypeScript (ES2024, strict mode)                             |
| Sandbox   | Bash command wrapper with filesystem restriction & blocklist |
| Build     | Java 8/11/17/21/25, Maven 3.8.7, Gradle 8.5                |

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
apt update && apt install -y curl ca-certificates build-essential git unzip sqlite3 postgresql postgresql-contrib python3 python3-venv python3-pip
```

> `python3-venv` and `python3-pip` are required for the optional **Graphify** feature (Step 15.6). They are not installed by default on a minimal Ubuntu image, and `python3 -m venv` fails without `python3-venv`. Install them now to avoid a mid-deploy error.

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

### Step 5 — Java, Maven & Gradle (Required for Plugin Compilation)

AuroraCraft supports Java 8/11/17/21/25. Install OpenJDK 21 (default) and build tools:

```bash
apt update && apt install -y openjdk-21-jdk maven gradle
```

Verify:

```bash
java -version    # openjdk version "21.0.x"
mvn -version     # Apache Maven 3.8.x
gradle --version # Gradle 8.5
```

**Optional: Install additional Java versions** (for projects targeting older servers):

```bash
apt install -y openjdk-8-jdk openjdk-11-jdk openjdk-17-jdk openjdk-25-jdk
```

The AI agent sandbox automatically selects the correct Java version based on project configuration.

### Step 6 — PostgreSQL

PostgreSQL is already installed from Step 1. Enable and start it:

```bash
systemctl enable postgresql
systemctl start postgresql
pg_isready
```

Expected output: `/var/run/postgresql:5432 - accepting connections`

### Step 7 — OpenCode (AI Agent)

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

### Step 8 — CodeRabbit (Code Review)

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | CODERABBIT_INSTALL_DIR=/usr/local/bin sh
```

Verify:

```bash
coderabbit --version   # 0.5.x
```

### Step 9 — Clone and Install

```bash
cd /root   # or your preferred deployment directory
git clone https://github.com/YOUR_USERNAME/AuroraCraft.git
cd AuroraCraft
pnpm install
```

This installs dependencies for both `client/` and `server/` workspaces.

### Step 10 — Environment Configuration

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

### Step 11 — Database Setup

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

### Step 12 — Run Migrations

```bash
cd /root/AuroraCraft/server
DATABASE_URL="postgresql://auroracraft:auroracraft@localhost:5432/auroracraft" npx tsx src/db/migrate.ts
```

Expected output: `Migrations complete`

> **Migration set includes Graphify (0017).** Migration `0017_uneven_giant_man.sql` adds three columns to `projects` (`graphify_enabled`, `graphify_status`, `graphify_built_at`) for the "Save tokens using Graphify" feature. It is written to be **idempotent** (`CREATE TYPE … EXCEPTION WHEN duplicate_object` + `ADD COLUMN IF NOT EXISTS`), so it is safe to re-run and safe on databases where the columns already exist.
>
> **Note:** If you see errors about missing tables or columns, the Drizzle journal may be out of sync with the actual `.sql` files. Check `drizzle/meta/_journal.json` against the files in `drizzle/` and apply any missing files manually via `psql -f`.
>
> **Knowledge — drizzle migration tracking drift.** The migrator decides what to run from `MAX(created_at)` in `drizzle.__drizzle_migrations`. If earlier migrations were applied manually via `psql` (bypassing the migrator), that tracking table can lag behind the real schema, and a later `npx tsx src/db/migrate.ts` may try to re-run already-applied migrations and fail with "already exists". If that happens: apply the new migration directly with `psql -1 -f drizzle/<file>.sql`, then record it so the migrator skips it:
> ```bash
> # after applying drizzle/0017_*.sql by hand:
> sudo -u postgres psql -d auroracraft -c "INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) SELECT COALESCE(MAX(id),0)+1, '<sha256-of-file>', <journal_when_ms> FROM drizzle.__drizzle_migrations;"
> sudo -u postgres psql -d auroracraft -c "SELECT setval(pg_get_serial_sequence('drizzle.__drizzle_migrations','id'), (SELECT MAX(id) FROM drizzle.__drizzle_migrations));"
> ```
> On a **fresh** database this never happens — all migrations (including 0017) apply cleanly in order.
>
> If the `0014_fix_token_transactions_fk.sql` migration is missing from your database, apply it manually:
>
> ```bash
> sudo -u postgres psql -d auroracraft -f server/drizzle/0014_fix_token_transactions_fk.sql
> ```
>
> This fixes project deletion by changing `token_transactions.session_id` from `ON DELETE NO ACTION` to `ON DELETE SET NULL`.

### Step 13 — Seed the Database

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

### Step 14 — Build

Build both frontend and backend:

```bash
cd /root/AuroraCraft
pnpm --filter client build && pnpm --filter server build
```

This creates `client/dist/` with static files (served by backend) and `server/dist/` with compiled JavaScript.

> **Note:** The server build uses `noEmitOnError: false` in `server/tsconfig.json` because pre-existing type errors in legacy files (`coderabbit.ts`, `users.ts`) would otherwise block all builds. The server still compiles successfully despite these warnings.

### Step 15 — Initialize Shared Caches

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

### Step 15.5 — Initialize Knowledge Base (Required for Platform-Specific AI Rules)

The knowledge base provides per-project AI rules and skills. It must be present in the source tree and is auto-copied on each project creation:

```bash
# The knowledge base ships with the source code at:
ls /root/AuroraCraft/opencode-knowledge/
# Rules:  rules/TEMPLATE_BASE.md + 10 platform fragments
# Skills: skills/*/SKILL.md (8 on-demand skill files)
```

**No manual initialization required** — the files are part of the repository. When a user sends their first AI message on a project, the backend automatically:
1. Reads `TEMPLATE_BASE.md`
2. Loads the correct fragments based on project type (e.g., `paper-api.md` + `maven-build.md` + `java-rules.md`)
3. Replaces placeholders (`{SOFTWARE}`, `{COMPILER}`, `{LANGUAGE}`, etc.)
4. Writes the final `AGENTS.md` + copies all 8 skills to the project's isolated HOME directory
5. OpenCode auto-discovers and loads them on startup

**Verify knowledge base integrity:**
```bash
find /root/AuroraCraft/opencode-knowledge -name "*.md" | wc -l  # Should show 22 files
```

### Step 15.6 — Initialize Graphify (Optional — "Save tokens using Graphify" feature)

Graphify is a Python CLI that builds a per-project code knowledge graph (no AI/token cost) which the AI agent queries to save tokens. It is **paid-only** and must be installed to a shared location accessible to all `auroracraft-*` users (like OpenCode/LiteLLM).

```bash
# Shared venv + global symlink (pinned to a validated version)
mkdir -p /var/lib/graphify/shared
python3 -m venv /var/lib/graphify/shared/venv
/var/lib/graphify/shared/venv/bin/pip install --upgrade pip
/var/lib/graphify/shared/venv/bin/pip install 'graphifyy==0.8.22'   # PyPI pkg is 'graphifyy'; CLI is 'graphify'
ln -sf /var/lib/graphify/shared/venv/bin/graphify /usr/local/bin/graphify
chmod -R 755 /var/lib/graphify/shared

# Verify (must work as a non-root auroracraft-* user)
/usr/local/bin/graphify --version          # graphify 0.8.22
runuser -l auroracraft-<someuser> -c '/usr/local/bin/graphify --version'

# End-to-end smoke test: a no-AI build must produce graph.json + graph.html at 0 token cost
runuser -l auroracraft-admin -c '
  mkdir -p ~/_gtest/src && printf "public class A { void f(){ new B().g(); } }\n" > ~/_gtest/src/A.java
  cd ~/_gtest && rm -rf graphify-out && unset GEMINI_API_KEY GOOGLE_API_KEY && /usr/local/bin/graphify update . --force
  ls graphify-out/graph.json graphify-out/graph.html && test ! -f graphify-out/cost.json && echo "GRAPHIFY OK (0 tokens)"
  rm -rf ~/_gtest'
```

**Notes:**
- **Requires `python3-venv`** (Step 1). If `python3 -m venv` errors, install it: `apt install -y python3-venv`.
- No per-user symlinks are needed — the graph is written into each project's workspace (`graphify-out/`), and the shared venv is read-only/global at `/usr/local/bin/graphify`.
- **Never set `GEMINI_API_KEY` / `GOOGLE_API_KEY`** in the server environment — those are the only keys Graphify reads, and their presence would switch on the paid LLM semantic pass. Builds must stay AST-only (0 tokens). Code-only plugin projects skip the LLM pass automatically.
- If `/usr/local/bin/graphify` is absent, the feature simply degrades: enabling Graphify sets status `failed`; everything else works.
- The graphify-navigation skill is written per-project to `~/.config/opencode/skills/graphify-navigation/` and is **never** merged into the platform `AGENTS.md` or the 8 Minecraft skills.

### Step 16 — Verify OpenCode Accessibility

Before starting the server, confirm OpenCode works as a non-root user:

```bash
su - auroracraft-admin -c "opencode --version"
```

If this fails with "command not found", the binary is not in a globally accessible path. Go back to Step 7 and fix the symlink.

### Step 17 — Start with PM2

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

### Step 18 — Auto-Start on Boot

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

### Step 19 — Verify Full Deployment

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
echo "13. Java, Maven & Gradle:"
java -version 2>&1 | head -1
mvn -version 2>&1 | head -1
gradle --version 2>&1 | head -1

echo ""
echo "14. AI agent sandbox:"
test -x /usr/local/bin/aurora-sandbox && echo "OK" || echo "MISSING"

echo ""
echo "15. Graphify (optional — Save tokens feature):"
if [ -x /usr/local/bin/graphify ]; then
  /usr/local/bin/graphify --version
  sudo -u postgres psql -d auroracraft -tc "SELECT 'graphify columns OK' FROM information_schema.columns WHERE table_name='projects' AND column_name='graphify_status';"
else
  echo "graphify not installed — feature disabled (non-fatal). See Step 15.6."
fi

echo ""
echo "All checks complete."
```

Expected: All green, 15 checks passed, all versions showing. (Check 15 is optional — Graphify is a paid-tier feature; a "not installed" result is non-fatal.)

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

### 4. Configure User Token Balances (Optional)

New users start with 0 AI tokens. To let users access premium models, administrators must grant tokens via the Admin Panel:

1. Go to **Admin Panel → Users**
2. Find the user in the list
3. Click **+Grant** next to the token balance column
4. Enter the number of tokens to grant (1 USD = 1000 tokens)

Administrators can also **-Deduct** tokens from any user. If the deduction amount exceeds the user's current balance, the operation is rejected with a clear error message.

**Note:** Free models (DeepSeek V4 Flash Free, Nemotron 3 Super Free) do not consume tokens and can be used without any token balance.

### 5. Set Up HTTPS / Reverse Proxy (Recommended for Production)

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

### 6. Firewall

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

#### Firecrawl Search MCP (Paid Users Only)

Firecrawl MCP provides web search, scraping, and crawling capabilities to the AI agent. It is a **paid-only feature** — admins must set a Firecrawl API key per user, and the user must be on the **paid tier**.

| Condition | Result |
|-----------|--------|
| Paid user + Firecrawl API key configured | ✅ MCP server auto-registered on OpenCode startup; AI can search the web |
| Paid user + no Firecrawl key | ❌ No search capability; normal code generation only |
| Free user | ❌ Cannot have Firecrawl key assigned; admin gets 403 error |
| Admin tries to downgrade paid→free while key exists | ❌ Blocked (HTTP 409) — must delete the Firecrawl key first |

**How it works:**
1. Admin adds `firecrawl:fc-xxx` key for a paid user in the Admin Panel → Users → API Keys
2. When the user sends any AI message, the backend checks their tier
3. If paid + key exists, the backend calls OpenCode's HTTP API (`POST /mcp`) to register `firecrawl-mcp` on the running instance
4. OpenCode connects to Firecrawl's MCP server, exposing 20+ tools (search, scrape, crawl, map, extract)
5. The AI agent can now invoke `firecrawl_search`, `firecrawl_scrape`, etc. during conversations
6. If the key is removed, the backend calls `POST /mcp/firecrawl/disconnect` to clean up

**Note:** Firecrawl MCP is **not** configured in `opencode.json` — it is registered dynamically via the OpenCode HTTP API after the instance starts. This prevents config validation errors (`Unrecognized key: mcpServers`).

### Dynamic Rules & Skills System

Every AuroraCraft project gets a custom `AGENTS.md` rule file and 8 skill files auto-generated based on the selected platform, compiler, and language.

#### How It Works

```
User sends first AI message on a project
    ↓
Backend reads project config (software, compiler, language, Java version)
    ↓
Loads TEMPLATE_BASE.md + relevant fragments:
    ├── paper-api.md (Paper/Purpur/Folia/Depran forks)
    ├── spigot-api.md (Spigot)
    ├── velocity-api.md (Velocity)
    ├── bungeecord-api.md (BungeeCord)
    ├── maven-build.md or gradle-build.md
    └── java-rules.md or kotlin-rules.md
    ↓
Replaces {SOFTWARE}, {COMPILER}, {LANGUAGE}, {API_RULES}, {BUILD_RULES}, {FOLIA_RULES}, etc.
    ↓
Writes to per-project isolated HOME:
    /var/lib/auroracraft/configs/{user}/{linkId}/.config/opencode/
    ├── AGENTS.md    (14 sections: API, Thread Safety, Build, Language, AI Error Stats, Architecture, etc.)
    └── skills/      (8 on-demand SKILL.md files)
        ├── database-setup/
        ├── event-handling/
        ├── command-framework/
        ├── config-management/
        ├── async-operations/
        ├── gui-inventory/
        ├── scheduler-tasks/
        └── paper-components/
    ↓
OpenCode auto-discovers and loads on startup via HOME directory
```

#### Knowledge Base Structure

```
opencode-knowledge/
├── rules/
│   ├── TEMPLATE_BASE.md         ← 14-section template with {PLACEHOLDERS}
│   └── fragments/
│       ├── paper-api.md         ← Paper/Paper-fork API rules
│       ├── folia-api.md         ← Folia regionized threading rules
│       ├── spigot-api.md        ← Spigot legacy ChatColor rules
│       ├── purpur-api.md        ← Purpur extension rules
│       ├── velocity-api.md      ← Velocity proxy API rules
│       ├── bungeecord-api.md    ← BungeeCord proxy API rules
│       ├── maven-build.md       ← Maven build system rules
│       ├── gradle-build.md      ← Gradle build system rules
│       ├── java-rules.md        ← Java 21 patterns (records, switch, text blocks)
│       └── kotlin-rules.md      ← Kotlin patterns (data classes, extensions, coroutines)
├── skills/                      (8 OpenCode-compatible SKILL.md files)
├── PLATFORM_RESEARCH.md         ← 18-platform comparison reference
└── IMPLEMENTATION_PLAN.md       ← Implementation roadmap
```

#### Per-Project Isolation

| Project A (Paper+Maven+Java) | Project B (Spigot+Gradle+Kotlin) |
|---|---|
| AGENTS.md: `paper \| maven \| java` | AGENTS.md: `spigot \| gradle \| kotlin` |
| Uses Paper API, Adventure Components | Uses Spigot API, legacy ChatColor |
| Maven `provided` scope, Shade plugin | Gradle `compileOnly`, Shadow plugin |
| Stored at `.../project-a/.config/opencode/` | Stored at `.../project-b/.config/opencode/` |

Rules regenerate on every message, so changing project settings (e.g., Paper→Folia) updates rules on the next AI message.

#### AI Error Prevention Statistics

The rules template includes a section with quantified AI mistake frequencies (sourced from analysis of real AI-generated plugins):

| Issue | Frequency |
|---|---|
| Synchronous DB queries blocking main thread | 78% |
| Unthrottled PlayerMoveEvent handlers | 64% |
| Excessive object allocation in hot paths | 52% |
| Missing caching mechanisms | 41% |
| Memory leaks from uncancelled tasks | 33% |

These statistics help the AI self-audit — it knows its own common mistakes and double-checks them.

### Token Pricing System

AuroraCraft uses a precise token-based pricing system with **per-provider pricing differentiation** and **cached-input discounts**.

**Pricing formula:**
```
$1 = 1000 tokens
TOKEN_MULTIPLIER = 1.2 (20% platform commission)

Cost($) = ((uncached_input / 1M × inputPer1M)
        + (cached_input / 1M × cachedInputPer1M)
        + (output / 1M × outputPer1M)) × 1.2
Tokens = ceil(Cost($) × 1000)
```

**Example — DeepSeek V4 Pro via Fireworks:**
| Token Type | Per-1M Price | Cached Price |
|-----------|--------------|--------------|
| Input | $1.74 | $0.145 |
| Output | $3.48 | — |

**Per-provider pricing:** The same model may have different prices on different providers:
| Model | Fireworks | Blueminds |
|-------|-----------|-----------|
| Kimi K2.6 | $0.95 / $4.00 | $0.28 / $0.154 |
| Qwen3.6 Plus | $0.50 / $3.00 | $1.20 / $2.88 |

**Free models** (DeepSeek V4 Flash Free, Nemotron 3 Super Free) consume **0 tokens**.

**Automatic reconciliation:** After each AI session completes, the system reconciles estimated vs actual token usage:
- **Refund:** If actual < estimated, the difference is refunded to the user's balance
- **Cap:** If actual > estimated, the user is charged at most 2× the estimate (prevents runaway costs)

**Admin token management:** Administrators can grant or deduct tokens from any user via the Admin Panel → Users page:
- **Grant tokens:** Click the **+Grant** button next to a user's balance to add tokens
- **Deduct tokens:** Click the **-Deduct** button to remove tokens. If the deduction amount exceeds the user's current balance, the operation is rejected with an error showing the available balance
- All token transactions (grants, deductions, pre-charges, refunds) are logged in the `token_transactions` table for audit purposes

**Token enforcement on message sending:**
- **Free models** (e.g., `opencode-deepseek-v4-flash-free`, `opencode-nemotron-3-super-free`) do not require tokens and can be used even with a 0 balance
- **Premium models** require a positive token balance. When a user attempts to send a message to a premium model with insufficient tokens, the server returns HTTP 402 with the estimated cost
- The token check happens after the provider API key validation, so missing API keys return 503 before the token check is reached

### Graphify Token Savings (Paid-Only)

Graphify converts a project's source code into a local knowledge graph the AI agent queries instead of re-reading files, saving input tokens. **Builds cost 0 AuroraCraft tokens** because plugin projects are code-only, so Graphify's structural (AST) extraction runs and its paid LLM semantic pass is skipped entirely.

**Lifecycle:**
1. A paid user clicks **"Save tokens using Graphify"** in the workspace (Scenario 1: after an AI build; Scenario 2: immediately after uploading a ZIP / cloning a repo — no first AI message required).
2. The backend runs, as the project's Linux user, `cd <workspace> && rm -rf graphify-out && graphify update . --force` — a **full rebuild** (not incremental), producing `graphify-out/graph.json` + `graph.html`.
3. A per-project **`graphify-navigation`** OpenCode skill is written so the agent runs `graphify query/path/explain/affected` (all local, 0 tokens).
4. When the OpenCode **session ends** (idle timeout), the graph is **deleted and fully rebuilt** so it always reflects the latest code.
5. **"View Graph"** renders the interactive graph as a web view inside the editor panel (opening `graphify-out/graph.html` from the file tree still shows raw HTML).
6. **"Remove Graphify"** deletes the artifacts + skill and turns the feature off.

**Tier transitions:** demoting a user paid→free removes Graphify artifacts + skill from all their projects but **preserves intent**, so promoting them back paid→free auto-rebuilds (lazily, on next workspace open). Free users never see the Graphify buttons.

**Isolation & no-merge:** the graph lives in the user-owned workspace; the `graphify-navigation` skill lives in the project's isolated `~/.config/opencode/skills/` **alongside** (never merged into) the platform `AGENTS.md` and 8 Minecraft skills. Command access is gated by **skill presence** — when Graphify is off, the skill is absent and the agent does not use it.

**Key files:** `server/src/utils/graphify-service.ts` (the only place that shells out to `graphify`), `server/src/routes/graphify.ts` (enable/remove/status/viewer endpoints), `client/src/components/graphify-controls.tsx` + `client/src/hooks/use-graphify.ts`, `opencode-knowledge/skills/graphify-navigation/SKILL.md`.

### AI Agent Sandbox

All AI-generated commands run through a sandboxed wrapper (`/usr/local/bin/aurora-sandbox`) that enforces security boundaries:

**Blocked commands:** `curl`, `wget`, `ssh`, `sudo`, `rm -rf /`, `eval`, `mount`, `docker`, and any command reading `/etc/passwd`, `/etc/shadow`, or `opencode.json`.

**Filesystem restriction:** The AI can only access files within the project directory, `/tmp`, and shared Maven/Gradle caches. Attempts to access files outside the project return `COMMAND_REJECTED`.

**Build tool restriction:** If a project is configured for Maven, `gradle` commands are blocked; if configured for Gradle, `mvn` commands are blocked.

**Java version isolation:** Projects can specify a target Java version (8, 11, 17, 21, or 25). The sandbox sets `JAVA_HOME` to the appropriate JDK before running commands.

### Model Selection Persistence

The workspace remembers your chosen AI model and speed per project across page refreshes:

- Selection is saved to `localStorage` under key `auroracraft:model:{projectId}`
- On page load, the saved model is validated against the project's bridge (Kiro vs OpenCode)
- If the saved model is incompatible (e.g., a Kiro model on an OpenCode project), it falls back to the default
- Each project has its own independent selection

### Shared Caches

| Cache | Location | Per-User Symlink |
|-------|----------|------------------|
| OpenCode plugins | `/var/lib/opencode/shared/node_modules` | `~/.config/opencode/shared/node_modules` |
| OpenCode manifest | `/var/lib/opencode/shared/package.json` | `~/.config/opencode/shared/package.json` |
| Gradle dependencies | `/var/lib/gradle/shared` | `~/.gradle/caches` |
| Maven artifacts | `/var/lib/maven/shared` | `~/.m2/repository` |
| Graphify CLI (Python venv) | `/var/lib/graphify/shared/venv` | global `/usr/local/bin/graphify` (no per-user symlink) |

When a new user registers, the server automatically creates these symlinks. Plugin downloads are shared across all users. The Graphify CLI is shared as a single global binary (like OpenCode/LiteLLM) — its per-project graphs are written into each project's own workspace, not shared.

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

### Firecrawl MCP not working / "Executable not found in $PATH: npx"

If OpenCode logs show:

```
ERROR service=mcp key=firecrawl command=["npx","-y","firecrawl-mcp"] error=Executable not found in $PATH: "npx"
```

**Root cause:** OpenCode spawns the MCP server as the Linux user (`auroracraft-{username}`), but `npx` was installed in `/root/.nvm` and is not accessible to other users.

**Fix:** Ensure `/root/.nvm` directories are traversable by all users, and reinstall npm if the `npx` symlink is broken:

```bash
# Make /root/.nvm traversable for other Linux users
chmod o+x /root /root/.nvm /root/.nvm/versions /root/.nvm/versions/node /root/.nvm/versions/node/v24.16.0 /root/.nvm/versions/node/v24.16.0/bin
chmod -R o+rx /root/.nvm/versions/node/v24.16.0/lib/node_modules

# Reinstall npm if npx symlink is corrupted
/root/.nvm/versions/node/v24.16.0/bin/node /root/.nvm/versions/node/v24.16.0/bin/npm install -g npm@11
```

Then restart:

```bash
./auroracraft.sh restart
```

### Firecrawl MCP shows "ConfigInvalidError: Unrecognized key: mcpServers"

**Root cause:** An older version of the code wrote `mcpServers` into `opencode.json`, which OpenCode's schema rejects.

**Fix:** The current code registers MCP servers via the OpenCode HTTP API (`POST /mcp`) instead of the config file. Clean any stale configs and restart:

```bash
# Remove stale mcpServers from all isolated configs
find /var/lib/auroracraft/configs -name "opencode.json" -exec \
  python3 -c "
import json, sys
for f in sys.argv[1:]:
    try:
        with open(f, 'r') as fh: d = json.load(fh)
        if 'mcpServers' in d:
            del d['mcpServers']
            with open(f, 'w') as fh: json.dump(d, fh, indent=2)
            print(f'Fixed: {f}')
    except: pass
" {} +

./auroracraft.sh restart
```

### Web search returns no results / AI says it cannot search

1. **Verify the user is on paid tier:** Free users cannot use Firecrawl MCP.
2. **Verify the Firecrawl key is set:** Admin Panel → Users → API Keys → should show `firecrawl: fc-xxx`.
3. **Check OpenCode logs for MCP connection:**
   ```bash
   sudo cat /var/lib/auroracraft/configs/auroracraft-{username}/{linkId}/.local/share/opencode/log/*.log | grep -i "firecrawl"
   ```
   Expected: `service=mcp key=firecrawl toolCount=20 create() successfully created client`
4. **Test the Firecrawl API key directly:**
   ```bash
   curl -H "Authorization: Bearer fc-YOUR_KEY" https://api.firecrawl.dev/v1/scrape -d '{"url":"https://example.com"}'
   ```

### Admin cannot downgrade user to free tier

If you see:

```
Cannot downgrade to free tier. User has paid-only API keys configured for: firecrawl. Delete these keys first.
```

This is by design. Firecrawl is a paid-only provider. Remove the Firecrawl key first:

1. Admin Panel → Users → click the user
2. API Keys → delete `firecrawl`
3. Then change tier to **free**

### Java compilation fails / "java: command not found"

The AI agent requires Java to compile plugins. If the AI reports that compilation is unavailable:

1. **Verify Java is installed:**
   ```bash
   java -version  # Should show OpenJDK 21
   ```

2. **Verify all Java versions are accessible to Linux users:**
   ```bash
   su - auroracraft-admin -c "java -version"
   ```

3. **Check that the sandbox is in PATH:**
   ```bash
   which aurora-sandbox  # Should show /usr/local/bin/aurora-sandbox
   ```

4. **Reinstall Java if missing:**
   ```bash
   apt install -y openjdk-21-jdk maven gradle
   ```

The system prompt explicitly instructs the AI to compile after writing code. If the AI still says compilation is unavailable, the `JAVA_HOME` or `MAVEN_OPTS` environment variables may not be set correctly in `opencode-process-manager.ts`.

### Token balance went negative / unexpected charges

**Check 1 — Was the model priced correctly?**
```bash
# Check actual pricing in ai-models.ts
grep -A5 "deepseek-v4-pro" /root/AuroraCraft/server/src/config/ai-models.ts
```

**Check 2 — Reconciliation log:**
Check server logs for "Reconciling tokens" — if actual usage was lower than estimated, a refund should have been issued automatically.

**Check 3 — Provider mismatch:**
If the frontend selected one provider but the backend used another, the pricing may differ. Verify `providerPricing` is set correctly in `ai-models.ts` for the model/provider combination.

### Model selection resets after page refresh

If the selected model reverts to default after refreshing the page:

1. **Check localStorage:** Open browser DevTools → Application → Local Storage → your domain
2. Look for keys starting with `auroracraft:model:`
3. If the key exists but the model is wrong, the validation may be rejecting it due to bridge mismatch (e.g., Kiro model on OpenCode project)
4. **Fix:** Select a model compatible with the project's bridge, then refresh

### AI says "I cannot compile" or "Compilation unavailable"

This should not happen with the current system prompt. If it does:

1. Restart the server to ensure the latest system prompt is loaded:
   ```bash
   ./auroracraft.sh restart
   ```

2. Check that Java is installed (see "Java compilation fails" above)

3. Verify the system prompt is being prepended to OpenCode prompts:
   ```bash
   grep "AGENT_SYSTEM_PROMPT" /root/AuroraCraft/server/src/bridges/opencode.ts
   ```

### Graphify: "View Graph" is blank / shows nothing

The bundled `graph.html` loads the `vis-network` library from `https://unpkg.com`. If the graph area is blank:

1. Confirm the server has internet access to `unpkg.com` (the viewer is client-side, but the browser must reach the CDN).
2. Confirm the viewer route sends a CSP that allows the CDN — it must include `https://unpkg.com` in `script-src`:
   ```bash
   curl -s -I -b cookies.txt "http://localhost:3000/api/projects/<id>/graphify/graph.html" | grep -i content-security-policy
   ```
3. Hard-refresh the browser (Ctrl+Shift+R) to pick up the latest client bundle.

### Graphify: enabling shows status "failed"

```bash
pm2 logs auroracraft-server --lines 50 | grep -i graphify
```

Common causes:
- **Empty project** — `graphify update .` prints "No code files found" and exits non-fatally if the project has no `.java`/`.kt` files yet. Add code (or run an AI build) first, then click **Retry graph**. This does not retry-loop.
- **`graphify` not installed / not global** — see Step 15.6; verify `runuser -l auroracraft-<user> -c '/usr/local/bin/graphify --version'`.
- **`python3-venv` missing at install time** — the shared venv was created incompletely. Re-run Step 15.6 after `apt install -y python3-venv`.

### Graphify: "graphify: command not found" for the AI agent

The binary must be globally accessible to every `auroracraft-*` user:

```bash
ls -la /usr/local/bin/graphify                 # must symlink to /var/lib/graphify/shared/venv/bin/graphify
chmod -R 755 /var/lib/graphify/shared          # all users need read+execute
runuser -l auroracraft-admin -c '/usr/local/bin/graphify --version'
```

The agent only ever runs the read-only subcommands (`query`, `path`, `explain`, `affected`), and only when a project's `graphify-out/graph.json` exists (the `graphify-navigation` skill is present only while Graphify is enabled).

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
│   │   ├── bridges/          # OpenCode bridge (SSE streaming) + MCP integration
│   │   ├── db/               # Database connection, schema, migrations, seed
│   │   ├── middleware/       # Authentication middleware
│   │   ├── plugins/          # Fastify plugins (CORS, cookies, WebSocket)
│   │   ├── routes/           # API routes (auth, projects, agents, admin, graphify)
│   │   ├── utils/            # Provider config, token service, MCP helpers
│   │   │   ├── graphify-service.ts    # Graphify build/remove/skill + lifecycle reconcilers
│   │   │   ├── opencode-mcp.ts        # OpenCode MCP HTTP API helpers (add/remove/list)
│   │   │   ├── provider-config.ts     # Per-project isolated config generation
│   │   │   └── token-service.ts       # Token balance & cost estimation
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

/var/lib/graphify/shared/venv # Shared Graphify CLI (Python venv) → /usr/local/bin/graphify
```

---

## License

MIT
