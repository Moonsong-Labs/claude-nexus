#!/bin/bash

# Setup script for Claude CLI to use the proxy

set -e

# Create .claude.json configuration to point to the proxy
cat > /root/.claude.json << EOF
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

# Create credentials file with Bearer token
cat > /root/.claude/.credentials.json << EOF
{
  "claudeAiOauth": {
    "accessToken": "${CLAUDE_API_KEY}",
    "refreshToken": "",
    "expiresAt": "2099-12-31T23:59:59Z"
  }
}
EOF

echo "✅ Claude CLI configured to use proxy at http://proxy:3000"
echo "✅ Using Bearer token authentication"

# Execute the command passed to the container
exec "$@"