#!/bin/bash

# Type checking script for CI/CD and pre-commit hooks
# Runs TypeScript type checking across all workspaces

set -e

echo "🔍 Running TypeScript type checking..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any errors occurred
ERRORS=0

# Check shared package
echo "📦 Checking @claude-nexus/shared..."
if cd packages/shared && bun run typecheck 2>&1; then
    echo -e "${GREEN}✓ Shared package passed type checking${NC}"
else
    echo -e "${RED}✗ Shared package has type errors${NC}"
    ERRORS=1
fi
cd ../..

echo ""

# Check proxy service
echo "🚀 Checking @claude-nexus/proxy..."
if cd services/proxy && bun run typecheck 2>&1; then
    echo -e "${GREEN}✓ Proxy service passed type checking${NC}"
else
    echo -e "${RED}✗ Proxy service has type errors${NC}"
    ERRORS=1
fi
cd ../..

echo ""

# Check dashboard service
echo "📊 Checking @claude-nexus/dashboard..."
if cd services/dashboard && bun run typecheck 2>&1; then
    echo -e "${GREEN}✓ Dashboard service passed type checking${NC}"
else
    echo -e "${RED}✗ Dashboard service has type errors${NC}"
    ERRORS=1
fi
cd ../..

echo ""

# Summary
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All type checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Type errors found!${NC}"
    echo ""
    echo -e "${YELLOW}To see detailed errors, run:${NC}"
    echo "  bun run typecheck"
    echo ""
    echo -e "${YELLOW}To fix common issues:${NC}"
    echo "  - Ensure all variables have proper types"
    echo "  - Handle 'unknown' errors with proper type guards"
    echo "  - Add missing properties to interfaces"
    echo "  - Use proper error handling patterns"
    exit 1
fi