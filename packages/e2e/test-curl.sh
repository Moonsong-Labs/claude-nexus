#!/bin/bash

echo "🧪 Testing E2E with curl"
echo "======================="

# First check if proxy is healthy
echo "Checking proxy health..."
curl -s http://localhost:3100/health | jq .
echo ""

# Test without auth to see if it's disabled
echo "Testing without authentication..."
RESPONSE_NO_AUTH=$(curl -s -X POST http://localhost:3100/v1/messages \
  -H "Content-Type: application/json" \
  -H "Host: test.example.com" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "Hello without auth!"}],
    "max_tokens": 10
  }')
echo "Response without auth: $RESPONSE_NO_AUTH"
echo ""

# Test with auth
echo "Testing with authentication..."
RESPONSE=$(curl -s -X POST http://localhost:3100/v1/messages \
  -H "Content-Type: application/json" \
  -H "Host: test.example.com" \
  -H "Authorization: Bearer cnp_test_e2e_key" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "Hello from E2E test!"}],
    "max_tokens": 10
  }')

echo "Response with auth: $RESPONSE"
echo ""

# Wait for storage
sleep 1

# Check database
echo "Checking database..."
PGPASSWORD=test_pass psql -h localhost -p 5433 -U test_user -d claude_nexus_test -c "
SELECT 
  request_id,
  conversation_id,
  branch_id,
  parent_request_id,
  message_count,
  domain,
  response_status
FROM api_requests
WHERE domain = 'test.example.com'
ORDER BY timestamp DESC
LIMIT 1;
"