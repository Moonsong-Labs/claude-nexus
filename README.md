# Claude Nexus Proxy

A high-performance proxy for Claude API with monitoring dashboard, built with Bun and Hono.

## Features

- 🚀 **Direct API Proxy** - Transparent forwarding to Claude API
- 📊 **Web Dashboard** - Real-time monitoring and analytics (Port 3001)
- 🔐 **Multi-Auth Support** - API keys and OAuth with auto-refresh
- 📈 **Token Tracking** - Per-domain usage statistics
- 💾 **Request Storage** - PostgreSQL backend for history
- 🔔 **Slack Integration** - Optional notifications
- 🐳 **Docker Ready** - Separate optimized images for each service

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone and configure
git clone https://github.com/your-repo/claude-nexus-proxy
cd claude-nexus-proxy
cp .env.example .env
# Edit .env with your CLAUDE_API_KEY

# Start everything
./docker-up.sh up -d

# Use with Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000 claude "Help me with code"
```

Access:
- Proxy: http://localhost:3000
- Dashboard: http://localhost:3001 (requires DASHBOARD_API_KEY)

### Using Docker Images

The project uses separate Docker images for each service:

```bash
# Build images
./docker/build-images.sh

# Run proxy service
docker run -d -p 3000:3000 \
  -e CLAUDE_API_KEY=your-key \
  -v ./credentials:/app/credentials:ro \
  alanpurestake/claude-nexus-proxy:latest

# Run dashboard service
docker run -d -p 3001:3001 \
  -e DASHBOARD_API_KEY=your-key \
  -e PROXY_API_URL=http://localhost:3000 \
  alanpurestake/claude-nexus-dashboard:latest
```

See [docker/README.md](docker/README.md) for detailed Docker configuration.

### Local Development

```bash
# Install and run
bun install
bun run dev

# Or run individually
bun run dev:proxy      # Port 3000
bun run dev:dashboard  # Port 3001
```

## Configuration

### Essential Environment Variables

```bash
# Proxy Service
CLAUDE_API_KEY=sk-ant-api03-...    # Default API key (optional)
DATABASE_URL=postgresql://...       # For request storage
STORAGE_ENABLED=true               # Enable storage (default: false)

# Dashboard Service  
DASHBOARD_API_KEY=your-secret      # Required for dashboard access
DATABASE_URL=postgresql://...      # Same as proxy

# Optional
DEBUG=true                         # Enable debug logging
SLACK_WEBHOOK_URL=https://...      # Slack notifications
```

See `.env.example` for all options.

## Multi-Subscription Support

Users can provide their own API keys:

```bash
# Using API key
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-ant-api03-user-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'

# Using OAuth token
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer oauth-access-token" \
  -H "x-api-key: sk-ant-api03-..." \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}'
```

## Domain-Based Credentials

Map different domains to different API keys:

```bash
# Create credentials directory
mkdir -p credentials

# Add domain-specific credentials
echo '{"type": "api_key", "api_key": "sk-ant-..."}' > credentials/team1.example.com.credentials.json
echo '{"type": "api_key", "api_key": "sk-ant-..."}' > credentials/team2.example.com.credentials.json

# Set environment variable
export CREDENTIALS_DIR=credentials
```

OAuth credentials with auto-refresh:
```json
{
  "type": "oauth",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1705123456789,
    "scopes": ["user:inference"],
    "isMax": false
  }
}
```

## Token Usage Tracking

View real-time token usage:

```bash
# Console output every 10 seconds
# Or via API
curl http://localhost:3000/token-stats
```

## Dashboard Features

- Real-time request monitoring
- Token usage analytics
- Model distribution charts
- Request history with search
- Domain-based filtering
- Export capabilities

## API Endpoints

**Proxy Service (Port 3000)**
- `POST /v1/messages` - Claude API proxy
- `GET /health` - Health check
- `GET /token-stats` - Usage statistics

**Dashboard Service (Port 3001)**
- `GET /` - Web dashboard
- `GET /api/requests` - Query requests
- `GET /api/storage-stats` - Aggregated stats
- `GET /sse` - Real-time updates

## Development

```bash
# Install dependencies
bun install

# Run development mode
bun run dev

# Type checking (run before commits)
bun run typecheck

# Build for production (includes type checking)
bun run build

# Run tests (coming soon)
# bun test
```

### Type Safety

This project uses TypeScript with strict type checking. Always run type checks before committing:

```bash
# Check all workspaces
bun run typecheck

# Check specific service
bun run typecheck:proxy
bun run typecheck:dashboard

# CI-friendly type check
bun run typecheck:ci
```

## Architecture

- **Proxy Service**: Handles API forwarding and telemetry
- **Dashboard Service**: Provides monitoring UI
- **PostgreSQL**: Stores request/response data
- **Docker**: Unified image with SERVICE environment variable

## License

MIT

---

Built with [Bun](https://bun.sh) and [Hono](https://hono.dev)