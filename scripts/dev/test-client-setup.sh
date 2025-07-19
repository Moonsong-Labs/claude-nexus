#!/bin/bash

# Test client setup endpoint
# This script validates the /client-setup endpoint that serves configuration files
# for Docker deployments and client setup automation.

set -euo pipefail

PROXY_URL=${PROXY_URL:-http://localhost:3000}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color output helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Check if proxy is running
if ! curl -s -f "$PROXY_URL/health" > /dev/null; then
    echo -e "${RED}Error: Proxy is not running at $PROXY_URL${NC}"
    echo "Please start the proxy with 'bun run dev:proxy' and try again."
    exit 1
fi

echo "Testing client setup endpoint at $PROXY_URL"
echo "======================================="

# Test 1: Check if client-setup directory exists
echo -e "\n1. Checking client-setup directory:"
if [ -d "$PROJECT_ROOT/client-setup" ]; then
    echo -e "${GREEN}✓ Directory exists${NC}"
    # List files in the directory
    echo "   Files in client-setup:"
    ls -la "$PROJECT_ROOT/client-setup/" | grep -v "^total" | sed 's/^/   /'
else
    echo -e "${YELLOW}⚠ Directory does not exist${NC}"
    echo "   Creating directory..."
    mkdir -p "$PROJECT_ROOT/client-setup"
fi

# Test 2: Test downloading existing files
echo -e "\n2. Testing file download:"
if [ -f "$PROJECT_ROOT/client-setup/README.md" ]; then
    echo "   Testing README.md download..."
    HTTP_STATUS=$(curl -s -w "%{http_code}" -o /tmp/test-readme.md "$PROXY_URL/client-setup/README.md")
    if [ "$HTTP_STATUS" = "200" ]; then
        echo -e "   ${GREEN}✓ Successfully downloaded (HTTP $HTTP_STATUS)${NC}"
        echo "   First 3 lines of content:"
        head -3 /tmp/test-readme.md | sed 's/^/   > /'
        rm -f /tmp/test-readme.md
    else
        echo -e "   ${RED}✗ Failed to download (HTTP $HTTP_STATUS)${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠ No files to test in client-setup directory${NC}"
    echo "   Add files to test the download functionality"
fi

# Test 3: Test non-existent file (should return 404)
echo -e "\n3. Testing non-existent file:"
HTTP_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$PROXY_URL/client-setup/nonexistent.json")
if [ "$HTTP_STATUS" = "404" ]; then
    echo -e "   ${GREEN}✓ Correctly returned 404 for non-existent file${NC}"
else
    echo -e "   ${RED}✗ Unexpected status code: $HTTP_STATUS (expected 404)${NC}"
fi

# Test 4: Test directory traversal protection
echo -e "\n4. Testing directory traversal protection:"
HTTP_STATUS=$(curl -s -w "%{http_code}" -o /tmp/test-traversal.txt "$PROXY_URL/client-setup/../package.json")
if [ "$HTTP_STATUS" = "404" ] || [ "$HTTP_STATUS" = "400" ]; then
    echo -e "   ${GREEN}✓ Directory traversal blocked (HTTP $HTTP_STATUS)${NC}"
else
    echo -e "   ${RED}✗ Security issue: Directory traversal not blocked (HTTP $HTTP_STATUS)${NC}"
    echo "   Response content:"
    head -5 /tmp/test-traversal.txt | sed 's/^/   > /'
fi
rm -f /tmp/test-traversal.txt

# Test 5: Test Accept header handling
echo -e "\n5. Testing content type handling:"
CONTENT_TYPE=$(curl -s -I "$PROXY_URL/client-setup/README.md" 2>/dev/null | grep -i "content-type:" | cut -d' ' -f2- | tr -d '\r\n' || echo "none")
if [ -f "$PROJECT_ROOT/client-setup/README.md" ] && [ "$CONTENT_TYPE" != "none" ]; then
    echo -e "   ${GREEN}✓ Content-Type: $CONTENT_TYPE${NC}"
else
    echo -e "   ${YELLOW}⚠ No Content-Type header or file not found${NC}"
fi

# Summary
echo -e "\n======================================="
echo -e "${GREEN}Test complete!${NC}"
echo ""
echo "Note: The /client-setup endpoint serves files from:"
echo "  $PROJECT_ROOT/client-setup/"
echo ""
echo "This is used for Docker deployments to distribute"
echo "client configuration files."