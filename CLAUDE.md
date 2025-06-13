# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is Claude Nexus Proxy - a service that can operate in two modes:
1. **Translation Mode** (default): Translates between Anthropic's Claude API format and OpenAI-compatible API formats
2. **Passthrough Mode**: Directly proxies requests to Claude API for telemetry and multi-subscription support

Built with Hono framework on Bun runtime, it can be deployed to Cloudflare Workers, Docker, or as an npm package CLI.

## Architecture

### Core Components
- **`src/index.ts`** - Main Hono application with API proxy logic
- **`src/server.ts`** - Node.js server wrapper for CLI distribution with argument parsing

### API Translation Logic
The proxy service handles two modes:

#### Translation Mode (default)
In `src/index.ts`, when `PROXY_MODE=translation`:
- **Message normalization**: Converts Claude's nested content arrays to OpenAI's flat structure
- **Tool call mapping**: Transforms Claude's `tool_use`/`tool_result` to OpenAI's `tool_calls`/`tool` roles
- **Schema transformation**: Removes `format: 'uri'` constraints from JSON schemas for compatibility
- **Model routing**: Dynamically selects models based on request type (reasoning vs completion)
- **Streaming support**: Handles both streaming and non-streaming responses with SSE

#### Passthrough Mode
In `src/index.ts`, when `PROXY_MODE=passthrough`:
- **Direct forwarding**: Proxies requests directly to Claude API without modification
- **Header passthrough**: Forwards all original request headers (except host and authorization)
- **API key flexibility**: Supports per-request API keys via Authorization header
- **Telemetry collection**: Captures metrics for all requests
- **Multi-subscription support**: Different users can use their own Claude API keys
- **OAuth support**: Uses `Authorization: Bearer` header for OAuth, `x-api-key` for API keys

### Dual Runtime Support
- **Cloudflare Workers**: Uses Hono's built-in fetch handler (`src/index.ts`)
- **Node.js**: Uses `@hono/node-server` adapter (`src/server.ts`)
- **Note**: Client setup file serving (`/client-setup/*`) is only available in Node.js runtime

### Slack Integration (`src/slack.ts`)
- **Message notifications**: Sends user and assistant messages to Slack
- **Error alerts**: Notifies about processing errors
- **Metadata tracking**: Includes domain, model, tokens, and API key info
- **Webhook-based**: Uses Slack Incoming Webhooks for simple setup

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

# Cloudflare Workers development
bun run dev

# Build CLI package
bun run build

# Deploy to Cloudflare Workers
bun run deploy
```

## CLI Package

The project builds to an executable CLI via `bun run build`:
- **Output**: `./bin` - Standalone Node.js executable
- **Version management**: Reads from `package.json` dynamically
- **CLI flags**: `-v/--version`, `--help`, `-p/--port`, `-H/--host`, `-e/--env-file`
- **Auto-loads**: `.env` file from current directory
- **Uses**: dotenv for environment variable loading in binary

## Environment Variables

Configure via `wrangler.toml` or environment:
- `CLAUDE_CODE_PROXY_API_KEY` - Bearer token for upstream API
- `ANTHROPIC_PROXY_BASE_URL` - Upstream API URL (default: https://models.github.ai/inference)
- `REASONING_MODEL` - Model for reasoning requests (default: openai/gpt-4.1)
- `COMPLETION_MODEL` - Model for completion requests (default: openai/gpt-4.1)
- `REASONING_MAX_TOKENS` - Max tokens for reasoning model (optional)
- `COMPLETION_MAX_TOKENS` - Max tokens for completion model (optional)
- `PROXY_MODE` - Proxy mode: 'translation' or 'passthrough' (default: translation)
- `CLAUDE_API_KEY` - Claude API key for passthrough mode (optional)
- `DOMAIN_CREDENTIAL_MAPPING` - JSON mapping of domains to credential files (supports OAuth) (optional)
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

### Cloudflare Workers
Uses `wrangler.toml` configuration:
```bash
bun run deploy
```

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
      CLAUDE_CODE_PROXY_API_KEY: ${{ secrets.GITHUB_TOKEN }}
```

## Testing

**Note**: This project currently lacks a test suite. When implementing tests in the future:
- Consider using Bun's built-in test runner (`bun test`)
- Test the API translation logic, especially message normalization and tool call mapping
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
# Quick start with GitHub token
docker run -d -p 3000:3000 -e CLAUDE_CODE_PROXY_API_KEY=your_token ghcr.io/kiyo-e/claude-code-proxy:latest

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Review the API code and suggest improvements"
```

### OpenRouter Configuration
```bash
# Using environment file
echo "ANTHROPIC_PROXY_BASE_URL=https://openrouter.ai/api/v1" > .env
echo "REASONING_MODEL=deepseek/deepseek-r1-0528:free" >> .env
docker run -d -p 3000:3000 --env-file .env ghcr.io/kiyo-e/claude-code-proxy:latest
```

## Key Implementation Details

### Message Translation (`src/index.ts`)
- **Line 92-175**: Normalizes Claude's nested content structure to OpenAI's flat format
- **Line 177-303**: Maps tool calls between formats (Claude's `tool_use`/`tool_result` ↔ OpenAI's `tool_calls`/`tool`)
- **Line 305-324**: Sanitizes JSON schemas by removing unsupported `format: 'uri'` constraints
- **Line 420-450**: Handles SSE streaming with proper chunk formatting

### Model Selection Logic
- Requests containing "extended_reasoning" use the reasoning model
- All other requests use the completion model
- Models are configurable via environment variables

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
- Only available in Node.js runtime (not Cloudflare Workers)
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

### Passthrough Mode Usage
For direct Claude API access with telemetry:
```bash
# Configure passthrough mode
export PROXY_MODE=passthrough
export CLAUDE_API_KEY=sk-ant-api03-...
export TELEMETRY_ENDPOINT=https://your-telemetry-server.com/api/events

# Start the proxy
bun run start

# Use with Claude Code (supports per-request API keys)
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Help me with this code"

# Or override API key per request
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-ant-api03-different-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", ...}'
```

### Domain-Based Credential Mapping
Configure different credentials for different domains with OAuth support:
```bash
# Create credential files (relative to working directory)
mkdir -p credentials
cat > credentials/team1.json << EOF
{
  "type": "api_key",
  "api_key": "sk-ant-api03-team1-key"
}
EOF

cat > credentials/team2-oauth.json << EOF
{
  "type": "oauth",
  "oauth": {
    "client_id": "your-client-id.apps.googleusercontent.com",
    "client_secret": "your-client-secret",
    "refresh_token": "your-refresh-token",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
EOF

# Set up domain mapping
export DOMAIN_CREDENTIAL_MAPPING='{
  "claude-1.kaki.dev": "credentials/team1.json",
  "claude-2.kaki.dev": "credentials/team2-oauth.json",
  "claude-3.kaki.dev": "/etc/claude/team3.json",
  "claude-4.kaki.dev": "~/Documents/keys/team4.json"
}'

# Start the proxy
bun run start

# Requests to different domains use their mapped credentials
# OAuth tokens are automatically refreshed when needed
```

API key selection priority in passthrough mode:
1. Authorization header from request
2. Domain-based credential mapping (if hostname matches, with OAuth refresh)
3. Default CLAUDE_API_KEY
4. CLAUDE_CODE_PROXY_API_KEY (fallback)