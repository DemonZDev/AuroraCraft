# AuroraCraft - Agentic Minecraft Plugin Development Platform

**Production-ready AI-powered platform for creating, editing, testing, and compiling Minecraft plugins.**

AuroraCraft is a full-stack agentic platform that enables developers (from beginners to professionals) to build complete Minecraft plugins for Paper/Bukkit/Spigot/Purpur/Folia/Velocity/BungeeCord using Java 21 + Maven, with multi-model AI assistance, secure Docker compilation, and comprehensive workspace management.

---

## Features

### Core Capabilities
- **Agentic AI Engine**: Multi-phase planning, execution, and verification with user approval gates
- **Multi-Provider LLM Support**: OpenRouter, Google AI, SamuraiAPI with pluggable adapter architecture
- **Secure Compilation**: Dockerized Maven builds with Java 21, resource limits, and no network egress
- **Session-Based Workspaces**: Isolated file systems with persistent memory and checkpoints
- **Monaco Code Editor**: Full-featured editor with syntax highlighting and diff view
- **Token Accounting**: Per-character cost tracking with provider/model management
- **Admin Control Panel**: Provider/model configuration, API key management, token pricing
- **Compile-Fix Workflow**: Automatic error detection and iterative fixing with AI assistance

### Security
- JWT authentication with HttpOnly cookies
- Encrypted provider credentials at rest
- Path traversal protection
- Sandboxed Docker compilation (no network, resource-limited)
- Input validation and sanitization

---

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 14+ with SQLAlchemy async ORM
- **Cache/Queue**: Redis + arq for background jobs
- **LLM Integration**: Multi-provider adapter (OpenRouter, Google AI)
- **Security**: JWT, bcrypt, Fernet encryption

### Frontend
- **Framework**: React 19 with functional components
- **UI Library**: Shadcn UI + Tailwind CSS
- **Editor**: Monaco Editor (@monaco-editor/react)
- **State**: React hooks + axios
- **Routing**: React Router v6

### Worker
- **Queue**: arq (async task queue)
- **Compilation**: Docker (Maven 3.9 + OpenJDK 21)
- **Isolation**: Unprivileged containers, network disabled

---

## Prerequisites

- **Docker** 20.10+ (for compilation engine)
- **PostgreSQL** 14+
- **Redis** 6+
- **Python** 3.11+
- **Node.js** 20+
- **Yarn** 1.22+

---

## Quick Start

### 1. Environment Setup

Create `.env` file in `/app/backend/`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/auroracraft
REDIS_URL=redis://localhost:6379
JWT_SECRET_KEY=your-secret-key-change-in-production
ENCRYPTION_SECRET=your-encryption-secret-change-in-production
CORS_ORIGINS=*

# API Keys (provided or your own)
OPENROUTER_API_KEY=sk-or-v1-your-key
GOOGLE_API_KEY=your-google-key
```

### 2. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE auroracraft;"

# Run migrations (automatic on first start)
cd /app/backend
python -c "from database import init_db; import asyncio; asyncio.run(init_db())"

# Seed admin user and providers
python seed_data.py
```

### 3. Backend Setup

```bash
cd /app/backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 4. Worker Setup

```bash
cd /app/backend
python compile_worker.py
```

### 5. Frontend Setup

```bash
cd /app/frontend
yarn install
yarn start
```

### 6. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001/api
- **Default Admin**:
  - Email: `admin@auroracraft.local`
  - Password: `Admin123!`

---

## API Documentation

### Authentication Endpoints

**POST** `/api/auth/register`
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "confirm_password": "password123"
}
```

**POST** `/api/auth/login`
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**GET** `/api/auth/me` (requires auth)

### Session Endpoints

**POST** `/api/sessions` (create)
```json
{
  "title": "My Plugin",
  "target_software": "Paper",
  "target_version": "1.21"
}
```

**GET** `/api/sessions` (list all)

**GET** `/api/sessions/{id}` (get single)

**PATCH** `/api/sessions/{id}` (update)

**DELETE** `/api/sessions/{id}` (delete)

### File Endpoints

**GET** `/api/sessions/{id}/files` (list files)

**GET** `/api/sessions/{id}/files/{path}` (read file)

**PUT** `/api/sessions/{id}/files/{path}` (write file)
```json
{
  "path": "src/main/java/Main.java",
  "content": "...",
  "author": "user"
}
```

**DELETE** `/api/sessions/{id}/files/{path}` (delete file)

**POST** `/api/sessions/{id}/files/upload-zip` (upload zip)

**POST** `/api/sessions/{id}/files/download-zip` (download zip)

### Compilation Endpoints

**POST** `/api/sessions/{id}/compile` (start compile)

**GET** `/api/sessions/{id}/compile` (compile history)

**GET** `/api/sessions/{id}/compile/{job_id}` (job status)

**GET** `/api/sessions/{id}/compile/{job_id}/logs` (logs)

### LLM Endpoints

**POST** `/api/llm/call`
```json
{
  "session_id": "uuid",
  "model_id": 1,
  "prompt": "Create a /home command",
  "system_prompt": "You are a Minecraft plugin developer",
  "temperature": 0.7,
  "max_tokens": 4000
}
```

**GET** `/api/llm/models` (available models)

### Admin Endpoints (admin role required)

**POST** `/api/admin/providers` (create provider)

**GET** `/api/admin/providers` (list providers)

**PATCH** `/api/admin/providers/{id}` (update provider)

**POST** `/api/admin/providers/{id}/test` (test provider)

**POST** `/api/admin/models` (create model)

**GET** `/api/admin/models` (list models)

**PATCH** `/api/admin/models/{id}` (update model)

---

## Architecture

### Database Schema

```
users (id, username, email, password_hash, role, token_balance)
sessions (id, owner_id, title, target_software, target_version, selected_model_id)
files (id, session_id, path, size, checksum, last_modified_by)
checkpoints (id, session_id, name, file_paths[], diff_blob)
plans (id, session_id, plan_json, current_phase_index)
memory_entries (id, session_id, key, value, type)
providers (id, provider_id, display_name, base_url, auth_type, credentials_encrypted)
models (id, provider_id, model_id, display_name, default_params, per_char_cost)
token_transactions (id, user_id, session_id, provider_id, model_id, total_chars, calculated_cost)
compile_jobs (id, session_id, status, log_path, artifact_path)
logs (id, session_id, user_id, type, payload_json)
```

### Workspace Structure

```
/app/workspaces/
  {session-id}/
    src/
      main/
        java/
        resources/
    pom.xml
    target/
      {plugin}.jar
    .trash/
    compile.log
```

---

## Compilation Engine

The secure Docker compilation engine:

1. **Isolation**: Each compile runs in ephemeral Docker container
2. **Resources**: Limited to 2 CPU cores, 2GB RAM
3. **Network**: Disabled (or Maven Central only)
4. **User**: Runs as unprivileged user (UID 1000)
5. **Timeout**: 5 minutes max
6. **Logging**: Real-time streaming to session

---

## Testing Scenarios

### Scenario A: New Plugin /home & /sethome

```bash
curl -X POST $API/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Home Plugin","target_software":"Paper"}'

# Agent generates scaffold, verifies, user approves, compiles
```

### Scenario B: Import ZIP (Modernization)

```bash
curl -X POST $API/sessions/{id}/files/upload-zip \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@old-plugin.zip"

# Agent modernizes to Java 21, user approves, compiles
```

### Scenario C: Compile Error → Fix Loop

```bash
# Compile fails
curl -X POST $API/sessions/{id}/compile

# Agent proposes fixes
# User applies fixes
# Recompile succeeds
```

---

## Security Considerations

1. **Provider Credentials**: Encrypted with Fernet (AES-256)
2. **JWT Tokens**: Signed, 7-day expiry
3. **Path Validation**: All file operations check for traversal
4. **Docker Sandbox**: No host access, resource-limited
5. **API Keys**: Never exposed to client

---

## Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials in .env
```

### Redis Connection Failed
```bash
# Check Redis is running
redis-cli ping
```

### Compile Worker Not Processing Jobs
```bash
# Restart worker
pkill -f compile_worker
python /app/backend/compile_worker.py &
```

### Docker Compilation Fails
```bash
# Pull Maven image
docker pull maven:3.9-eclipse-temurin-21

# Test Docker
docker run --rm maven:3.9-eclipse-temurin-21 mvn --version
```

---

## Production Deployment

### Environment Variables (Production)

```env
DATABASE_URL=postgresql+asyncpg://user:pass@prod-db:5432/auroracraft
REDIS_URL=redis://:password@prod-redis:6379
JWT_SECRET_KEY=<generate-strong-secret>
ENCRYPTION_SECRET=<generate-strong-secret>
CORS_ORIGINS=https://yourdomain.com
```

### Systemd Service (Backend)

```ini
[Unit]
Description=AuroraCraft API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=auroracraft
WorkingDirectory=/app/backend
Environment="PATH=/usr/local/bin:/usr/bin"
ExecStart=/usr/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name auroracraft.example.com;

    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location / {
        root /app/frontend/build;
        try_files $uri /index.html;
    }
}
```

---

## Contributing

This project follows the mission of production-ready agentic platforms. Key areas for contribution:

1. Additional LLM provider adapters
2. Enhanced verification algorithms
3. More compile target support (Kotlin, Gradle)
4. Real-time collaboration features
5. Advanced memory search/indexing

---

## License

MIT License - See LICENSE file

---

## Support

For issues or questions:
- Open a GitHub issue
- Email: support@auroracraft.dev

---

**Built with Emergent.sh - AI-Powered Development Platform**
