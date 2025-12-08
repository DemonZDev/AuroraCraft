# AuroraCraft - Deployment Guide

## Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Run Locally
```bash
cd app
npm install
npm run dev
```
Open http://localhost:3000

## Production Build

```bash
npm run build
npm start
```

## Ubuntu 25.10 Deployment

### Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Clone & Build
```bash
git clone https://github.com/your-repo/auroracraft.git
cd auroracraft/app
npm install
npm run build
```

### PM2 Process Manager
```bash
sudo npm install -g pm2
pm2 start npm --name "auroracraft" -- start
pm2 startup
pm2 save
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name auroracraft.xyz;

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

### SSL with Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d auroracraft.xyz
```

## Windows Deployment

### IIS Setup
1. Install URL Rewrite module
2. Install iisnode
3. Configure web.config:
```xml
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="NextJS">
          <match url="/*" />
          <action type="Rewrite" url="server.js"/>
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

## Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t auroracraft .
docker run -p 3000:3000 auroracraft
```

## Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=https://api.auroracraft.xyz
NEXT_PUBLIC_SITE_URL=https://auroracraft.xyz
```

## File Structure

```
app/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── page.tsx         # Homepage
│   │   ├── login/           # Login page
│   │   ├── register/        # Register page
│   │   ├── dashboard/       # User dashboard
│   │   └── project/[id]/    # AI project interface
│   ├── components/          # React components
│   │   ├── ui/              # Reusable UI (Button, Input, Card)
│   │   ├── layout/          # Navbar, Footer
│   │   ├── home/            # Homepage sections
│   │   └── project/         # Project interface components
│   └── context/             # React Context providers
│       ├── AuthContext.tsx  # Authentication state
│       └── ProjectContext.tsx # Project/file state
├── public/                  # Static assets
└── package.json
```
