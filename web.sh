#!/bin/bash
set -e

echo "🚀 Starting AuroraCraft..."

# Setup Cloudflare tunnel
echo "🌐 Setting up Cloudflare tunnel..."
sudo cloudflared service uninstall 2>/dev/null || true
sudo cloudflared service install eyJhIjoiOWNiYTJmOWFiY2ZhMzA2NTExNWUyZThlMTUxYjNhZmQiLCJ0IjoiNTQ5M2FkOTgtNjViNC00NzI0LWEzYTQtZjVkMzY1N2QyMWRkIiwicyI6Ik1EUTRPRFJrTldFdE9XUm1aQzAwTldReUxXRmtOelV0WWpVM09UY3daR0ptTVdVNSJ9

sleep 2
