# Claude Nexus Proxy

A direct proxy service for Claude API with telemetry, multi-subscription support, and domain-based credential mapping. Built with Hono framework on Bun runtime, deployable as Docker container or standalone CLI.

## Features

- **Direct API Proxy**: Forwards requests to Claude API without modification
- **Telemetry Collection**: Track API usage, tokens, and performance metrics
- **Multi-Subscription Support**: Per-request API key override via headers
- **Domain-Based Credentials**: Map different domains to different API keys or OAuth tokens
- **OAuth Support**: Automatic token refresh for OAuth credentials
- **Token Usage Tracking**: Real-time monitoring of input/output tokens per domain
- **Slack Integration**: Send notifications for all API interactions
- **Multiple Deployment Options**: Docker container or standalone CLI

## Installation & Usage

### Docker (Recommended)

```bash
# Quick start with Claude API key
docker run -d -p 3000:3000 -e CLAUDE_API_KEY=sk-ant-api03-... ghcr.io/moonsong-labs/claude-nexus-proxy:latest

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Help me review this code"
```

### Building from Source

```bash
# Build the Docker image
docker build -t claude-nexus-proxy:latest .

# Run with credential directory
docker run -d -p 3000:3000 \
  -e CLAUDE_API_KEY=sk-ant-api03-default-key \
  -e CREDENTIALS_DIR=/app/credentials \
  -v $(pwd)/credentials:/app/credentials:ro \
  claude-nexus-proxy:latest
```

### Docker Compose

```bash
# Start the service
docker compose up -d

# View logs
docker compose logs -f

# Stop the service
docker compose down
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/moonsong-labs/claude-nexus-proxy
cd claude-nexus-proxy

# Install dependencies
bun install

# Run development server (hot reload)
bun run start

# Or build and run the CLI
bun run build
./bin --port 3000

# Use with Claude Code
export ANTHROPIC_BASE_URL=http://localhost:3000
claude "Help me review this code"
```


## Configuration

### Environment Variables

- `CLAUDE_API_KEY` - Default Claude API key (optional, can be overridden)
- `CREDENTIALS_DIR` - Directory containing domain credential files (default: 'credentials')
- `TELEMETRY_ENDPOINT` - URL to send telemetry data (optional)
- `DEBUG` - Enable debug logging (default: false)
- `PORT` - Server port for CLI mode (default: 3000)
- `HOST` - Server hostname/IP to bind to (default: 0.0.0.0)
- `SLACK_WEBHOOK_URL` - Slack webhook for notifications (optional)
- `SLACK_CHANNEL` - Slack channel override (optional)
- `SLACK_USERNAME` - Slack bot username (optional)
- `SLACK_ICON_EMOJI` - Slack bot icon (optional)
- `SLACK_ENABLED` - Enable/disable Slack notifications (optional)

### Environment File Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit with your settings
nano .env

# Run with env file
docker run -d -p 3000:3000 --env-file .env ghcr.io/moonsong-labs/claude-nexus-proxy:latest
```

## Multi-Subscription Support

Different users can use their own Claude credentials by passing them in the Authorization header:

```bash
# User with API key
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-ant-api03-user-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'

# User with OAuth token
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer oauth-access-token" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'
```

## Domain-Based Credential Mapping

Configure different Claude credentials for different domains. Supports both API keys and OAuth credentials with automatic token refresh.

### Credential File Naming

Credential files must be named after the domain they serve:
- Domain: `claude-1.example.com`
- File: `claude-1.example.com.credentials.json`

### Credential File Format

**API Key Credential** (`credentials/claude-1.example.com.credentials.json`):
```json
{
  "type": "api_key",
  "api_key": "sk-ant-api03-team1-key"
}
```

**API Key with Slack** (`credentials/claude-2.example.com.credentials.json`):
```json
{
  "type": "api_key",
  "api_key": "sk-ant-api03-team2-key",
  "slack": {
    "webhook_url": "https://hooks.slack.com/services/T00000000/B00000000/XXXX",
    "channel": "#team2-claude-logs",
    "username": "Team2 Claude Monitor",
    "icon_emoji": ":robot_face:",
    "enabled": true
  }
}
```

**OAuth Credential** (`credentials/claude-3.example.com.credentials.json`):
```json
{
  "type": "oauth",
  "oauth": {
    "accessToken": "your-access-token",
    "refreshToken": "your-refresh-token",
    "expiresAt": 1705123456789,
    "scopes": ["org:create_api_key", "user:profile", "user:inference"],
    "isMax": false
  }
}
```

**OAuth with Slack** (`credentials/claude-4.example.com.credentials.json`):
```json
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
    "channel": "#oauth-claude-logs",
    "username": "OAuth Claude Monitor",
    "icon_emoji": ":lock:",
    "enabled": true
  }
}
```

### Configuration

```bash
# Set the credentials directory (default: 'credentials')
export CREDENTIALS_DIR=/path/to/credentials

# Create credential files
mkdir -p credentials
echo '{"type": "api_key", "api_key": "sk-ant-api03-..."}' > credentials/claude-1.example.com.credentials.json
echo '{"type": "api_key", "api_key": "sk-ant-api03-..."}' > credentials/claude-2.example.com.credentials.json

# Start the proxy
claude-nexus-proxy
```

Now requests to different domains will automatically use their mapped credentials:
- OAuth tokens are automatically refreshed when needed
- OAuth credentials use `Authorization: Bearer <token>` header
- API key credentials use `x-api-key: <key>` header

### API Key Selection Priority

The proxy selects credentials in this order:
1. **Domain credential file** if `<domain>.credentials.json` exists in CREDENTIALS_DIR
2. **Authorization header** from the request
3. **CLAUDE_API_KEY** environment variable

## Token Usage Tracking

The proxy automatically tracks token usage per domain and displays statistics every 10 seconds.

### Features

- **Per-domain tracking**: Monitors input and output tokens for each domain
- **Request type classification**: Query evaluation vs inference
- **Tool call tracking**: Counts tool use in responses
- **API endpoint**: Access current stats via `/token-stats`

### Console Output Example

```
==========================================================================================
Token Usage Report - 1/13/2025, 3:45:23 PM (Uptime: 2m 15s)
==========================================================================================
Domain                    Reqs  Query  Infer  Tools   Input Tok   Output Tok    Total Tok
------------------------------------------------------------------------------------------
claude-1.example.com        12      8      4      3       5,234        8,921       14,155
claude-2.example.com         8      5      3      0       3,456        6,789       10,245
localhost                    3      2      1      2         892        1,234        2,126
------------------------------------------------------------------------------------------
TOTAL                       23     15      8      5       9,582       16,944       26,526
==========================================================================================
```

### API Access

```bash
curl http://localhost:3000/token-stats
```

## Slack Integration

Send user and assistant messages to a Slack channel for monitoring. Can be configured globally via environment variables or per-domain in credential files.

### Global Setup (All Domains)

```bash
# Configure global Slack webhook
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXX
export SLACK_CHANNEL=#claude-proxy-logs
export SLACK_USERNAME="Claude Monitor"
export SLACK_ICON_EMOJI=:robot_face:

# Run the proxy
claude-nexus-proxy
```

### Domain-Specific Setup

Add Slack configuration to any credential file:

```json
{
  "type": "api_key",
  "api_key": "sk-ant-api03-...",
  "slack": {
    "webhook_url": "https://hooks.slack.com/services/...",
    "channel": "#domain-specific-logs",
    "username": "Domain Bot",
    "icon_emoji": ":chart_with_upwards_trend:",
    "enabled": true
  }
}
```

**Priority**: Domain-specific Slack config takes precedence over global environment variables

## Debug Logging

Enable comprehensive debug logging with `DEBUG=true`. All sensitive data is automatically masked.

```bash
export DEBUG=true
claude-nexus-proxy

# Sample output:
=== Incoming Request ===
Request ID: abc123-def456
Method: POST
URL: http://localhost:3000/v1/messages
Authentication type: OAuth
Forwarding headers: {
  "authorization": "Bearer ********",
  "anthropic-beta": "oauth-2025-04-20"
}
```

## API Endpoints

- `GET /` - Health check and configuration status
- `GET /token-stats` - Current token usage statistics
- `GET /client-setup/:filename` - Download client setup files
- `POST /v1/messages` - Claude API proxy endpoint

## Telemetry Data

When configured with a `TELEMETRY_ENDPOINT`, the proxy sends:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "abc123...",
  "method": "POST",
  "path": "/v1/messages",
  "apiKey": "...last10chars",
  "model": "claude-3-opus-20240229",
  "inputTokens": 150,
  "outputTokens": 200,
  "duration": 1250,
  "status": 200
}
```

## Development

### Commands

```bash
# Install dependencies
bun install

# Hot reload development server
bun run start

# Build CLI package
bun run build
```

### Testing

```bash
# Test token tracking
DEBUG=true node test-token-tracking.js

# Test request types
DEBUG=true node test-request-types.js
```

## CLI Options

```bash
claude-nexus-proxy [options]

Options:
  -v, --version         Show version number
  -h, --help           Show help message
  -p, --port PORT      Set server port (default: 3000)
  -H, --host HOST      Set hostname/IP to bind (default: 0.0.0.0)
  -e, --env-file FILE  Load environment from specific file
```

---

Built with [Bun](https://bun.sh) and [Hono](https://hono.dev/)