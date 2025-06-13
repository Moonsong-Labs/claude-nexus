# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is Claude Nexus Proxy - a service that directly proxies requests to Claude API for telemetry and multi-subscription support. Built with Hono framework on Bun runtime, it can be deployed as Docker container or standalone CLI.

## Architecture

### Core Components
- **`src/index.ts`** - Main Hono application with API proxy logic
- **`src/server.ts`** - Node.js server wrapper for CLI distribution with argument parsing

### API Proxy Logic
The proxy service:
- **Direct forwarding**: Proxies requests directly to Claude API without modification
- **Header passthrough**: Forwards all original request headers (except host and authorization)
- **API key flexibility**: Supports per-request API keys via Authorization header
- **Telemetry collection**: Captures metrics for all requests
- **Multi-subscription support**: Different users can use their own Claude API keys
- **OAuth support**: Uses `Authorization: Bearer` header for OAuth, `x-api-key` for API keys

### Runtime Support
- **Node.js**: Uses `@hono/node-server` adapter (`src/server.ts`)
- **Client setup files**: Served via `/client-setup/*` endpoint

### Slack Integration (`src/slack.ts`)
- **Message notifications**: Sends user and assistant messages to Slack
- **Error alerts**: Notifies about processing errors
- **Metadata tracking**: Includes domain, model, tokens, and API key info
- **Webhook-based**: Uses Slack Incoming Webhooks for simple setup
- **Privacy protection**: Automatically disables notifications for domains containing "personal"
- **Domain-specific config**: Each domain can have its own Slack webhook and channel
- **Global fallback**: Uses environment variables when no domain config exists

### Token Tracking (`src/tokenTracker.ts`)
- **Per-domain statistics**: Tracks input/output tokens and request counts
- **Automatic reporting**: Prints stats every 10 seconds in Node.js mode
- **API endpoint**: `/token-stats` for programmatic access
- **Memory-based**: Statistics reset on restart

### Graceful Shutdown (`src/server.ts`)
- **Signal handling**: Responds to SIGINT (CTRL+C), SIGTERM, and SIGQUIT
- **Clean shutdown**: Stops accepting connections, finishes active requests
- **Token stats**: Final statistics printed before exit
- **Timeout protection**: Forces exit after 5 seconds if needed

## Development Commands

```bash
# Install dependencies
bun install

# Local development server (hot reload)
bun run start

# Build CLI package
bun run build
```

## CLI Package

The project builds to an executable CLI via `bun run build`:
- **Output**: `./bin` - Standalone Node.js executable
- **Version management**: Reads from `package.json` dynamically
- **CLI flags**: `-v/--version`, `--help`, `-p/--port`, `-H/--host`, `-e/--env-file`
- **Auto-loads**: `.env` file from current directory
- **Uses**: dotenv for environment variable loading in binary

## Environment Variables

Configure via environment:
- `CLAUDE_API_KEY` - Claude API key (optional, can be overridden)
- `CREDENTIALS_DIR` - Directory containing domain credential files (default: 'credentials')
- `TELEMETRY_ENDPOINT` - URL to send telemetry data (optional)
- `DEBUG` - Enable debug logging (default: false) - logs full request/response details with sensitive data masked
- `PORT` - Server port for Node.js mode (default: 3000)
- `HOST` - Server hostname/IP to bind to (default: 0.0.0.0)
- `SLACK_WEBHOOK_URL` - Slack webhook for message notifications (optional)
- `SLACK_CHANNEL` - Override default Slack channel (optional)
- `SLACK_USERNAME` - Custom Slack bot username (optional)
- `SLACK_ICON_EMOJI` - Custom Slack bot icon (optional)
- `SLACK_ENABLED` - Enable/disable Slack notifications (optional)

## Deployment Options


### Docker
Multi-stage build with production optimization:
```bash
docker build -t claude-nexus-proxy .
docker run -d -p 3000:3000 claude-nexus-proxy
```

### Local Binary
Build and run locally:
```bash
bun run build
./bin --help
```

## GitHub Actions Integration

Service container setup for `@claude` mentions:
```yaml
services:
  claude-code-proxy:
    image: ghcr.io/kiyo-e/claude-code-proxy:latest
    ports: [3000:3000]
    env:
      CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
```

## Testing

**Note**: This project currently lacks a test suite. When implementing tests in the future:
- Consider using Bun's built-in test runner (`bun test`)
- Test the API proxy logic, telemetry, and token tracking
- Add integration tests for both streaming and non-streaming responses

### Test Scripts

- **`test-token-tracking.js`**: Tests token tracking functionality
- **`test-request-types.js`**: Tests request type detection and tool call counting

## Local Usage with Claude Code

### Development Server
```bash
# Start proxy (port 3000 by default)
bun run start

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude
```

### Docker Usage
```bash
# Quick start with Claude API key
docker run -d -p 3000:3000 -e CLAUDE_API_KEY=sk-ant-api03-... ghcr.io/kiyo-e/claude-code-proxy:latest

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Review the API code and suggest improvements"
```

## Key Implementation Details

### Request Type Detection
- **Query Evaluation**: Requests with exactly 1 system message (in `system` field or messages array)
- **Inference**: Requests with more than 1 system message
- Token usage is tracked separately for each request type

### Tool Call Tracking
- Counts `tool_use` content blocks in responses
- Tracked per domain in token statistics
- Available in both streaming and non-streaming modes

### Client Setup Files
- Files in `client-setup/` directory are served via `/client-setup/:filename` endpoint
- Protected against directory traversal attacks
- Automatically included in Docker builds

### OAuth Credential Management (`src/credentials.ts`)
- **OAuth format**: Uses Claude's native OAuth with access/refresh tokens
- **Auto-refresh**: Tokens refresh automatically 1 minute before expiry
- **Token storage**: Saves refreshed tokens back to credential files
- **PKCE flow**: Implements OAuth 2.0 PKCE for secure authorization
- **Beta header**: Adds `anthropic-beta: oauth-2025-04-20` for OAuth requests
- **Fallback logic**: Uses first available credential when no host mapping found

### Telemetry Collection (`src/index.ts:23-56`)
The proxy collects telemetry data for all requests:
- Request ID, timestamp, and duration
- API key (masked for privacy)
- Model used and token counts
- Response status and errors
- Data is sent asynchronously to `TELEMETRY_ENDPOINT`

### Debug Logging (`src/index.ts:125-175`)
When `DEBUG=true`, the proxy logs comprehensive request/response details:
- **Request logging**: Headers, body, method, URL
- **Response logging**: Status, headers, body (non-streaming)
- **Streaming chunks**: Individual SSE chunks during streaming
- **Automatic masking**: API keys and sensitive data are masked
- Formats: `sk-ant-****`, `Bearer ****`, masked tokens/keys in payload

### Domain-Based Credential Mapping
Configure different credentials for different domains with OAuth and Slack support:
```bash
# Set the credentials directory
export CREDENTIALS_DIR=credentials  # or /path/to/credentials

# Create credential files named after domains
mkdir -p credentials

# API key credential
cat > credentials/claude-1.kaki.dev.credentials.json << EOF
{
  "type": "api_key",
  "api_key": "sk-ant-api03-team1-key"
}
EOF

# API key with Slack configuration
cat > credentials/claude-2.kaki.dev.credentials.json << EOF
{
  "type": "api_key",
  "api_key": "sk-ant-api03-team2-key",
  "slack": {
    "webhook_url": "https://hooks.slack.com/services/T00000000/B00000000/XXXX",
    "channel": "#team2-logs",
    "username": "Team2 Bot",
    "icon_emoji": ":robot_face:",
    "enabled": true
  }
}
EOF

# OAuth credential with Slack
cat > credentials/claude-3.kaki.dev.credentials.json << EOF
{
  "type": "oauth",
  "oauth": {
    "accessToken": "your-access-token",
    "refreshToken": "your-refresh-token",
    "expiresAt": 1705123456789,
    "scopes": ["org:create_api_key", "user:profile", "user:inference"],
    "isMax": false
  },
  "slack": {
    "webhook_url": "https://hooks.slack.com/services/T11111111/B11111111/YYYY",
    "channel": "#oauth-logs",
    "enabled": true
  }
}
EOF

# Start the proxy
bun run start

# Requests to different domains automatically use their credential files
# OAuth tokens are automatically refreshed when needed
# Slack notifications use domain-specific settings if configured
```

API key selection priority:
1. Domain credential file (if exists: `<domain>.credentials.json`)
2. Authorization header from request
3. Default CLAUDE_API_KEY

Slack configuration priority:
1. Domain-specific Slack config from credential file
2. Global Slack environment variables
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.