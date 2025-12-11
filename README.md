# AuroraCraft

An advanced agentic AI platform for creating Minecraft plugins with deep reasoning, code generation, and compilation.

![AuroraCraft Dashboard](https://img.shields.io/badge/Status-Active-brightgreen) ![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue)

## Features

- 🤖 **Agentic AI** - Multi-step reasoning, planning, and code generation
- 📝 **Monaco Editor** - Full-featured code editor with syntax highlighting
- 🔨 **Compilation** - Built-in Maven compilation with live logs
- 🎨 **Beautiful UI** - Modern dark theme, fully responsive
- 🔐 **Multi-Provider** - Support for Google, OpenRouter, Perplexity, SamuraiAPI, and more
- 💰 **Token Economy** - Per-character billing with usage tracking
- 📁 **File Management** - Create, edit, rename, and delete files through AI
- 🧠 **Memory** - Persistent session memory for contextual conversations

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Monaco Editor
- **Backend**: Node.js 20, Express, TypeScript, Prisma
- **Database**: PostgreSQL 15+
- **Auth**: JWT with HttpOnly cookies

## Prerequisites

### Ubuntu 22.04 / 24.04 Server Setup

Install the required dependencies:

```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Java 21 JDK (for plugin compilation)
sudo apt install -y openjdk-21-jdk

# Install Maven (for plugin compilation)
sudo apt install -y maven

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Verify installations
node --version    # Should show v20.x.x
npm --version     # Should show 10.x.x
java --version    # Should show openjdk 21.x.x
mvn --version     # Should show Apache Maven 3.x.x
```

## Quick Start

### Option 1: Manual Setup (Recommended for development)

#### 1. Clone the repository

```bash
git clone https://github.com/yourusername/AuroraCraft.git
cd AuroraCraft
```

#### 2. Configure environment

```bash
# Copy example environment file
cp .env.example .env

# Edit the .env file with your configuration
nano .env
```

The `.env` file should contain:

```env
# Database
DATABASE_URL="postgresql://auroracraft:auroracraft@localhost:5432/auroracraft?schema=public"

# JWT
JWT_SECRET="your-secure-jwt-secret-change-this"
JWT_EXPIRES_IN="7d"

# Server
BACKEND_PORT=3001
FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"

# Default Admin (created on first startup)
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_EMAIL="admin@auroracraft.local"
DEFAULT_ADMIN_PASSWORD="Admin123!"

# Compilation
MAVEN_HOME="/usr/share/maven"
JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
COMPILE_TIMEOUT_MS=300000

# File Storage
STORAGE_PATH="./storage"
MAX_FILE_SIZE_MB=50
```

#### 3. Setup PostgreSQL Database

```bash
# Create database user and database
sudo -u postgres psql -c "CREATE USER auroracraft WITH PASSWORD 'auroracraft' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE auroracraft OWNER auroracraft;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE auroracraft TO auroracraft;"
```

#### 4. Install dependencies and setup backend

```bash
# Navigate to backend directory
cd backend

# Copy .env file
cp ../.env .env

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Seed the database (creates admin user and sample providers)
npx tsx prisma/seed.ts

# Go back to root
cd ..
```

#### 5. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

#### 6. Start the development servers

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm run dev
```

#### 7. Access the application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

### Option 2: Docker Setup

```bash
# Start all services with Docker Compose
docker-compose up -d
```

> **Note**: Docker may have overlay filesystem issues on some systems. If you encounter errors, use the manual setup instead.

## Default Admin Account

```
Username: admin
Email: admin@auroracraft.local
Password: Admin123!
```

## Configuring AI Providers

AuroraCraft supports multiple AI providers. Configure them via the Admin Panel or edit the seed file.

### Available Providers

| Provider | Base URL | Auth Type | Free Tier |
|----------|----------|-----------|-----------|
| OpenRouter | `https://openrouter.ai/api/v1` | Bearer | Yes (selected models) |
| Google | `https://generativelanguage.googleapis.com/v1beta` | Bearer | Yes (with limits) |
| Perplexity | `https://api.perplexity.ai` | Bearer | No (paid) |
| SamuraiAPI | `https://inference.samaira.ai/openai/v1` | Bearer | Yes |

### Recommended Free Models

| Provider | Model ID | Description |
|----------|----------|-------------|
| OpenRouter | `moonshotai/kimi-k2:free` | Kimi K2 - Great for coding |
| OpenRouter | `qwen/qwen3-coder:free` | Qwen3 Coder - Specialized for code |
| OpenRouter | `google/gemini-2.0-flash-exp:free` | Gemini 2.0 Flash |
| Google | `gemini-2.5-flash` | Gemini 2.5 Flash (native) |
| SamuraiAPI | `free/claude-3-7-sonnet` | Claude 3.7 Sonnet |
| SamuraiAPI | `free/gemini-2.5-pro` | Gemini 2.5 Pro |

### Adding Providers via Admin Panel

1. Login as admin
2. Navigate to Admin Panel (top right menu)
3. Go to "Providers" section
4. Click "Add Provider" and fill in:
   - Name: Provider name
   - Base URL: API endpoint
   - Auth Type: Usually "Bearer"
   - API Key: Your API key
5. Add models for the provider

## Project Structure

```
AuroraCraft/
├── frontend/              # Next.js application
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── lib/           # API client & stores
│   │   └── styles/        # CSS files
│   └── package.json
├── backend/               # Express API server
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Auth, error handling
│   │   └── config/        # Configuration
│   ├── prisma/            # Database schema & migrations
│   └── package.json
├── docker-compose.yml     # Docker setup
├── .env                   # Environment variables
└── README.md              # This file
```

## Troubleshooting

### "Failed to fetch" error on login (mobile/remote access)

This is typically a CORS issue. The backend is configured to allow:
- localhost and 127.0.0.1
- Local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)

For production, update the CORS configuration in `backend/src/index.ts` to include your domain.

### Database connection errors

1. Ensure PostgreSQL is running:
   ```bash
   sudo systemctl status postgresql
   ```

2. Verify database exists:
   ```bash
   sudo -u postgres psql -c "\l" | grep auroracraft
   ```

3. Check DATABASE_URL in your `.env` file

### Prisma migration errors

```bash
cd backend

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Re-run migrations
npx prisma migrate dev
```

### Port already in use

```bash
# Find and kill process on port 3001 (backend)
sudo lsof -i :3001
kill -9 <PID>

# Find and kill process on port 3000 (frontend)
sudo lsof -i :3000
kill -9 <PID>
```

### AI model not responding

1. Check if the provider API key is configured
2. Verify the model is enabled in Admin Panel
3. Check backend logs for API errors:
   ```bash
   # View backend console output for errors
   ```

## API Documentation

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/auth/logout` | POST | Logout user |
| `/api/auth/me` | GET | Get current user |

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List user sessions |
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id` | DELETE | Delete session |

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/models` | GET | List available AI models |
| `/api/chat/:sessionId/message` | POST | Send message (streaming) |
| `/api/chat/:sessionId/history` | GET | Get chat history |

### Files

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/:sessionId` | GET | Get file tree |
| `/api/files/:sessionId` | POST | Create file |
| `/api/files/:sessionId/file` | GET | Get file content |
| `/api/files/:sessionId/file` | PUT | Update file |
| `/api/files/:sessionId/file` | DELETE | Delete file |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License
