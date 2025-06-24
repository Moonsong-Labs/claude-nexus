# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Claude Nexus Proxy - A high-performance proxy for Claude API with monitoring dashboard. Built with Bun and Hono framework, deployed as separate Docker images for each service.

## Architecture

### Monorepo Structure

```
claude-nexus-proxy/
├── packages/shared/      # Shared types and configurations
├── services/
│   ├── proxy/           # Proxy API service (Port 3000)
│   └── dashboard/       # Dashboard web service (Port 3001)
├── scripts/             # Utility scripts
├── docker/              # Docker configurations
│   ├── proxy/           # Proxy Dockerfile
│   └── dashboard/       # Dashboard Dockerfile
├── docker-compose.yml   # Container orchestration
├── .env                 # Proxy/Dashboard configuration
└── credentials/         # Domain credentials (Claude Auth, Slack, ...)


```

### Key Services

**Proxy Service** (`services/proxy/`)

- Direct API forwarding to Claude
- Multi-auth support (API keys, OAuth with auto-refresh)
- Token tracking and telemetry
- Request/response storage
- Slack notifications

**Dashboard Service** (`services/dashboard/`)

- Monitoring UI
- Analytics and usage charts
- Request history browser
- SSE for live updates

## Development

```bash
# Install dependencies
bun install

# Run both services
bun run dev

# Run individually
bun run dev:proxy      # Port 3000
bun run dev:dashboard  # Port 3001

# Build
bun run build
```

## Docker Deployment

The project uses **separate Docker images** for each service:

```bash
# Build images
./docker/build-images.sh

# Run proxy service
docker run -p 3000:3000 alanpurestake/claude-nexus-proxy:latest

# Run dashboard service
docker run -p 3001:3001 alanpurestake/claude-nexus-dashboard:latest
```

Docker configurations are in the `docker/` directory. Each service has its own optimized image for better security, scaling, and maintainability.

### Docker Compose Environment

docker/docker-compose.yml: Postgres + Proxy + Dashboard + Claude CLI (with ccusage and token monitoring). `./docker-up.sh` script is used instead of `docker compose -f ...` to ensure `.env` is loaded properly.

```bash
# Build the local images
./docker-up.sh build

# Run the full environment (requires real Claude account in )
./docker-up.sh up -d

# Run a claude query
./docker-up.sh exec claude-cli claude "hi"

# Run usage monitor for real-time tracking
./docker-up.sh exec claude-cli monitor

# Check daily usage stats
./docker-up.sh exec claude-cli ccusage daily
```

## Key Implementation Details

### Request Timeout Configuration

The proxy supports long-running Claude API requests with configurable timeouts:

- **Default timeout**: 10 minutes (600,000ms) for Claude API requests
- **Server timeout**: 11 minutes (660,000ms) to prevent premature connection closure
- **Retry timeout**: Slightly longer than request timeout to allow for retries
- Configure via `CLAUDE_API_TIMEOUT` and `PROXY_SERVER_TIMEOUT` environment variables

### Conversation Tracking & Branching

The proxy automatically tracks conversations and detects branches using message hashing:

**How it works:**

1. Each message in a request is hashed using SHA-256
2. The current message hash and parent message hash (previous message) are stored
3. Requests are linked into conversations by matching parent/child relationships
4. Conversations support branching (like git) when resumed from earlier points
5. Branches are automatically detected when multiple requests share the same parent
6. When multiple conversations have the same parent hash, the system picks the conversation with the fewest requests to continue
7. Messages continue on the same branch as their parent unless they create a new branch point

**Message Normalization:**

- String content and array content are normalized to produce consistent hashes
- Example: `"hello"` and `[{type: "text", text: "hello"}]` produce the same hash
- This ensures conversations link correctly regardless of content format

**API Endpoints:**

- `/api/conversations` - Get conversations grouped by conversation_id with branch information
- Query parameters: `domain` (filter by domain), `limit` (max conversations)

**Database Schema:**

- `conversation_id` - UUID identifying the conversation
- `current_message_hash` - Hash of the last message in the request
- `parent_message_hash` - Hash of the previous message (null for first message)
- `branch_id` - Branch identifier (defaults to 'main', auto-generated for new branches)

**Dashboard Features:**

- **Conversations View** - Visual timeline showing message flow and branches
- **Branch Visualization** - Blue nodes indicate branch points
- **Branch Labels** - Non-main branches are labeled with their branch ID
- **Conversation Grouping** - All related requests grouped under one conversation

### Authentication Flow

**Client Authentication (Proxy Level):**

1. Extract domain from Host header
2. Check for `client_api_key` in domain credential file
3. Verify Bearer token against stored key using timing-safe comparison
4. Return 401 Unauthorized if invalid

**Claude API Authentication:**

1. Check domain-specific credential files (`<domain>.credentials.json`)
2. Use Authorization header from request

### OAuth Support

- Auto-refresh tokens 1 minute before expiry
- Stores refreshed tokens back to credential files
- Adds `anthropic-beta: oauth-2025-04-20` header

### Token Tracking

**In-Memory Tracking (Legacy)**

- Per-domain statistics
- Request type classification (query evaluation vs inference)
- Tool call counting
- Available at `/token-stats` endpoint

**Comprehensive Token Usage Tracking (New)**

- Tracks ALL request types (including query_evaluation and quota)
- Persistent storage in partitioned `token_usage` table
- 5-hour rolling window support for monitoring Claude API limits
- Per-account AND per-domain tracking
- API endpoints:
  - `/api/token-usage/current` - Current window usage
  - `/api/token-usage/daily` - Historical daily usage data
  - `/api/conversations` - Conversations with account info
- **Note**: Rate limiting is handled by Claude API directly. The proxy only tracks and displays usage statistics.

### Storage

- PostgreSQL for request/response data
- Write-only access from proxy
- Read-only access from dashboard
- Automatic batch processing
- **Conversation Grouping**: Requests are automatically grouped by conversation using message hashing

### Debug Logging

When `DEBUG=true`:

- Logs full request/response (with sensitive data masked)
- Shows streaming chunks
- Masks patterns: `sk-ant-****`, `Bearer ****`

## Environment Variables

**Essential:**

- `DATABASE_URL` - PostgreSQL connection
- `DASHBOARD_API_KEY` - Dashboard authentication

**Optional:**

- `DEBUG` - Enable debug logging
- `STORAGE_ENABLED` - Enable storage (default: false)
- `SLACK_WEBHOOK_URL` - Slack notifications
- `CREDENTIALS_DIR` - Domain credential directory
- `COLLECT_TEST_SAMPLES` - Collect request samples for testing (default: false)
- `TEST_SAMPLES_DIR` - Directory for test samples (default: test-samples)
- `ENABLE_CLIENT_AUTH` - Enable client API key authentication (default: true). Set to false to allow anyone to use the proxy without authentication
- `DASHBOARD_CACHE_TTL` - Dashboard cache TTL in seconds (default: 30). Set to 0 to disable caching
- `SLOW_QUERY_THRESHOLD_MS` - Threshold in milliseconds for logging slow SQL queries (default: 5000)
- `CLAUDE_API_TIMEOUT` - Timeout for Claude API requests in milliseconds (default: 600000 / 10 minutes)
- `PROXY_SERVER_TIMEOUT` - Server-level timeout in milliseconds (default: 660000 / 11 minutes)

## Important Notes

### Request Metadata

- Query evaluation and quota are not part of the conversation, they serve as metadata queries

## Testing & Type Safety

**Type Checking:**

- Run `bun run typecheck` before committing
- Type checking is automatic during builds
- Fix all type errors before deploying

**Test Sample Collection:**
The proxy can collect real request samples for test development:

- Enable with `COLLECT_TEST_SAMPLES=true`
- Samples are stored in `test-samples/` directory
- Each request type gets its own file (e.g., `inference_streaming_opus.json`)
- Sensitive data is automatically masked
- Samples include headers, body, and metadata

**Tests:**
Currently no automated tests. When implementing:

- Use Bun's built-in test runner
- Test proxy logic, telemetry, token tracking
- Test both streaming and non-streaming responses
- Use collected samples as test data

## Important Notes

- Uses Bun runtime exclusively (no Node.js)
- Separate Docker images for each service
- TypeScript compilation for production builds
- Model-agnostic (accepts any model name)

## Database Schema

### Main Tables

**api_requests** - Stores all API requests and responses with token tracking:

- `account_id` - Account identifier from credential files for per-account tracking
- `input_tokens`, `output_tokens`, `total_tokens` - Token usage metrics
- `conversation_id`, `branch_id` - Conversation tracking
- `current_message_hash`, `parent_message_hash` - Message linking

**streaming_chunks** - Stores streaming response chunks

### Account-Based Token Tracking

Token usage is tracked directly in the `api_requests` table:

- Each request is associated with an `account_id` from the credential file
- Token counts are stored per request for accurate tracking
- Queries aggregate usage by account and time window

## Common Tasks

### Add Domain Credentials

```bash
# Generate secure client API key
bun run scripts/generate-api-key.ts

# Create credential file
cat > credentials/domain.com.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "acc_f9e1c2d3b4a5",  # Unique account identifier
  "api_key": "sk-ant-...",
  "client_api_key": "cnp_live_..."
}
EOF
```

### Enable Storage

```bash
export STORAGE_ENABLED=true
export DATABASE_URL=postgresql://...
```

### View Token Stats

```bash
curl http://localhost:3000/token-stats
```

### Access Dashboard

```bash
open http://localhost:3001
# Use DASHBOARD_API_KEY for authentication
```

### Check Token Usage

```bash
# Current 5-hour window usage
curl "http://localhost:3000/api/token-usage/current?accountId=acc_f9e1c2d3b4a5&window=300" \
  -H "Authorization: Bearer $DASHBOARD_API_KEY"

# Daily usage (last 30 days)
curl "http://localhost:3000/api/token-usage/daily?accountId=acc_f9e1c2d3b4a5&aggregate=true" \
  -H "Authorization: Bearer $DASHBOARD_API_KEY"

# View conversations
curl "http://localhost:3000/api/conversations?accountId=acc_f9e1c2d3b4a5" \
  -H "Authorization: Bearer $DASHBOARD_API_KEY"
```
