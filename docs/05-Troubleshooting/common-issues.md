# Troubleshooting & Debugging - Consolidated Guide

## ⚠️ Critical Issues - Most Common

### 1. Dashboard Exposed (SECURITY CRITICAL)

**Error:** Dashboard accessible without login
**Impact:** ALL conversation data exposed
**Check:** `curl your-server:3001/dashboard` - if you see UI without auth, it's exposed
**Fix:** Set `DASHBOARD_API_KEY` in .env immediately

### 2. Authentication Error: Invalid x-api-key

**Error Message:** `authentication_error: invalid x-api-key`

**Critical debugging steps:**

```bash
# Test Claude API key directly (bypass proxy)
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk-ant-YOUR-KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-3-sonnet-20240229", "max_tokens": 10, "messages": [{"role": "user", "content": "Hi"}]}'

# Check credential file exists and matches domain
ls -la credentials/your-domain.credentials.json

# Verify proxy domain routing
docker compose logs proxy | grep -i "domain\|credential"
```

### 3. Database Connection Issues

**Error:** `Database configuration is required for dashboard service`

**Non-obvious fixes:**

```bash
# Check if PostgreSQL is actually ready (not just container started)
docker compose exec postgres pg_isready -U postgres

# Test connection string format (common SSL issues)
psql "postgresql://user:pass@host:5432/dbname?sslmode=require" -c "SELECT 1"

# Initialize database schema if missing
docker compose exec proxy bun run scripts/init-database.ts
```

## Advanced Debugging Techniques

### Enable Debug Mode for Specific Issues

**Authentication debugging:**

```bash
DEBUG=true AUTH_DEBUG=true bun run dev:proxy
docker compose logs proxy | grep -i auth
```

**OAuth debugging:**

```bash
# Test OAuth token refresh separately
bun run scripts/test-oauth-refresh.ts <refresh_token>

# Monitor OAuth auto-refresh
docker compose logs -f proxy | grep -i oauth
```

**Database query debugging:**

```bash
# Log slow queries (> 100ms)
docker compose exec postgres psql -U postgres -c "
  ALTER SYSTEM SET log_min_duration_statement = 100;
  SELECT pg_reload_conf();
"

# View slow query logs
docker compose logs postgres | grep -i statement
```

### Memory and Performance Issues

**Memory leak detection:**

```bash
# Monitor memory usage over time
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Check for growing timeline data (dashboard memory leak)
docker compose exec postgres psql -U postgres claude_nexus -c "
  SELECT COUNT(*), DATE(timestamp)
  FROM api_requests
  GROUP BY DATE(timestamp)
  ORDER BY DATE(timestamp) DESC LIMIT 7;
"
```

### Request Tracing and Analysis

**Trace specific request through system:**

```bash
# Enable request correlation IDs
DEBUG=true bun run dev:proxy

# Extract specific request logs
REQUEST_ID="your-request-id"
docker compose logs proxy | grep $REQUEST_ID > request_debug.log

# Analyze streaming chunks
docker compose exec postgres psql -U postgres claude_nexus -c "
  SELECT request_id, chunk_index, LENGTH(content), created_at
  FROM streaming_chunks
  WHERE request_id = '$REQUEST_ID'
  ORDER BY chunk_index;
"
```

### Network and Connectivity Issues

**Proxy request debugging:**

```bash
# Test with verbose curl to see full request/response flow
curl -v -X POST http://localhost:3000/v1/messages \
  -H "Host: your-domain.com" \
  -H "Authorization: Bearer your-client-key" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}]}'

# Check port conflicts
netstat -tlnp | grep -E '3000|3001|5432'

# Verify service health
docker compose ps
for service in proxy dashboard postgres; do
  echo "=== $service ==="
  docker compose exec $service sh -c 'echo "Service reachable"' 2>/dev/null || echo "Service unreachable"
done
```

## Critical Production Issues

### Service Won't Start

**Common non-obvious causes:**

1. **Credential mounting issues:** `docker compose exec proxy ls -la /app/credentials`
2. **Database not ready:** `docker compose exec proxy pg_isready -h postgres`
3. **Environment variable issues:** `docker compose config` to verify resolution

### Performance Degradation

**Systematic diagnosis:**

```bash
# Check database performance
docker compose exec postgres psql -U postgres -c "
  SELECT pid, state, query_start, wait_event_type, wait_event, LEFT(query, 120)
  FROM pg_stat_activity
  WHERE datname = 'claude_nexus'
  ORDER BY query_start DESC
  LIMIT 15;
"

# Monitor proxy response times
docker compose logs proxy | grep -E "duration_ms|slow" | tail -20

# Check for connection pool exhaustion
docker compose exec postgres psql -U postgres -c "
  SELECT state, COUNT(*)
  FROM pg_stat_activity
  WHERE datname = 'claude_nexus'
  GROUP BY state;
"
```

## Emergency Recovery Commands

**Service recovery:**

```bash
# Force container recreation
docker compose up -d --force-recreate proxy

# Database recovery check
docker compose exec postgres psql -U postgres claude_nexus -c "
  SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
  FROM pg_stat_user_tables
  ORDER BY n_tup_ins DESC;
"

# Clear problematic data (use with caution)
docker compose exec postgres psql -U postgres claude_nexus -c "
  DELETE FROM streaming_chunks WHERE created_at < NOW() - INTERVAL '7 days';
  VACUUM ANALYZE;
"
```

**Configuration validation:**

```bash
# Validate all critical environment variables
docker compose exec proxy bun eval "
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'MISSING');
console.log('DASHBOARD_API_KEY:', process.env.DASHBOARD_API_KEY ? 'SET' : 'MISSING');
console.log('STORAGE_ENABLED:', process.env.STORAGE_ENABLED);
"
```
