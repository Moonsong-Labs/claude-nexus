#!/bin/bash

# Test client setup endpoint

PROXY_URL=${PROXY_URL:-http://localhost:3000}

echo "Testing client setup endpoint at $PROXY_URL"
echo "========================================"

# Test downloading credentials.json
echo -e "\n1. Testing download of credentials.json:"
curl -s -w "\nHTTP Status: %{http_code}\n" \
     -H "Accept: application/json" \
     "$PROXY_URL/client-setup/credentials.json" | head -20

# Test non-existent file
echo -e "\n\n2. Testing non-existent file:"
curl -s -w "\nHTTP Status: %{http_code}\n" \
     "$PROXY_URL/client-setup/nonexistent.json"

# Test directory traversal protection
echo -e "\n\n3. Testing directory traversal protection:"
curl -s -w "\nHTTP Status: %{http_code}\n" \
     "$PROXY_URL/client-setup/../package.json"

echo -e "\n\nTest complete!"