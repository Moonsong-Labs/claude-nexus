#!/bin/bash

echo "🧪 Manual E2E Test"
echo "==================="
echo ""
echo "Prerequisites:"
echo "1. Start PostgreSQL: docker run -d --name e2e-postgres -e POSTGRES_USER=test_user -e POSTGRES_PASSWORD=test_pass -e POSTGRES_DB=claude_nexus_test -p 5433:5432 postgres:16-alpine"
echo "2. Init database: PGPASSWORD=test_pass psql -h localhost -p 5433 -U test_user -d claude_nexus_test -f ../../scripts/init-database.sql"
echo "3. Start mock Claude: cd packages/e2e && bun run src/setup/run-mock-claude.ts"
echo "4. Start proxy: DATABASE_URL=postgresql://test_user:test_pass@localhost:5433/claude_nexus_test PORT=3100 STORAGE_ENABLED=true ENABLE_CLIENT_AUTH=false CLAUDE_API_URL=http://localhost:3101/mock-claude bun run services/proxy/src/main.ts"
echo ""
echo "Running test requests..."

# Test 1: Single message
echo "Test 1: Single message creates new conversation"
curl -X POST http://localhost:3100/v1/messages \
  -H "Content-Type: application/json" \
  -H "Host: test.example.com" \
  -H "Authorization: Bearer cnp_test_e2e_key" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "Hello, Claude!"}],
    "max_tokens": 10
  }' | jq .

sleep 1

echo ""
echo "Checking database..."
PGPASSWORD=test_pass psql -h localhost -p 5433 -U test_user -d claude_nexus_test -c "
SELECT 
  request_id,
  conversation_id,
  branch_id,
  parent_request_id,
  message_count
FROM api_requests
WHERE domain = 'test.example.com'
ORDER BY timestamp DESC
LIMIT 1;
"

echo ""
echo "✅ If you see a conversation_id, branch_id='main', and message_count=1, the test passed!"