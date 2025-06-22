#!/bin/bash

# Script to promote an AI-discovered test case to a permanent regression test
# Usage: ./scripts/promote-ai-test.sh <suite-id> [test-index]

set -e

SUITE_ID=$1
TEST_INDEX=${2:-all}

if [ -z "$SUITE_ID" ]; then
    echo "❌ Error: Please provide a suite ID"
    echo "Usage: $0 <suite-id> [test-index]"
    exit 1
fi

ARTIFACTS_DIR="services/claude-testing/artifacts"
SUITE_FILE="$ARTIFACTS_DIR/generated-tests-$SUITE_ID.json"

if [ ! -f "$SUITE_FILE" ]; then
    echo "❌ Error: Test suite file not found: $SUITE_FILE"
    echo "Available suites:"
    ls -la "$ARTIFACTS_DIR"/generated-tests-*.json 2>/dev/null || echo "No test suites found"
    exit 1
fi

echo "📋 Loading test suite: $SUITE_ID"

# Create promoted tests directory
PROMOTED_DIR="services/claude-testing/test/promoted"
mkdir -p "$PROMOTED_DIR"

# Generate promoted test file
PROMOTED_FILE="$PROMOTED_DIR/promoted-${SUITE_ID}.test.ts"

cat > "$PROMOTED_FILE" << 'EOF'
// Promoted AI-discovered test cases
// Generated from suite: SUITE_ID_PLACEHOLDER
// Date: DATE_PLACEHOLDER

import { describe, it, expect } from 'vitest';
import { ProxyClient } from '../lib/proxy-client';

describe('Promoted AI Tests - SUITE_ID_PLACEHOLDER', () => {
  let proxyClient: ProxyClient;

  beforeAll(() => {
    proxyClient = new ProxyClient();
  });

EOF

# Replace placeholders
sed -i "s/SUITE_ID_PLACEHOLDER/$SUITE_ID/g" "$PROMOTED_FILE"
sed -i "s/DATE_PLACEHOLDER/$(date -I)/g" "$PROMOTED_FILE"

# Extract and convert test cases using Node.js
node -e "
const fs = require('fs');
const suite = JSON.parse(fs.readFileSync('$SUITE_FILE', 'utf-8'));
const testIndex = '$TEST_INDEX';

let testCases = suite.testCases;
if (testIndex !== 'all' && !isNaN(parseInt(testIndex))) {
  testCases = [testCases[parseInt(testIndex)]];
}

testCases.forEach((testCase, index) => {
  const testCode = \`
  it('\${testCase.description}', async () => {
    const response = await proxyClient.makeRequest(
      '\${testCase.httpMethod}',
      '\${testCase.endpoint}',
      \${JSON.stringify(testCase.payload, null, 6).split('\n').join('\n      ')},
      \${JSON.stringify(testCase.headers || {}, null, 6).split('\n').join('\n      ')}
    );

    expect(response.status).toBe(\${testCase.expectedStatusCode});
    
    // Add additional assertions based on the test case
    if (response.status >= 400) {
      expect(response.body).toHaveProperty('error');
    }
  });\`;
  
  fs.appendFileSync('$PROMOTED_FILE', testCode + '\n');
});

fs.appendFileSync('$PROMOTED_FILE', '});\n');

console.log('✅ Generated ' + testCases.length + ' test case(s)');
"

echo ""
echo "🎉 Successfully promoted test case(s) to: $PROMOTED_FILE"
echo ""
echo "Next steps:"
echo "1. Review the generated test file"
echo "2. Add any additional assertions or cleanup"
echo "3. Run: bun test $PROMOTED_FILE"
echo "4. Commit the test to your repository"