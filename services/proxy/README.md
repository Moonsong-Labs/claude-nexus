# Claude Nexus Proxy Service

High-performance proxy service for Claude API with comprehensive monitoring, conversation tracking, and advanced features.

## Overview

- **Port**: 3000 (default, configurable via `PORT`)
- **Purpose**: Enterprise-grade proxy for Claude API with authentication, monitoring, and analytics
- **Architecture**: Built with Bun and Hono for minimal latency, using dependency injection
- **Storage**: Write-only PostgreSQL access with efficient batch processing

## Features

### Core Proxying

- **Direct API forwarding** - Minimal overhead proxying to Claude API
- **Streaming support** - Full SSE streaming with chunk storage
- **Long request support** - Configurable timeouts up to 10 minutes
- **Request retry** - Automatic retry with exponential backoff

### Authentication & Security

- **Multi-auth support** - API keys and OAuth with auto-refresh
- **Domain-based routing** - Credential mapping by request domain
- **Client authentication** - Optional API key authentication for proxy access
- **Timing-safe comparisons** - Secure credential verification

### Monitoring & Analytics

- **Conversation tracking** - Automatic message threading with branch detection
- **Sub-task detection** - Tracks Task tool invocations and relationships
- **Token usage tracking** - Per-account and per-domain metrics
- **5-hour rolling windows** - Claude API limit monitoring
- **Real-time telemetry** - SSE updates to dashboard

### Advanced Features

- **MCP server** - Model Context Protocol for prompt management
- **AI-powered analysis** - Background conversation insights (Gemini)
- **Slack notifications** - Error and usage alerts
- **Request storage** - Optional full request/response logging
- **Spark integration** - Technical recommendation feedback system

## Development

```bash
# Install dependencies (from project root)
bun install

# Run in development mode
bun run dev:proxy
# Or from service directory
cd services/proxy && bun run dev

# Type checking
bun run typecheck

# Run tests
bun test
# With coverage
bun test --coverage

# Build for production
bun run build:proxy

# Debug mode (verbose logging)
DEBUG=true bun run dev:proxy

# SQL query logging
DEBUG_SQL=true bun run dev:proxy
```

## Configuration

Configuration is managed through environment variables. See `.env.example` for a complete list.

### Essential Configuration

```bash
# Database (required for storage features)
DATABASE_URL=postgresql://user:pass@localhost:5432/claude_nexus

# Authentication
CREDENTIALS_DIR=./credentials
ENABLE_CLIENT_AUTH=true
API_KEY_SALT=your-secure-salt
```

### Performance & Timeouts

```bash
# Claude API timeout (default: 10 minutes)
CLAUDE_API_TIMEOUT=600000

# Server timeout (default: 11 minutes)
PROXY_SERVER_TIMEOUT=660000

# Slow query threshold for logging
SLOW_QUERY_THRESHOLD_MS=5000
```

### Storage & Monitoring

```bash
# Enable request/response storage
STORAGE_ENABLED=true

# Storage cleanup intervals
STORAGE_ADAPTER_CLEANUP_MS=300000
STORAGE_ADAPTER_RETENTION_MS=3600000
```

### MCP Server

```bash
# Enable Model Context Protocol
MCP_ENABLED=true
MCP_PROMPTS_DIR=./prompts
MCP_WATCH_FILES=true

# Optional GitHub sync
MCP_GITHUB_OWNER=your-org
MCP_GITHUB_REPO=prompt-library
MCP_GITHUB_TOKEN=ghp_xxxx
```

### AI Analysis Worker

```bash
# Enable background analysis
AI_WORKER_ENABLED=true
GEMINI_API_KEY=your-key
AI_WORKER_MAX_CONCURRENT_JOBS=3
```

### Integrations

```bash
# Slack notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Spark recommendations
SPARK_API_URL=https://api.spark.example
SPARK_API_KEY=your-spark-key
```

## API Endpoints

### Core Proxy Endpoints

#### `POST /v1/messages`

Main Claude API proxy endpoint with streaming support.

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-ant-..." \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'
```

### Token Usage Endpoints

#### `GET /api/token-usage/current`

Get current window usage (5-hour rolling window).

```bash
curl "http://localhost:3000/api/token-usage/current?accountId=acc_123&window=300"
```

#### `GET /api/token-usage/daily`

Get historical daily usage data.

```bash
curl "http://localhost:3000/api/token-usage/daily?accountId=acc_123&days=30"
```

### Conversation Endpoints

#### `GET /api/conversations`

Get conversations with branch information.

```bash
curl "http://localhost:3000/api/conversations?domain=example.com&limit=10"
```

### Analysis Endpoints

#### `POST /api/analyses`

Create AI analysis request for a conversation.

```bash
curl -X POST http://localhost:3000/api/analyses \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "uuid", "branchId": "main"}'
```

#### `GET /api/analyses/:conversationId/:branchId`

Get analysis status and results.

### MCP Endpoints

#### `POST /mcp`

Model Context Protocol JSON-RPC endpoint.

#### `GET /mcp`

MCP discovery endpoint.

### Utility Endpoints

#### `GET /health`

Health check endpoint.

#### `GET /token-stats`

Legacy token statistics (deprecated, use `/api/token-usage/*`).

#### `GET /client-setup/:filename`

Serve client configuration files.

## Architecture

### Dependency Injection

The proxy uses a container-based dependency injection pattern for modularity and testability:

#### Core Services

- **MessageController** - Request routing and response handling
- **ProxyService** - Core proxy logic and Claude API communication
- **StreamingService** - SSE streaming with chunk processing

#### Authentication

- **AuthenticationService** - Multi-auth support (API keys, OAuth)
- **CredentialManager** - Domain-based credential resolution
- **OAuthTokenRefresher** - Automatic token refresh logic

#### Conversation Tracking

- **ConversationLinker** - Message hashing and conversation threading
- **SubtaskQueryExecutor** - Task tool invocation detection
- **RequestByIdExecutor** - Parent request resolution

#### Storage & Analytics

- **StorageWriter** - Efficient batch writes to PostgreSQL
- **MetricsService** - Token tracking and telemetry
- **StorageAdapter** - Request ID mapping with cleanup

#### Advanced Features

- **MCPServer** - Model Context Protocol implementation
- **PromptRegistryService** - Prompt template management
- **AIAnalysisWorker** - Background conversation analysis
- **NotificationService** - Slack webhook integration

### Request Flow

1. **Authentication** - Domain extraction and credential verification
2. **Conversation Linking** - Message hashing and parent detection
3. **Proxy Forwarding** - Request enhancement and Claude API call
4. **Response Processing** - Streaming or JSON response handling
5. **Storage** - Async write to database with batching
6. **Telemetry** - Real-time updates via SSE

### Database Interaction

- **Write-only access** from proxy service
- **Batch processing** for efficiency
- **Partitioned tables** for token usage
- **GIN indexes** for JSONB queries

## Docker Deployment

### Building the Image

```bash
# From project root
./docker/build-images.sh

# Or manually
docker build -f docker/proxy/Dockerfile -t claude-nexus-proxy .
```

### Running with Docker

```bash
# Standalone
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -v ./credentials:/app/credentials \
  claude-nexus-proxy

# With docker-compose
./docker-up.sh up proxy
```

## Testing

### Unit Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/services/__tests__/conversation-linker.test.ts

# With coverage
bun test --coverage
```

### Test Sample Collection

Enable test sample collection for real request data:

```bash
COLLECT_TEST_SAMPLES=true bun run dev:proxy
```

Samples are stored in `test-samples/` with sensitive data masked.

## Troubleshooting

### Debug Logging

```bash
# Enable all debug logs
DEBUG=true bun run dev:proxy

# Only SQL queries
DEBUG_SQL=true bun run dev:proxy
```

### Common Issues

1. **Timeout errors** - Increase `CLAUDE_API_TIMEOUT` and `PROXY_SERVER_TIMEOUT`
2. **Authentication failures** - Check credential files and `ENABLE_CLIENT_AUTH`
3. **Storage not working** - Ensure `STORAGE_ENABLED=true` and database is accessible
4. **Conversation linking broken** - Check for system reminder filtering

## See Also

- [Main Project README](../../README.md) - Project overview
- [CLAUDE.md](../../CLAUDE.md) - Comprehensive project documentation
- [Dashboard Service](../dashboard/README.md) - Web UI documentation
- [ADRs](../../docs/04-Architecture/ADRs/) - Architectural decisions
