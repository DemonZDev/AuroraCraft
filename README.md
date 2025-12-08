# AuroraCraft

AI-powered Minecraft plugin development platform.

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Development Setup

1. **Clone and install:**
```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials

# Frontend
cd ../app
npm install
```

2. **Setup database:**
```bash
cd backend
npx prisma migrate dev
npm run db:seed
```

3. **Start servers:**
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd app
npm run dev
```

4. **Access:**
- Frontend: http://localhost:3000
- API: http://localhost:4000
- API Docs: http://localhost:4000/docs

### Default Admin
- Email: `admin@auroracraft.local`
- Password: `Admin123!`

## Docker Setup

```bash
cd infra
docker-compose up -d
```

## Project Structure

```
├── app/                 # Next.js frontend
├── backend/             # Fastify API server
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── lib/         # Utilities
│   │   └── index.ts     # Entry point
│   ├── prisma/          # Database schema
│   └── docs/            # API documentation
├── infra/               # Docker & deployment
└── docs/                # Project documentation
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /auth/register` | Register new user |
| `POST /auth/login` | Login |
| `GET /sessions` | List projects |
| `POST /sessions/:id/chat` | Send message (SSE) |
| `PUT /sessions/:id/files/*` | Write file |
| `POST /sessions/:id/compile` | Start build |

See `/docs` endpoint for full OpenAPI spec.

## Configuration

Key environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `JWT_SECRET` | Auth secret (change in prod) |
| `ENCRYPTION_KEY` | 64-char hex for credentials |

## Production Deployment

See [backend/docs/DEPLOYMENT.md](backend/docs/DEPLOYMENT.md)

## License

MIT
