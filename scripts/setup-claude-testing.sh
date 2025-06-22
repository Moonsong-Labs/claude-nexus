#!/bin/bash

# Setup script for Claude AI Testing Environment
# This script prepares the necessary credentials and configuration for AI-driven testing

set -e

echo "🤖 Setting up Claude AI Testing Environment..."

# Create secrets directory
mkdir -p secrets

# Function to generate a secure API key
generate_api_key() {
    echo "cnp_test_$(openssl rand -hex 16)"
}

# Check if Anthropic API key is provided
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ Error: ANTHROPIC_API_KEY environment variable is not set"
    echo "Please set it with: export ANTHROPIC_API_KEY='your-anthropic-api-key'"
    exit 1
fi

# Create Anthropic API key secret file
echo "$ANTHROPIC_API_KEY" > secrets/anthropic_api_key.txt
echo "✅ Created Anthropic API key secret file"

# Generate or use existing client API key
if [ -z "$CLIENT_API_KEY" ]; then
    echo "🔑 Generating new client API key for testing..."
    CLIENT_API_KEY=$(generate_api_key)
    echo "Generated API key: $CLIENT_API_KEY"
fi

# Create client API key secret file
echo "$CLIENT_API_KEY" > secrets/client_api_key.txt
echo "✅ Created client API key secret file"

# Create test domain credentials file
TEST_DOMAIN="test.localhost"
CREDENTIALS_FILE="credentials/${TEST_DOMAIN}.credentials.json"

mkdir -p credentials

cat > "$CREDENTIALS_FILE" << EOF
{
  "type": "api_key",
  "api_key": "$ANTHROPIC_API_KEY",
  "client_api_key": "$CLIENT_API_KEY"
}
EOF

echo "✅ Created test domain credentials file: $CREDENTIALS_FILE"

# Create Claude configuration directory structure
mkdir -p client-setup/.claude

# Create Claude configuration file
cat > client-setup/.claude.json << 'EOF'
{
  "version": "1.0",
  "api": {
    "endpoint": "http://proxy:3000/v1"
  },
  "settings": {
    "theme": "dark",
    "telemetry": false
  }
}
EOF

echo "✅ Created Claude configuration file"

# Create Claude credentials file for CLI
cat > client-setup/.claude/.credentials.json << EOF
{
  "claudeAiOauth": {
    "accessToken": "$CLIENT_API_KEY",
    "refreshToken": "",
    "expiresAt": "2099-12-31T23:59:59Z"
  }
}
EOF

echo "✅ Created Claude CLI credentials file"

# Set proper permissions
chmod 600 secrets/*.txt
chmod 600 credentials/*.json
chmod 600 client-setup/.claude/.credentials.json

echo ""
echo "🎉 Claude AI Testing Environment setup complete!"
echo ""
echo "To run AI-driven tests:"
echo "  1. From project root: ./docker-up.sh --profile testing up"
echo "  2. Or: cd docker && docker compose --profile testing up"
echo ""
echo "To run tests in replay mode:"
echo "  TEST_MODE=replay REPLAY_SUITE_ID=<suite-id> docker compose --profile testing up"
echo ""
echo "Test artifacts will be saved in: services/claude-testing/artifacts/"