# AuroraCraft Deployment Guide

## Quick Start (Local Development)

```bash
cd c:\Users\RDP\Desktop\AuroraCraft
npx -y serve . -p 3000
```
Open http://localhost:3000 in your browser.

---

## Windows Hosting (IIS)

1. **Enable IIS**: Control Panel → Programs → Turn Windows Features On/Off → Internet Information Services
2. **Create Site**: IIS Manager → Sites → Add Website
   - Site name: `AuroraCraft`
   - Physical path: `C:\inetpub\wwwroot\auroracraft`
   - Port: `80` or `443` (with SSL)
3. **Copy Files**: Copy entire `AuroraCraft` folder to `C:\inetpub\wwwroot\auroracraft`
4. **Configure MIME Types**: Add `.svg` → `image/svg+xml` if missing

---

## Ubuntu 25.10 (Nginx)

### Install Nginx

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
```

### Configure Site

```bash
sudo nano /etc/nginx/sites-available/auroracraft
```

Add configuration:

```nginx
server {
    listen 80;
    server_name auroracraft.xyz www.auroracraft.xyz;
    root /var/www/auroracraft;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Cache static assets
    location ~* \.(css|js|svg|png|jpg|jpeg|gif|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript image/svg+xml;
}
```

### Deploy

```bash
# Copy files
sudo mkdir -p /var/www/auroracraft
sudo cp -r /path/to/AuroraCraft/* /var/www/auroracraft/
sudo chown -R www-data:www-data /var/www/auroracraft

# Enable site
sudo ln -s /etc/nginx/sites-available/auroracraft /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d auroracraft.xyz -d www.auroracraft.xyz
```

---

## Docker Deployment

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t auroracraft .
docker run -d -p 80:80 auroracraft
```

---

## CDN Integration (Cloudflare)

1. Add domain to Cloudflare
2. Update nameservers
3. Enable: Auto Minify, Brotli, HTTP/3
4. Set SSL mode: Full (strict)
5. Add page rules for caching

---

## Integration with AuroraCraft Ecosystem

### Adding New Pages

Create new HTML files following the same structure. Shared components:
- Include same CSS files
- Include same JS files (creature will work on all pages)

### API Integration

Add API calls in `/js/api.js`:

```javascript
const API_BASE = 'https://api.auroracraft.xyz';

async function createProject(data) {
    const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}
```

### Authentication

Integrate with your auth system by adding:
- Login modal component
- JWT token handling
- Protected route redirects
