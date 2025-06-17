# Migration Guide: v1.x to v2.0

## Overview

Version 2.0 refactors Claude Nexus Proxy into a microservices architecture with two separate services:

- **Proxy Service** (Port 3000) - API proxy functionality
- **Dashboard Service** (Port 3001) - Web UI and monitoring

## Breaking Changes

### Service Separation

- The monolithic application is now split into two services
- Dashboard is no longer embedded in the proxy service
- Each service runs on its own port

### Configuration Changes

- Dashboard now requires `DASHBOARD_API_KEY` for authentication
- Database configuration is required for both services
- Services can be configured independently

### API Changes

- Dashboard API endpoints moved from proxy to dashboard service
- Storage API endpoints now available on dashboard service
- Real-time SSE endpoint moved to dashboard service

## Migration Steps

### 1. Update Environment Variables

Create separate configurations for each service:

```bash
# Proxy Service (Port 3000)
PORT=3000
CLAUDE_API_KEY=sk-ant-api03-...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/claude_proxy
STORAGE_ENABLED=true

# Dashboard Service (Port 3001)
DASHBOARD_PORT=3001
DASHBOARD_API_KEY=your-secret-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/claude_proxy
```

### 2. Update Docker Deployment

Replace your existing Docker setup with the new docker-compose.yml:

```bash
# Stop old services
docker-compose down

# Pull latest changes
git pull

# Start new services
docker-compose up -d
```

### 3. Update Client Configurations

Update any clients or scripts that access the dashboard:

- Dashboard UI: `http://localhost:3001/`
- Storage API: `http://localhost:3001/api/requests`
- SSE endpoint: `http://localhost:3001/sse`

### 4. Database Migration

The database schema remains compatible. No migration needed.

## New Features

### Independent Scaling

- Services can be scaled independently
- Proxy can handle more load without affecting dashboard
- Dashboard can be disabled in production environments

### Enhanced Security

- Dashboard requires API key authentication
- Services have separate security boundaries
- Database access is properly isolated

### Better Performance

- Proxy service optimized for throughput
- Dashboard service optimized for real-time updates
- Reduced memory footprint per service

## Rollback Instructions

If you need to rollback to v1.x:

```bash
# Stop v2 services
docker-compose down

# Checkout previous version
git checkout v1.x

# Rebuild and start
docker build -t claude-nexus-proxy .
docker run -d -p 3000:3000 claude-nexus-proxy
```

## Support

For issues or questions:

- Check the [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed information
- Review logs: `docker-compose logs -f`
- Open an issue on GitHub
