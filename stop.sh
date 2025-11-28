#!/bin/bash

echo "===================================="
echo "  Stopping AuroraCraft Platform"
echo "====================================\n"

echo "🛑 Stopping all services...\n"

docker-compose down

echo "\n✅ AuroraCraft Platform stopped successfully\n"
echo "To start again: ./start.sh"
echo "To remove all data: docker-compose down -v (CAUTION)\n"
