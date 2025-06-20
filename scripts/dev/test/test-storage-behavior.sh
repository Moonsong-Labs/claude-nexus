#!/bin/bash

echo "Testing storage behavior for requests with different system message counts"
echo "============================================================"

# Test 1: Request with 1 system message (should NOT be stored)
echo -e "\n1. Testing request with 1 system message (should NOT be stored):"
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "system": "You are a helpful assistant",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ],
    "max_tokens": 10
  }' 2>/dev/null | jq -r '.content[0].text' || echo "Request failed"

sleep 2

# Test 2: Request with 0 system messages (should be stored)
echo -e "\n2. Testing request with 0 system messages (should be stored):"
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "messages": [
      {"role": "user", "content": "What is 2+2?"}
    ],
    "max_tokens": 10
  }' 2>/dev/null | jq -r '.content[0].text' || echo "Request failed"

sleep 2

# Test 3: Request with 2 system messages (should be stored)
echo -e "\n3. Testing request with 2 system messages (should be stored):"
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "system": "You are a helpful assistant",
    "messages": [
      {"role": "system", "content": "Be concise"},
      {"role": "user", "content": "What is the capital of France?"}
    ],
    "max_tokens": 10
  }' 2>/dev/null | jq -r '.content[0].text' || echo "Request failed"

echo -e "\n\nCheck the proxy logs to see the storage behavior for each request."
echo "Look for lines containing 'Storage check' and 'Skipping storage'."