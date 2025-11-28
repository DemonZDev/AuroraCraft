#!/bin/bash
set -e

echo "===================================="
echo "  AuroraCraft Platform Launcher"
echo "====================================\n"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed\n"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template...\n"
    cp .env.example .env
    echo "📝 Please edit .env file with your configuration:"
    echo "   - Add your OpenRouter API key"
    echo "   - Add your Google API key"
    echo "   - Generate secure JWT_SECRET_KEY and ENCRYPTION_SECRET\n"
    echo "Press Enter to open .env in nano editor, or Ctrl+C to exit and edit manually..."
    read
    nano .env
fi

echo "🔍 Checking configuration...\n"

# Validate required environment variables
source .env

if [ -z "$OPENROUTER_API_KEY" ] || [ "$OPENROUTER_API_KEY" = "your-key-here" ]; then
    echo "⚠️  OPENROUTER_API_KEY not set in .env"
fi

if [ -z "$GOOGLE_API_KEY" ] || [ "$GOOGLE_API_KEY" = "your-key-here" ]; then
    echo "⚠️  GOOGLE_API_KEY not set in .env"
fi

echo "\n🚀 Starting AuroraCraft Platform...\n"

# Pull required Docker images
echo "📥 Pulling Docker images..."
docker pull maven:3.9-eclipse-temurin-21

# Start services
echo "\n🔧 Building and starting services..."
docker-compose up -d --build

echo "\n⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "\n🔍 Checking service health...\n"

if docker-compose ps | grep -q "postgres.*Up"; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL failed to start"
fi

if docker-compose ps | grep -q "redis.*Up"; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
fi

if docker-compose ps | grep -q "backend.*Up"; then
    echo "✅ Backend API is running"
else
    echo "❌ Backend failed to start"
    echo "   Check logs: docker-compose logs backend"
fi

if docker-compose ps | grep -q "worker.*Up"; then
    echo "✅ Compile Worker is running"
else
    echo "❌ Worker failed to start"
    echo "   Check logs: docker-compose logs worker"
fi

if docker-compose ps | grep -q "frontend.*Up"; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend failed to start"
    echo "   Check logs: docker-compose logs frontend"
fi

echo "\n====================================\n"
echo "✨ AuroraCraft Platform is ready!\n"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8001"
echo "📚 API Docs: http://localhost:8001/docs\n"
echo "👤 Default Admin Login:"
echo "   Email: admin@auroracraft.local"
echo "   Password: Admin123!\n"
echo "📖 Full documentation: ./README.md"
echo "🔧 Setup guide: ./SETUP.md\n"
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down\n"
echo "====================================\n"
