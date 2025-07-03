#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting E2E test environment..."

# Start PostgreSQL container
echo "📦 Starting PostgreSQL container..."
docker run -d \
  --name claude-nexus-e2e-postgres \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_pass \
  -e POSTGRES_DB=claude_nexus_test \
  -p 5433:5432 \
  postgres:16-alpine

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if docker exec claude-nexus-e2e-postgres pg_isready -U test_user > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ PostgreSQL failed to start"
    exit 1
  fi
  sleep 1
done

# Initialize database schema
echo "🗄️ Initializing database schema..."
export DATABASE_URL="postgresql://test_user:test_pass@localhost:5433/claude_nexus_test"
PGPASSWORD=test_pass psql -h localhost -p 5433 -U test_user -d claude_nexus_test -f ../../scripts/init-database.sql

# Start mock Claude API server
echo "🤖 Starting mock Claude API server..."
bun run src/setup/mock-claude.ts &
MOCK_PID=$!

# Start proxy server
echo "🔧 Starting proxy server..."
cd ../..
PORT=3100 \
DATABASE_URL=$DATABASE_URL \
STORAGE_ENABLED=true \
ENABLE_CLIENT_AUTH=false \
CLAUDE_API_URL="http://localhost:3101/mock-claude" \
bun run services/proxy/src/main.ts &
PROXY_PID=$!

# Wait for proxy to be ready
echo "⏳ Waiting for proxy to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "✅ Proxy is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Proxy failed to start"
    exit 1
  fi
  sleep 1
done

# Run tests
echo "🧪 Running tests..."
cd packages/e2e
export DATABASE_URL="postgresql://test_user:test_pass@localhost:5433/claude_nexus_test"
export PROXY_URL="http://localhost:3100"
bun test src/__tests__/conversation-tracking.bun.test.ts

# Cleanup
echo "🧹 Cleaning up..."
kill $PROXY_PID $MOCK_PID || true
docker stop claude-nexus-e2e-postgres || true
docker rm claude-nexus-e2e-postgres || true

echo "✅ E2E tests completed!"