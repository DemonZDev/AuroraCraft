# Production Deployment Guide

## Ubuntu 25.10 Deployment

### Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Database Setup

```bash
# Create database and user
sudo -u postgres psql
CREATE DATABASE auroracraft;
CREATE USER auroracraft WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE auroracraft TO auroracraft;
\q
```

### Application Setup

```bash
# Clone repository
git clone https://github.com/your-org/auroracraft.git
cd auroracraft

# Backend setup
cd backend
npm ci --only=production
cp .env.example .env
# Edit .env with production values
npx prisma migrate deploy
npm run db:seed
npm run build

# Frontend setup
cd ../app
npm ci --only=production
npm run build
```

### Environment Variables

Create `/etc/auroracraft/env`:
```bash
DATABASE_URL="postgresql://auroracraft:password@localhost:5432/auroracraft"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"
NODE_ENV="production"
PORT=4000
CORS_ORIGIN="https://auroracraft.yourdomain.com"
```

### Systemd Services

**/etc/systemd/system/auroracraft-api.service**
```ini
[Unit]
Description=AuroraCraft API Server
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=auroracraft
WorkingDirectory=/opt/auroracraft/backend
EnvironmentFile=/etc/auroracraft/env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**/etc/systemd/system/auroracraft-frontend.service**
```ini
[Unit]
Description=AuroraCraft Frontend
After=network.target

[Service]
Type=simple
User=auroracraft
WorkingDirectory=/opt/auroracraft/app
Environment=PORT=3000
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable auroracraft-api auroracraft-frontend
sudo systemctl start auroracraft-api auroracraft-frontend
```

### Nginx Configuration

**/etc/nginx/sites-available/auroracraft**
```nginx
upstream api {
    server 127.0.0.1:4000;
}

upstream frontend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name auroracraft.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name auroracraft.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/auroracraft.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auroracraft.yourdomain.com/privkey.pem;

    # API routes
    location /api/ {
        proxy_pass http://api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }

    # SSE for streaming
    location /api/sessions/ {
        proxy_pass http://api/sessions/;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/auroracraft /etc/nginx/sites-enabled/
sudo certbot --nginx -d auroracraft.yourdomain.com
sudo systemctl reload nginx
```

---

## Windows Deployment

### Prerequisites

1. Install [Node.js 20 LTS](https://nodejs.org/)
2. Install [PostgreSQL 16](https://www.postgresql.org/download/windows/)
3. Install [Redis for Windows](https://github.com/microsoftarchive/redis/releases)

### Setup

```powershell
# Clone and setup
git clone https://github.com/your-org/auroracraft.git
cd auroracraft\backend

npm install
copy .env.example .env
# Edit .env with your settings

npx prisma migrate deploy
npm run db:seed
npm run build

cd ..\app
npm install
npm run build
```

### Windows Service (using node-windows)

```powershell
npm install -g node-windows

# Create service script: install-service.js
```

```javascript
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'AuroraCraft API',
  description: 'AuroraCraft Backend Server',
  script: 'C:\\auroracraft\\backend\\dist\\index.js',
  nodeOptions: [],
  env: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'PORT', value: '4000' },
  ]
});

svc.on('install', () => svc.start());
svc.install();
```

### IIS Reverse Proxy

1. Install URL Rewrite and ARR modules
2. Create site pointing to frontend build
3. Configure reverse proxy for `/api` to `localhost:4000`

---

## Security Checklist

- [ ] Generate strong JWT_SECRET (32+ bytes)
- [ ] Generate strong ENCRYPTION_KEY (64 hex chars)
- [ ] Use HTTPS everywhere
- [ ] Configure firewall (allow 80, 443 only)
- [ ] Set secure cookie options in production
- [ ] Enable rate limiting
- [ ] Regular database backups
- [ ] Monitor logs for errors
- [ ] Set up intrusion detection
- [ ] Regular security updates

## Adding Compile Worker

See [COMPILE_WORKER.md](./COMPILE_WORKER.md) for implementation guide.

### Quick Integration Steps

1. Create `infra/docker-compose.worker.yml`
2. Build worker Docker image
3. Configure Redis queue connection
4. Update `backend/src/routes/compile.ts` to push to queue
5. Deploy worker container with resource limits
