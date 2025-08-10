# Docker Compose - Critical Non-Obvious Configurations

## ⚠️ CRITICAL: Essential Environment Variables

**NEVER deploy without these:**

```bash
# .env file - MANDATORY
DASHBOARD_API_KEY=your-secure-dashboard-key  # CRITICAL SECURITY
DATABASE_URL=postgresql://user:pass@postgres:5432/claude_nexus
```

## Non-Intuitive Service Dependencies

**Critical dependency pattern with health checks:**

```yaml
proxy:
  depends_on:
    postgres:
      condition: service_healthy # Waits for actual DB readiness, not just container start
```

## Docker Profiles - Advanced Usage

**Use profiles to control service sets:**

```bash
# Start only core services (default)
docker compose up -d

# Include Claude CLI integration
docker compose --profile cli up -d

# Include development tools
docker compose --profile dev --profile cli up -d
```

## Critical Production Configuration Patterns

**Essential security volume mount (read-only credentials):**

```yaml
proxy:
  volumes:
    - ./credentials:/app/credentials:ro # Read-only prevents container modification
```

**Non-obvious timeout configuration for long Claude requests:**

```yaml
proxy:
  environment:
    CLAUDE_API_TIMEOUT: 600000 # 10 minutes for Claude API
    PROXY_SERVER_TIMEOUT: 660000 # 11 minutes server timeout (must be > Claude timeout)
```

**Critical database health check pattern:**

```yaml
postgres:
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U postgres']
    interval: 10s
    timeout: 5s
    retries: 5 # Ensures DB is actually ready
```

## Critical Production Patterns

**Network isolation (internal database access only):**

```yaml
networks:
  backend:
    driver: bridge
    internal: true # Database not accessible from outside

postgres:
  networks:
    - backend
  # Remove ports mapping in production
```

**Essential resource limits for production:**

```yaml
proxy:
  deploy:
    resources:
      limits:
        memory: 2G # Prevent memory exhaustion
        cpus: '2.0'
      reservations:
        memory: 512M # Guaranteed minimum
```

**Critical persistent volume configuration:**

```yaml
volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      device: /data/claude-nexus/postgres # Host directory for persistence
      o: bind
```

## Critical Troubleshooting Commands

**Check port conflicts (common startup issue):**

```bash
netstat -tlnp | grep -E '3000|3001|5432'
```

**Verify credential mounting:**

```bash
docker compose exec proxy ls -la /app/credentials
```

**Database connection test:**

```bash
docker compose exec proxy pg_isready -h postgres
```

**Essential maintenance commands:**

```bash
# Zero-downtime image updates
docker compose pull && docker compose up -d --force-recreate

# Database maintenance (run periodically)
docker compose exec postgres vacuumdb -U postgres -d claude_nexus -z

# Resource monitoring
docker stats --no-stream
```
