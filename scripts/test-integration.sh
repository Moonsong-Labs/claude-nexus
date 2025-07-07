#!/bin/bash
# Script to run integration tests with proper isolation

echo "Running integration tests..."

# Run tests that work well in parallel
echo "Running proxy-auth tests..."
bun test tests/integration/proxy-auth.test.ts || exit 1

# Run AI analysis tests separately due to Bun/Hono response handling issues in parallel mode
echo "Running ai-analysis-api tests..."
bun test tests/integration/ai-analysis-api.test.ts || exit 1

echo "All integration tests passed!"