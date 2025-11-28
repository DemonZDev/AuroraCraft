# AuroraCraft - Complete Setup Guide

## Table of Contents
1. [Local Development Setup](#local-development-setup)
2. [Docker Compose Deployment](#docker-compose-deployment)
3. [Production Deployment](#production-deployment)
4. [Verification & Testing](#verification--testing)
5. [Troubleshooting](#troubleshooting)

---

## Local Development Setup

### Prerequisites

Install the following on your machine:

- **Docker** 20.10+ and Docker Compose 2.0+
- **Node.js** 20+ and Yarn 1.22+
- **Python** 3.11+
- **PostgreSQL** 15+ (or use Docker)
- **Redis** 7+ (or use Docker)

### Step 1: Clone and Configure

```bash
# Navigate to project directory
cd /app

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
```

**Required environment variables:**
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/auroracraft
REDIS_URL=redis://localhost:6379
JWT_SECRET_KEY=<generate-random-secret>
ENCRYPTION_SECRET=<generate-random-secret>
OPENROUTER_API_KEY=sk-or-v1-...
GOOGLE_API_KEY=AIzaSy...
REACT_APP_BACKEND_URL=http://localhost:8001
```

**Generate secrets:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 2: Database Setup

**Option A: Docker (Recommended)**
```bash
docker-compose up -d postgres redis
```

**Option B: Local Installation**
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Install Redis
sudo apt-get install redis-server

# Create database
sudo -u postgres psql -c "CREATE DATABASE auroracraft;"
```

### Step 3: Backend Setup

```bash
cd /app/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations and seed data
python seed_data.py

# Start backend server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Backend should now be running at:** http://localhost:8001

### Step 4: Worker Setup

In a **new terminal**:

```bash
cd /app/backend
source venv/bin/activate

# Pull Maven Docker image for compilation
docker pull maven:3.9-eclipse-temurin-21

# Start worker
python compile_worker.py
```

### Step 5: Frontend Setup

In a **new terminal**:

```bash
cd /app/frontend

# Install dependencies
yarn install

# Start development server
yarn start
```

**Frontend should open automatically at:** http://localhost:3000

### Step 6: Access the Application

1. Open browser: http://localhost:3000
2. Login with default admin:
   - Email: `admin@auroracraft.local`
   - Password: `Admin123!`
3. Create a new project and start building!

---

## Docker Compose Deployment

### Quick Start (Recommended)

```bash
cd /app

# Copy and configure environment
cp .env.example .env
nano .env  # Add your API keys

# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

### Services Overview

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React UI (Nginx) |
| Backend | 8001 | FastAPI server |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache & queue |
| Worker | - | Compile worker |

### Verify Services

```bash
# Check all services are running
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f worker
docker-compose logs -f frontend

# Check health
curl http://localhost:8001/api/
curl http://localhost:3000/health
```

### Docker Commands

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (CAUTION: deletes data)
docker-compose down -v

# Restart specific service
docker-compose restart backend

# View service logs
docker-compose logs -f [service-name]

# Execute command in container
docker-compose exec backend python seed_data.py

# Rebuild specific service
docker-compose build backend
docker-compose up -d backend
```

---

## Production Deployment

### Option 1: VPS/Cloud Server (AWS, DigitalOcean, etc.)

#### 1. Server Setup

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login for group changes
```

#### 2. Deploy Application

```bash
# Clone repository
git clone <your-repo-url> /opt/auroracraft
cd /opt/auroracraft

# Configure production environment
cp .env.example .env
nano .env

# Set production secrets
export JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
export ENCRYPTION_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Update .env with production values
sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$JWT_SECRET_KEY|" .env
sed -i "s|ENCRYPTION_SECRET=.*|ENCRYPTION_SECRET=$ENCRYPTION_SECRET|" .env
sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://yourdomain.com|" .env
sed -i "s|REACT_APP_BACKEND_URL=.*|REACT_APP_BACKEND_URL=https://api.yourdomain.com|" .env

# Start services
docker-compose up -d --build
```

#### 3. Setup Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt-get install nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/auroracraft
```

**Nginx configuration:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL certificates (will be configured by certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Backend API
    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable and configure:**

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/auroracraft /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com

# Restart Nginx
sudo systemctl restart nginx
```

#### 4. Setup Systemd Service (Optional)

```bash
sudo nano /etc/systemd/system/auroracraft.service
```

```ini
[Unit]
Description=AuroraCraft Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/auroracraft
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable auroracraft
sudo systemctl start auroracraft

# Check status
sudo systemctl status auroracraft
```

### Option 2: Kubernetes Deployment

Refer to `/app/k8s/` directory for Kubernetes manifests (create if needed).

---

## Verification & Testing

### 1. Health Checks

```bash
# Backend health
curl http://localhost:8001/api/
# Expected: {"message":"AuroraCraft API","version":"1.0.0","status":"operational"}

# Database connection
docker-compose exec backend python -c "from database import init_db; import asyncio; asyncio.run(init_db()); print('DB OK')"

# Redis connection
redis-cli ping
# Expected: PONG
```

### 2. API Testing

```bash
# Register user
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "confirm_password": "password123"
  }'

# Login
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@auroracraft.local",
    "password": "Admin123!"
  }'

# Save token from response
export TOKEN="<access_token>"

# Create session
curl -X POST http://localhost:8001/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Plugin",
    "target_software": "Paper",
    "target_version": "1.21"
  }'

# List available models
curl -X GET http://localhost:8001/api/llm/models \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Compile Test

```bash
# Create a test session with pom.xml and Java files
# Then trigger compile:
curl -X POST http://localhost:8001/api/sessions/{session-id}/compile \
  -H "Authorization: Bearer $TOKEN"

# Check compile status
curl -X GET http://localhost:8001/api/sessions/{session-id}/compile \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Frontend Testing

1. Open http://localhost:3000
2. Login with admin credentials
3. Create a new project
4. Verify chat interface loads
5. Switch to Code tab
6. Create a file and save
7. Trigger compilation

---

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# 1. Database connection
docker-compose exec postgres psql -U postgres -c "SELECT 1;"

# 2. Port already in use
sudo lsof -i :8001
# Kill process: sudo kill -9 <PID>

# 3. Missing dependencies
docker-compose exec backend pip install -r requirements.txt
```

### Worker Not Processing Jobs

```bash
# Check worker logs
docker-compose logs worker

# Verify Redis connection
docker-compose exec worker python -c "import redis; r=redis.from_url('redis://redis:6379'); print(r.ping())"

# Check Docker socket access
docker-compose exec worker docker ps

# Restart worker
docker-compose restart worker
```

### Compilation Fails

```bash
# Pull Maven image
docker pull maven:3.9-eclipse-temurin-21

# Test Docker access from worker
docker-compose exec worker docker run --rm maven:3.9-eclipse-temurin-21 mvn --version

# Check workspace permissions
ls -la /app/workspaces/
sudo chmod -R 755 /app/workspaces/
```

### Database Migration Issues

```bash
# Reset database (CAUTION: destroys data)
docker-compose down -v
docker-compose up -d postgres
sleep 5
docker-compose up -d backend

# Manual migration
docker-compose exec backend python seed_data.py
```

### Frontend Build Errors

```bash
# Clear cache and rebuild
cd /app/frontend
rm -rf node_modules yarn.lock
yarn install
yarn build

# Docker rebuild
docker-compose build --no-cache frontend
docker-compose up -d frontend
```

### Port Conflicts

```bash
# Check what's using ports
sudo lsof -i :3000  # Frontend
sudo lsof -i :8001  # Backend
sudo lsof -i :5432  # PostgreSQL
sudo lsof -i :6379  # Redis

# Change ports in docker-compose.yml if needed
```

### SSL Certificate Issues (Production)

```bash
# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
```

---

## Backup and Restore

### Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres auroracraft > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup workspaces
tar -czf workspaces_backup_$(date +%Y%m%d_%H%M%S).tar.gz /app/workspaces/
```

### Restore Database

```bash
# Restore from backup
docker-compose exec -T postgres psql -U postgres auroracraft < backup_20241118_120000.sql

# Restore workspaces
tar -xzf workspaces_backup_20241118_120000.tar.gz -C /
```

---

## Monitoring

### System Resources

```bash
# Container stats
docker stats

# Service resource usage
docker-compose top

# Disk usage
df -h /app/workspaces/
du -sh /app/workspaces/*
```

### Logs

```bash
# Follow all logs
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Export logs
docker-compose logs > auroracraft_logs_$(date +%Y%m%d).log
```

---

## Security Checklist

- [ ] Change default JWT_SECRET_KEY
- [ ] Change default ENCRYPTION_SECRET
- [ ] Change admin password on first login
- [ ] Configure CORS_ORIGINS to specific domains
- [ ] Enable HTTPS with SSL certificates
- [ ] Set up firewall rules (UFW/iptables)
- [ ] Regular database backups
- [ ] Monitor API rate limits
- [ ] Review Docker container privileges
- [ ] Enable Docker user namespace remapping
- [ ] Set up log rotation
- [ ] Configure Redis password authentication
- [ ] Restrict PostgreSQL connections

---

## Need Help?

- **Documentation**: `/app/README.md`
- **API Docs**: http://localhost:8001/docs (Swagger UI)
- **Issues**: Open GitHub issue
- **Support**: support@auroracraft.dev

---

**Congratulations! AuroraCraft is now running. Start building amazing Minecraft plugins with AI! 🚀**
