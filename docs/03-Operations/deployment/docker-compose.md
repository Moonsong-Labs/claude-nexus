# Docker Compose Deployment

Deploy Claude Nexus Proxy using Docker Compose for local development and testing.

## Overview

The Docker Compose setup includes:

- PostgreSQL database
- Proxy service (locally built)
- Dashboard service (locally built)
- Claude CLI integration
- pgAdmin for database management (optional)

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- Bun runtime (for building images)
- `.env` file configured

## Quick Start

### 1. Setup Environment

```bash
# Clone the repository
git clone https://github.com/Moonsong-Labs/claude-nexus-proxy.git
cd claude-nexus-proxy

# Copy and configure environment
cp .env.example .env
# Edit .env with your configuration
```

### 2. Create Credentials

```bash
# Create credentials directory
mkdir -p credentials

# Generate secure API key
bun run scripts/auth/generate-api-key.ts

# Create domain credentials (example)
cat > credentials/your-domain.com.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "acc_unique_id",
  "api_key": "sk-ant-your-claude-api-key",
  "client_api_key": "cnp_live_generated_key"
}
EOF
```

### 3. Start Services

```bash
# Build and start all services (recommended method)
./docker-up.sh build
./docker-up.sh up -d

# View logs
./docker-up.sh logs -f

# Stop services
./docker-up.sh down
```

The `docker-up.sh` script handles environment file loading and runs Docker Compose from the correct directory.

## Service Details

### Configuration Location

- Docker Compose file: `docker/docker-compose.yml`
- Environment variables: `.env` in project root
- Credentials: `credentials/` directory

### Available Services

1. **postgres** - PostgreSQL 15 database
   - Port: 5432
   - Database: claude_proxy
   - Auto-initialized with schema

2. **proxy** - Claude Nexus Proxy
   - Port: 3000
   - Built from local source
   - Connects to PostgreSQL

3. **dashboard** - Monitoring Dashboard
   - Port: 3001
   - Built from local source
   - Read-only database access

4. **claude-cli** - Claude CLI container
   - Interactive terminal
   - Connected to proxy service

5. **pgadmin** - Database management UI (optional)
   - Port: 5050
   - Default login: admin@example.com / admin

## Common Operations

### Access Services

```bash
# Proxy API
curl http://localhost:3000/health

# Dashboard
open http://localhost:3001

# Use Claude CLI
./docker-up.sh exec claude-cli claude "Hello"

# Database access
./docker-up.sh exec postgres psql -U postgres claude_proxy
```

### View Token Usage

```bash
# Monitor real-time usage
./docker-up.sh exec claude-cli monitor

# Check daily stats
./docker-up.sh exec claude-cli ccusage daily
```

### Database Operations

```bash
# Run migrations (example for a specific migration)
./docker-up.sh exec proxy bun run scripts/db/migrations/001-add-conversation-tracking.ts

# Access PostgreSQL
./docker-up.sh exec postgres psql -U postgres claude_proxy
```

## Troubleshooting

### Services Not Starting

1. Check port availability:

   ```bash
   lsof -i :3000,3001,5432
   ```

2. Verify credentials exist:

   ```bash
   ls -la credentials/
   ```

3. Check Docker logs:
   ```bash
   ./docker-up.sh logs proxy
   ```

### Database Connection Issues

```bash
# Test database connectivity
./docker-up.sh exec proxy pg_isready -h postgres

# Check database logs
./docker-up.sh logs postgres
```

## Environment Variables

Key variables in `.env`:

- `DASHBOARD_API_KEY` - Dashboard authentication
- `STORAGE_ENABLED` - Enable request storage (default: true)
- `DEBUG` - Enable debug logging
- `ENABLE_CLIENT_AUTH` - Require client API keys

See `.env.example` for complete list.

## Development Notes

- Images are built locally, not pulled from registry
- Data persists in Docker volumes
- All services auto-restart unless stopped
- Network isolation between services

For production deployment, see [AWS Infrastructure](../aws-infrastructure.md) documentation.
