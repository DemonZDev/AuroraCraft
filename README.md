# AuroraCraft

An advanced agentic AI platform for creating Minecraft plugins with deep reasoning, code generation, and compilation.

## Features

- 🤖 **Agentic AI** - Multi-step reasoning, planning, and code generation
- 📝 **Monaco Editor** - Full-featured code editor with syntax highlighting
- 🔨 **Compilation** - Built-in Maven compilation with live logs
- 🎨 **Beautiful UI** - Modern dark theme, fully responsive
- 🔐 **Multi-Provider** - Support for Google, Anthropic, OpenRouter, and more
- 💰 **Token Economy** - Per-character billing with usage tracking

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Monaco Editor
- **Backend**: Node.js 20, Express, TypeScript, Prisma
- **Database**: PostgreSQL 15
- **Auth**: JWT with HttpOnly cookies

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Java 21 JDK
- Maven 3.9+

## Quick Start

### Using Docker (Recommended)

```bash
docker-compose up -d
```

### Manual Setup

1. **Install dependencies**
```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Setup database**
```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

4. **Start development servers**
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

5. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Default Admin Account

```
Username: admin
Email: admin@auroracraft.local
Password: Admin123!
```

## Project Structure

```
AuroraCraft/
├── frontend/          # Next.js application
├── backend/           # Express API server
├── docker-compose.yml # Docker setup
└── README.md          # This file
```

## License

MIT License
