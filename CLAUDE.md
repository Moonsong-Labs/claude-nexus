# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Claude Nexus Proxy - A high-performance proxy for Claude API with monitoring dashboard. Built with Bun and Hono framework, deployable as a unified Docker image.

## Architecture

### Monorepo Structure
```
claude-nexus-proxy/
├── packages/shared/      # Shared types and configurations
├── services/
│   ├── proxy/           # Proxy API service (Port 3000)
│   └── dashboard/       # Dashboard web service (Port 3001)
├── scripts/             # Utility scripts
├── docker-compose.yml   # Container orchestration
└── Dockerfile          # Unified Docker image
```

### Key Services

**Proxy Service** (`services/proxy/`)
- Direct API forwarding to Claude
- Multi-auth support (API keys, OAuth with auto-refresh)
- Token tracking and telemetry
- Request/response storage
- Slack notifications

**Dashboard Service** (`services/dashboard/`)
- Real-time monitoring UI
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

The project uses a **unified Docker image** with SERVICE environment variable:

```bash
# Run proxy only (production recommended)
docker run -e SERVICE=proxy -p 3000:3000 image:v5

# Run dashboard only (production recommended)
docker run -e SERVICE=dashboard -p 3001:3001 image:v5

# Run both (development/testing only)
docker run -e SERVICE=both -p 3000:3000 -p 3001:3001 image:v5
```

**Important:** SERVICE=both couples services in a single container, which is against microservices best practices. Use it only for local development or simple demos. For production, always run separate containers using Docker Compose.

## Key Implementation Details

### Authentication Flow
1. Check domain-specific credential files (`<domain>.credentials.json`)
2. Use Authorization header from request
3. Fall back to CLAUDE_API_KEY environment variable

### OAuth Support
- Auto-refresh tokens 1 minute before expiry
- Stores refreshed tokens back to credential files
- Adds `anthropic-beta: oauth-2025-04-20` header

### Token Tracking
- Per-domain statistics
- Request type classification (query evaluation vs inference)
- Tool call counting
- Available at `/token-stats` endpoint

### Storage
- PostgreSQL for request/response data
- Write-only access from proxy
- Read-only access from dashboard
- Automatic batch processing

### Debug Logging
When `DEBUG=true`:
- Logs full request/response (with sensitive data masked)
- Shows streaming chunks
- Masks patterns: `sk-ant-****`, `Bearer ****`

## Environment Variables

**Essential:**
- `CLAUDE_API_KEY` - Default API key (optional)
- `DATABASE_URL` - PostgreSQL connection
- `DASHBOARD_API_KEY` - Dashboard authentication

**Optional:**
- `DEBUG` - Enable debug logging
- `STORAGE_ENABLED` - Enable storage (default: false)
- `SLACK_WEBHOOK_URL` - Slack notifications
- `CREDENTIALS_DIR` - Domain credential directory

## Testing & Type Safety

**Type Checking:**
- Run `bun run typecheck` before committing
- Type checking is automatic during builds
- Fix all type errors before deploying

**Tests:**
Currently no automated tests. When implementing:
- Use Bun's built-in test runner
- Test proxy logic, telemetry, token tracking
- Test both streaming and non-streaming responses

## Important Notes

- Uses Bun runtime exclusively (no Node.js)
- Single Docker image for both services
- No TypeScript compilation (Bun runs TS directly)
- Model-agnostic (accepts any model name)

## Common Tasks

### Add Domain Credentials
```bash
echo '{"type": "api_key", "api_key": "sk-ant-..."}' > credentials/domain.com.credentials.json
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