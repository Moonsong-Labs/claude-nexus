# Claude Nexus Proxy

A versatile proxy service for Claude API that supports both API translation and direct passthrough modes. Built with Hono framework on Bun runtime, deployable to Cloudflare Workers, Docker, or as a standalone CLI.

## Features

### Core Capabilities
- **Dual Mode Operation**: 
  - **Translation Mode**: Convert between Claude and OpenAI API formats
  - **Passthrough Mode**: Direct proxy to Claude API for telemetry
- **Telemetry Collection**: Track API usage, tokens, and performance metrics
- **Multi-Subscription Support**: Per-request API key override via headers
- **Streaming Support**: Both streaming and non-streaming response handling
- **Multiple Deployment Options**: Cloudflare Workers, Docker, or npm package
- **Token Usage Tracking**: Real-time monitoring of input/output tokens per domain

### Translation Mode Features
- **Message Normalization**: Handles nested content arrays and tool call mapping
- **Model Routing**: Dynamic model selection for reasoning vs completion tasks
- **Schema Transformation**: Automatic format compatibility adjustments

## Installation & Usage

### Docker (Recommended)

#### Quick Start

```bash
# GitHub Models (default)
docker run -d -p 3000:3000 -e CLAUDE_CODE_PROXY_API_KEY=your_github_token ghcr.io/moonsong-labs/claude-nexus-proxy:latest

# OpenRouter
docker run -d -p 3000:3000 \
  -e CLAUDE_CODE_PROXY_API_KEY=your_openrouter_key \
  -e ANTHROPIC_PROXY_BASE_URL=https://openrouter.ai/api/v1 \
  -e REASONING_MODEL=deepseek/deepseek-r1-0528:free \
  -e COMPLETION_MODEL=deepseek/deepseek-r1-0528:free \
  ghcr.io/moonsong-labs/claude-nexus-proxy:latest

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Help me review this code"
```

### Building from Source

```bash
# Build the Docker image
docker build -t claude-nexus-proxy:latest .

# Run the container
docker run -d -p 3000:3000 \
  -e CLAUDE_CODE_PROXY_API_KEY=your_token \
  -v $(pwd)/credentials:/app/credentials:ro \
  claude-nexus-proxy:latest
```

### Docker Compose

```bash
# Start the service
docker compose up -d

# Build and run
docker compose up -d --build

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

# Run on a specific interface (default: 0.0.0.0)
./bin --host localhost --port 3000  # Local only
./bin --host 0.0.0.0 --port 3000   # All interfaces (default)

# Or use environment variables
HOST=127.0.0.1 PORT=8080 ./bin

# Use with Claude Code
export ANTHROPIC_BASE_URL=http://localhost:3000
claude "Help me review this code"

# Stop the server gracefully with CTRL+C
# The server will:
# - Stop accepting new connections
# - Finish processing active requests
# - Save final token usage statistics
# - Exit cleanly
```

### Environment File Configuration

See `.env.example` for a complete configuration template.

```bash
# Copy example environment file
cp .env.example .env

# Edit with your settings
nano .env

# Run with env file
docker run -d -p 3000:3000 --env-file .env ghcr.io/moonsong-labs/claude-nexus-proxy:latest
```

For passthrough mode with credential files:
```bash
# Create credential files
mkdir -p credentials
echo '{
  "type": "api_key",
  "api_key": "sk-ant-api03-your-key"
}' > credentials/default.json

# Create .env file
cat > .env << EOF
PROXY_MODE=passthrough
CLAUDE_API_KEY=sk-ant-api03-default-key
DOMAIN_CREDENTIAL_MAPPING={"app1.example.com":"credentials/app1.json","app2.example.com":"credentials/app2.json"}
TELEMETRY_ENDPOINT=https://your-metrics.com/api/events
DEBUG=false
EOF

# Run with env file and mount credentials directory
docker run -d -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/credentials:/app/credentials:ro \
  ghcr.io/moonsong-labs/claude-nexus-proxy:latest
```

### Cloudflare Workers

```bash
# Deploy to Cloudflare Workers
bun run deploy

# Configure environment variables in Workers dashboard
# Or set them via wrangler CLI:
npx wrangler secret put CLAUDE_CODE_PROXY_API_KEY
npx wrangler secret put ANTHROPIC_PROXY_BASE_URL
```

After deployment, your proxy will be available at `https://your-worker-name.your-subdomain.workers.dev`

#### Using with Claude Code

```bash
# Set your deployed Worker URL as the base URL
export ANTHROPIC_BASE_URL=https://your-worker-name.your-subdomain.workers.dev

# Now use Claude Code normally
claude "Help me review this code"
claude "Explain this function and suggest improvements"
```

#### Complete Setup Example

1. **Deploy the proxy:**
```bash
git clone https://github.com/moonsong-labs/claude-nexus-proxy
cd claude-nexus-proxy
bun install
bun run deploy
```

2. **Set environment variables:**
```bash
# For GitHub Models (recommended)
npx wrangler secret put CLAUDE_CODE_PROXY_API_KEY
# Enter your GitHub Personal Access Token

# For OpenRouter
npx wrangler secret put CLAUDE_CODE_PROXY_API_KEY
# Enter your OpenRouter API key
npx wrangler secret put ANTHROPIC_PROXY_BASE_URL
# Enter: https://openrouter.ai/api/v1
npx wrangler secret put REASONING_MODEL
# Enter: deepseek/deepseek-r1-0528:free
npx wrangler secret put COMPLETION_MODEL
# Enter: deepseek/deepseek-r1-0528:free
```

3. **Test the deployment:**
```bash
curl https://your-worker-name.your-subdomain.workers.dev
```

4. **Use with Claude Code:**
```bash
# Install Claude Code if not already installed
npm install -g @anthropics/claude-code

# Set the proxy URL
export ANTHROPIC_BASE_URL=https://your-worker-name.your-subdomain.workers.dev

# Use Claude Code
claude "Review this TypeScript code and suggest improvements"
```

## Development

### Local Development

```bash
# Install dependencies
bun install

# Hot reload development server (port 3000)
bun run start

# Cloudflare Workers development
bun run dev

# Build CLI package
bun run build

# Test CLI
./bin --help
```

### Build and Publish

```bash
# Build and publish npm package
bun run build
npm publish
```

### Debugging Token Tracking

If token usage shows 0, use the test script to debug:

```bash
# Test token tracking with debug output
DEBUG=true CLAUDE_API_KEY=your-key node test-token-tracking.js

# Or with a custom proxy URL
PROXY_URL=http://localhost:8080 DEBUG=true node test-token-tracking.js

# Test request type detection and tool call counting
DEBUG=true node test-request-types.js
```

## Configuration

### Environment Variables

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
- `DEBUG` - Enable debug logging (default: false) - logs full request/response with masked sensitive data
- `PORT` - Server port for CLI mode (default: 3000)
- `SLACK_WEBHOOK_URL` - Slack webhook URL for notifications (optional)
- `SLACK_CHANNEL` - Slack channel override (optional)
- `SLACK_USERNAME` - Slack bot username (default: Claude Code Proxy)
- `SLACK_ICON_EMOJI` - Slack bot icon (default: :robot_face:)
- `SLACK_ENABLED` - Enable/disable Slack notifications (default: true if webhook provided)

### Cloudflare Workers Configuration

For Cloudflare Workers deployment, set environment variables using the Workers dashboard or wrangler CLI:

```bash
# Set secrets (recommended for sensitive data)
npx wrangler secret put CLAUDE_CODE_PROXY_API_KEY
npx wrangler secret put ANTHROPIC_PROXY_BASE_URL

# Set regular environment variables
npx wrangler env put REASONING_MODEL "deepseek/deepseek-r1-0528:free"
npx wrangler env put COMPLETION_MODEL "deepseek/deepseek-r1-0528:free"
npx wrangler env put DEBUG "false"
```

Alternatively, configure via `wrangler.toml`:

```toml
[env.production.vars]
REASONING_MODEL = "deepseek/deepseek-r1-0528:free"
COMPLETION_MODEL = "deepseek/deepseek-r1-0528:free"
DEBUG = "false"
```

### CLI Options

```bash
claude-code-proxy [options]

Options:
  -v, --version              Show version number
  -h, --help                 Show help message
  -p, --port PORT            Set server port (default: 3000)
  -e, --env-file FILE        Load environment from specific file

# Examples
claude-code-proxy                           # Loads .env automatically
claude-code-proxy --env-file .env.production
claude-code-proxy --port 8080 --env-file config/.env
```

The proxy automatically loads `.env` file from the current directory when using the binary.

## Passthrough Mode

Use passthrough mode to directly proxy requests to Claude API while collecting telemetry and supporting multiple subscriptions.

### Basic Passthrough Setup

```bash
# Configure environment for passthrough mode
export PROXY_MODE=passthrough
export CLAUDE_API_KEY=sk-ant-api03-your-key
export TELEMETRY_ENDPOINT=https://your-telemetry-server.com/api/events

# Start the proxy
claude-code-proxy

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Help me with this code"
```

### Header Passthrough

In passthrough mode, all original request headers are forwarded to Claude API, with these exceptions:
- `host` header is omitted (set automatically by fetch)
- `authorization` header is converted to `x-api-key` format
- `anthropic-version` and `content-type` are set/overridden as required

This allows you to pass custom headers like rate limit hints, client identifiers, or other metadata directly to Claude API.

### Multi-Subscription Support

Different users can use their own Claude credentials by passing them in the Authorization header:

```bash
# User 1 with API key
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-ant-api03-user1-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'

# User 2 with OAuth token
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer oauth-access-token" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'
```

**Note**: Domain-based credential mapping takes priority:
- If a domain has a configured credential, it will be used regardless of any Authorization header in the request
- Authorization headers from requests are only used when no domain mapping exists
- For OAuth tokens, the proxy automatically adds the `anthropic-beta` header
```

### Telemetry Data

When configured with a `TELEMETRY_ENDPOINT`, the proxy sends the following data for each request:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "abc123...",
  "method": "POST",
  "path": "/v1/messages",
  "apiKey": "sk-a...key",  // Masked for privacy
  "model": "claude-3-opus-20240229",
  "inputTokens": 150,
  "outputTokens": 200,
  "duration": 1250,  // milliseconds
  "status": 200,
  "error": null
}
```

### Domain-Based Credential Mapping

Configure different Claude credentials for different domains in passthrough mode. Supports both API keys and OAuth credentials with automatic token refresh.

#### Credential File Format

Create credential files in JSON format:

**API Key Credential** (`credentials/team1.json`):
```json
{
  "type": "api_key",
  "api_key": "sk-ant-api03-team1-key"
}
```

**OAuth Credential** (`credentials/team2.json`):
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

#### Configuration

```bash
# Set up domain mapping to credential files
export PROXY_MODE=passthrough
export DOMAIN_CREDENTIAL_MAPPING='{
  "claude-1.example.com": "credentials/team1.json",
  "claude-2.example.com": "credentials/team2.json",
  "claude-3.example.com": "/absolute/path/to/creds.json",
  "claude-4.example.com": "~/Documents/claude-keys/team4.json"
}'

# Start the proxy
claude-code-proxy
```

Now requests to different domains will automatically use their mapped credentials:
- `claude-1.example.com` → uses credentials from `credentials/team1.json`
- `claude-2.example.com` → uses credentials from `credentials/team2.json`
- OAuth tokens are automatically refreshed when needed
- OAuth credentials use `Authorization: Bearer <token>` header
- API key credentials use `x-api-key: <key>` header

#### Creating OAuth Credentials

To set up OAuth credentials for a domain:

```bash
# Clone and build the project
git clone https://github.com/moonsong-labs/claude-nexus-proxy
cd claude-nexus-proxy
bun install

# Run OAuth login flow to create credential file
bun run -e "import('./src/credentials.js').then(m => m.performOAuthLogin('credentials/team2.json'))"
```

This will:
1. Open your browser for Claude OAuth authorization
2. Save OAuth credentials to the specified file
3. Optionally create an API key file (team2-apikey.json)

#### Path Resolution

Credential file paths are resolved as follows:
- **Relative paths** (e.g., `credentials/api.json`) → relative to current working directory
- **Absolute paths** (e.g., `/etc/claude/api.json`) → used as-is
- **Home paths** (e.g., `~/Documents/keys.json`) → expanded to user's home directory

#### Credential Validation

The proxy validates all credential files at startup. If any files are missing or invalid, it will display warnings but continue to run. The health check endpoint (`GET /`) also shows validation status.

#### API Key Selection Priority

In passthrough mode, the proxy selects credentials in this order:
1. **Domain credential mapping** if the hostname matches (highest priority - with OAuth refresh)
2. **Authorization header** from the request (preserves Bearer format)
3. **CLAUDE_API_KEY** environment variable (uses x-api-key format)
4. **CLAUDE_CODE_PROXY_API_KEY** as fallback (uses x-api-key format)

**Note**: When no host mapping is found but credential files exist, the proxy will:
- Print a warning: `Warning: No credential mapping found for host 'example.com'`
- Use the first available credential from the mapping
- Show which domain's credential is being used

#### Cloudflare Workers Setup

For domain-based routing with Cloudflare Workers:

1. Deploy the proxy to Cloudflare Workers
2. Set up custom domains for your worker
3. Configure the domain mapping:

```bash
# Set the domain mapping as a secret
npx wrangler secret put DOMAIN_CREDENTIAL_MAPPING
# Enter: {"claude-1.kaki.dev":"~/.claude/team1.json", "claude-2.kaki.dev":"~/.claude/team2.json"}
```

4. Route your domains to the worker:
```bash
# Add custom domains
npx wrangler domains add claude-1.kaki.dev
npx wrangler domains add claude-2.kaki.dev
```

## Debug Logging

Enable comprehensive debug logging by setting `DEBUG=true`. This logs:

- **Incoming requests**: Method, URL, headers, and body (formatted JSON)
- **Outgoing requests**: Transformed payloads and headers
- **Responses**: Status, headers, and body content (with truncated long text)
- **Streaming data**: Individual SSE chunks during streaming
- **Token usage**: Extracted token counts from API responses
- **Token tracking**: Domain-based token usage statistics

All sensitive data is automatically masked:
- API keys: `sk-ant-****`, `Bearer ****`
- Tokens and keys in payloads are replaced with `****`

### Example Debug Output

```bash
# Enable debug mode
export DEBUG=true
claude-nexus-proxy

# Sample output:
=== Incoming Request ===
Request ID: abc123-def456
Method: POST
URL: http://localhost:3000/v1/messages

# For OAuth credentials:
Authentication type: OAuth
Forwarding headers: {
  "authorization": "Bearer ********",
  "anthropic-beta": "oauth-2025-04-20"
}

# For API key credentials:
Authentication type: API Key
Forwarding headers: {
  "x-api-key": "sk-ant-...last10chars"
}
Headers: {
  "authorization": "Bearer ********",
  "content-type": "application/json"
}
Request Body: {
  "model": "claude-3-opus-20240229",
  "messages": [...],
  "api_key": "****"
}
======================
```

## Slack Integration

The proxy can send user and assistant messages to a Slack channel for monitoring and auditing purposes.

### Setup

1. **Create a Slack Webhook**:
   - Go to your Slack workspace and create an Incoming Webhook
   - Copy the webhook URL

2. **Configure the proxy**:
   ```bash
   # Set the webhook URL
   export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
   
   # Optional: Customize settings
   export SLACK_CHANNEL=#claude-proxy-logs  # Override default channel
   export SLACK_USERNAME="Claude Monitor"   # Custom bot name
   export SLACK_ICON_EMOJI=:robot_face:     # Custom bot icon
   export SLACK_ENABLED=true                # Enable/disable notifications
   ```

3. **Run the proxy**:
   ```bash
   claude-code-proxy
   ```

### Message Format

Slack messages include:
- **User messages**: Shows the original user input with domain and model info
- **Assistant responses**: Shows Claude's response with token usage
- **Errors**: Displays any errors that occur during processing
- **Metadata**: Request ID, timestamps, API key (masked), and token counts

### Example Slack Notification

```
🤖 Assistant | Request abc123-def456
Domain: claude-1.example.com | Model: claude-3-opus-20240229
API Key: ...last10chars | Tokens: In: 150, Out: 200

Here's my response to your question...
```

### Docker with Slack

```bash
docker run -d -p 3000:3000 \
  -e CLAUDE_CODE_PROXY_API_KEY=your_token \
  -e SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... \
  -e SLACK_CHANNEL=#monitoring \
  ghcr.io/moonsong-labs/claude-nexus-proxy:latest
```

### Cloudflare Workers with Slack

```bash
# Set Slack webhook as a secret
npx wrangler secret put SLACK_WEBHOOK_URL
# Enter: https://hooks.slack.com/services/...

# Set optional configuration
npx wrangler env put SLACK_CHANNEL "#claude-logs"
npx wrangler env put SLACK_USERNAME "Claude Proxy Bot"
```

## Token Usage Tracking

The proxy automatically tracks token usage per domain and displays statistics every 10 seconds (Node.js mode only).

### Features

- **Per-domain tracking**: Monitors input and output tokens for each domain
- **Request counting**: Tracks total requests per domain
- **Request type classification**:
  - **Query Evaluation**: Requests with exactly 1 system message
  - **Inference**: Requests with more than 1 system message
- **Tool call tracking**: Counts tool use in responses
- **Automatic reporting**: Prints statistics every 10 seconds to console
- **API endpoint**: Access current stats via `/token-stats`
- **Zero configuration**: Starts automatically, no setup required

### Console Output Example

```
Token usage tracking started (reporting every 10s)
==========================================================================================

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

Get current token statistics programmatically:

```bash
curl http://localhost:3000/token-stats
```

Response:
```json
{
  "status": "ok",
  "stats": {
    "claude-1.example.com": {
      "inputTokens": 5234,
      "outputTokens": 8921,
      "requestCount": 12,
      "queryEvaluationCount": 8,
      "inferenceCount": 4,
      "toolCallCount": 3,
      "lastUpdated": 1705157123456
    },
    "claude-2.example.com": {
      "inputTokens": 3456,
      "outputTokens": 6789,
      "requestCount": 8,
      "queryEvaluationCount": 5,
      "inferenceCount": 3,
      "toolCallCount": 0,
      "lastUpdated": 1705157120789
    }
  },
  "timestamp": "2025-01-13T15:45:23.456Z"
}
```

### Limitations

- **Cloudflare Workers**: Periodic console reporting is not available due to Workers' stateless nature. Use the `/token-stats` endpoint instead.
- **Memory-based**: Statistics are stored in memory and reset when the proxy restarts.
- **No persistence**: For long-term tracking, consider using the telemetry endpoint feature.

### Integration with Monitoring

You can poll the `/token-stats` endpoint from your monitoring system to:
- Set up alerts for high token usage
- Track costs per domain/team
- Generate usage reports
- Implement rate limiting based on token consumption

## Client Setup Files

The proxy serves client configuration files from the `/client-setup` endpoint:

```bash
# Download client credentials
curl -O http://localhost:3000/client-setup/credentials.json

# Or with authentication if needed
curl -H "Authorization: Bearer your-token" \
     -O http://localhost:3000/client-setup/credentials.json
```

Place your client setup files in the `client-setup/` directory, and they will be:
- Automatically included in Docker builds
- Served with appropriate content types
- Protected against directory traversal attacks
- Cached for 1 hour by default

## GitHub Actions Integration

Enable `@claude` mentions in issues and PRs:

```yaml
name: Claude PR Assistant
on:
  issue_comment:
    types: [created]
  pull_request:
    types: [opened, synchronize]

jobs:
  claude-code-action:
    if: contains(github.event.comment.body, '@claude') || github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    services:
      claude-code-proxy:
        image: ghcr.io/moonsong-labs/claude-nexus-proxy:latest
        ports:
          - 3000:3000
        env:
          CLAUDE_CODE_PROXY_API_KEY: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - name: Run Claude PR Action
        uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: ${{ secrets.GITHUB_TOKEN }}
        env:
          ANTHROPIC_BASE_URL: http://localhost:3000
```

## Usage Examples

### Claude Code with Cloudflare Workers

Once you have deployed the proxy to Cloudflare Workers:

```bash
# Set your Worker URL as the API base
export ANTHROPIC_BASE_URL=https://claude-proxy.your-subdomain.workers.dev

# Use Claude Code for various tasks
claude "Review this JavaScript function for potential bugs"
claude "Generate TypeScript interfaces for this API response"
claude "Optimize this React component for better performance"
claude "Explain what this complex regex pattern does"

# Use with specific files
claude "Check this package.json for security vulnerabilities" package.json
claude "Suggest improvements for this README" README.md
```

### Direct API Usage

You can also use the proxy directly with HTTP requests:

```bash
# Health check
curl https://claude-proxy.your-subdomain.workers.dev

# Send a message (example)
curl -X POST https://claude-proxy.your-subdomain.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Hello, Claude!"
      }
    ]
  }'
```

## API Endpoints

- `GET /` - Health check and configuration status
- `GET /token-stats` - Current token usage statistics per domain
- `GET /client-setup/:filename` - Download client setup files
- `POST /v1/messages` - Claude API proxy endpoint with OpenAI compatibility

## Architecture

The proxy handles:
- **Message Translation**: Converts Claude's nested content structure to OpenAI's flat format
- **Tool Call Mapping**: Transforms `tool_use`/`tool_result` to `tool_calls`/`tool` roles
- **Schema Transformation**: Removes `format: 'uri'` constraints for compatibility
- **Streaming**: SSE support for real-time responses
- **Model Selection**: Dynamic routing based on request characteristics
- **Static File Serving**: Serves client configuration files from `/client-setup` endpoint

## Supported Providers

- **GitHub Models** (default) - Uses GitHub token for authentication
- **OpenRouter** - Supports various open-source models
- **Custom OpenAI-compatible APIs** - Any API following OpenAI format

---

Built with [Bun](https://bun.sh) and [Hono](https://hono.dev/)
