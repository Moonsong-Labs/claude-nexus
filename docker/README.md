# Claude Nexus Docker Images

This directory contains the Docker configurations for the Claude Nexus Proxy project, split into two separate microservices following best practices.

## Images

### 1. Proxy Service (`alanpurestake/claude-nexus-proxy`)
- Port: 3000
- Handles Claude API proxying
- Manages authentication and token tracking
- Stores request/response data

### 2. Dashboard Service (`alanpurestake/claude-nexus-dashboard`)
- Port: 3001
- Web UI for monitoring and analytics
- Real-time SSE updates
- Request history browser

## Building Images

```bash
# Build both images
./build-images.sh

# Or build individually
docker build -f proxy/Dockerfile -t alanpurestake/claude-nexus-proxy:latest ..
docker build -f dashboard/Dockerfile -t alanpurestake/claude-nexus-dashboard:latest ..
```

## Running Services

### Using Docker Compose (Recommended)
```bash
# From project root
docker-compose up

# Or run specific service
docker-compose up proxy
docker-compose up dashboard
```

### Running Individually
```bash
# Proxy service
docker run -p 3000:3000 \
  -e CLAUDE_API_KEY=your-key \
  -v ./credentials:/app/credentials:ro \
  alanpurestake/claude-nexus-proxy:latest

# Dashboard service
docker run -p 3001:3001 \
  -e DASHBOARD_API_KEY=your-key \
  -e PROXY_API_URL=http://localhost:3000 \
  alanpurestake/claude-nexus-dashboard:latest
```

## Environment Variables

### Proxy Service
- `CLAUDE_API_KEY` - Default API key
- `DATABASE_URL` - PostgreSQL connection
- `STORAGE_ENABLED` - Enable storage (default: false)
- `SLACK_WEBHOOK_URL` - Slack notifications
- `CREDENTIALS_DIR` - Domain credential directory

### Dashboard Service
- `DASHBOARD_API_KEY` - Dashboard authentication
- `PROXY_API_URL` - Proxy API endpoint
- `DATABASE_URL` - PostgreSQL connection (read-only)

## Architecture Benefits

Splitting into separate images provides:
- **Independent scaling** - Scale proxy and dashboard separately
- **Smaller images** - Each service only includes what it needs
- **Better security** - Reduced attack surface
- **Easier maintenance** - Update services independently
- **Resource efficiency** - Run only what you need

## Image Details

Both images use:
- Multi-stage builds for optimization
- Bun runtime for performance
- Alpine Linux base for minimal size
- Health checks for container orchestration
- Non-root user for security