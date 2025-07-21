# Performance Troubleshooting

This guide helps identify and resolve performance issues in Claude Nexus Proxy.

## Quick Diagnosis Checklist

1. **Check Dashboard Metrics**: Review P95/P99 latencies at http://localhost:3001
2. **Database Health**: Run `SELECT COUNT(*) FROM pg_stat_activity;` to check connections
3. **Logs**: Check for slow query warnings with `DEBUG_SQL=true`
4. **Token Usage**: Monitor via `/api/token-usage/current` endpoint
5. **System Resources**: Use `docker stats` to check CPU/memory usage

## Common Performance Issues

### High Response Latency

#### Symptoms

- Requests taking longer than 10 seconds
- Dashboard showing high P95/P99 latencies
- User complaints about slow responses

#### Diagnosis

1. **Check Database Performance**

```sql
-- Long running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - query_start) > interval '5 seconds'
AND state = 'active';

-- Query execution stats
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

2. **Identify Slow Endpoints**

```sql
-- Slowest requests by duration
SELECT
  method,
  path,
  AVG(duration_ms) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  AVG(first_token_ms) as avg_first_token_ms,
  COUNT(*) as request_count
FROM api_requests
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND duration_ms IS NOT NULL
GROUP BY method, path
ORDER BY avg_duration_ms DESC
LIMIT 10;
```

3. **Check Resource Usage**

```bash
# System resources
docker stats

# Database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check for stuck requests
psql -c "SELECT request_id, domain, created_at, duration_ms
         FROM api_requests
         WHERE response_status IS NULL
         AND created_at < NOW() - INTERVAL '10 minutes';"
```

#### Solutions

1. **Database Optimization**

```sql
-- Add missing indexes
-- These indexes are already created in the init-database.sql
-- Verify they exist:
SELECT indexname FROM pg_indexes WHERE tablename = 'api_requests';

-- If missing, create them:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_requests_created_at ON api_requests(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_requests_domain ON api_requests(domain);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_requests_conversation ON api_requests(conversation_id, created_at);

-- Update statistics
ANALYZE api_requests;
ANALYZE streaming_chunks;
```

2. **Query Optimization**

Fix the N+1 query issue in conversations endpoint:

```typescript
// Before (N+1 problem)
const conversations = await getConversations()
for (const conv of conversations) {
  conv.latestRequest = await getLatestRequest(conv.id)
}

// After (single query)
const conversations = await db.raw(`
  WITH latest_requests AS (
    SELECT DISTINCT ON (conversation_id) 
      conversation_id,
      id as latest_request_id
    FROM api_requests
    ORDER BY conversation_id, created_at DESC
  )
  SELECT c.*, lr.latest_request_id
  FROM conversations c
  LEFT JOIN latest_requests lr ON c.id = lr.conversation_id
`)
```

3. **Connection Pooling**

```typescript
// Optimize pool settings
const pool = new Pool({
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

### Memory Issues

#### Symptoms

- Increasing memory usage over time
- Service crashes with OOM errors
- Performance degradation after running for days

#### Diagnosis

```bash
# Monitor memory usage
docker stats proxy --no-stream

# Check Bun memory usage
bun --print memory
```

#### Solutions

1. **Configure Request ID Cleanup**

The proxy automatically cleans up request ID mappings. Configure via environment variables:

```bash
# .env configuration
STORAGE_ADAPTER_CLEANUP_MS=300000    # Cleanup interval (default: 5 minutes)
STORAGE_ADAPTER_RETENTION_MS=3600000 # Retention time (default: 1 hour)
```

2. **Monitor Cleanup Performance**

Enable debug logging to see cleanup operations:

```bash
DEBUG=true bun run dev:proxy
# Look for "Cleaned up X orphaned request IDs" messages
```

### Database Performance

#### Symptoms

- Slow query warnings in logs
- Database CPU at 100%
- Connection pool exhaustion

#### Diagnosis

```sql
-- Table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Missing indexes
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  most_common_vals
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100
AND tablename IN ('api_requests', 'streaming_chunks');
```

#### Solutions

1. **Vacuum and Analyze**

```bash
# Manual vacuum
docker compose exec postgres vacuumdb -U postgres -d claude_nexus_proxy -z

# Configure autovacuum
psql -c "ALTER TABLE api_requests SET (autovacuum_vacuum_scale_factor = 0.1);"
psql -c "ALTER TABLE streaming_chunks SET (autovacuum_vacuum_scale_factor = 0.1);"
```

2. **Partition Large Tables**

```sql
-- Partition api_requests by month
CREATE TABLE api_requests_2024_01 PARTITION OF api_requests
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE api_requests_2024_02 PARTITION OF api_requests
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

3. **Optimize PostgreSQL Configuration**

```ini
# postgresql.conf
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
```

### High Token Usage

#### Symptoms

- Unexpectedly high token consumption
- Hitting rate limits frequently
- High costs

#### Diagnosis

```sql
-- Find high token usage by account
SELECT
  account_id,
  domain,
  model,
  request_type,
  AVG(total_tokens) as avg_tokens,
  MAX(total_tokens) as max_tokens,
  SUM(total_tokens) as total_tokens_used,
  COUNT(*) as request_count
FROM api_requests
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND total_tokens > 0
GROUP BY account_id, domain, model, request_type
ORDER BY total_tokens_used DESC;

-- Check 5-hour rolling window usage
SELECT
  account_id,
  SUM(total_tokens) as tokens_in_window,
  COUNT(*) as requests_in_window
FROM api_requests
WHERE created_at > NOW() - INTERVAL '5 hours'
GROUP BY account_id
ORDER BY tokens_in_window DESC;
```

#### Solutions

1. **Monitor Token Usage**

Use the dashboard or API endpoints:

```bash
# Current 5-hour window
curl "http://localhost:3000/api/token-usage/current?accountId=acc_xxx" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Daily usage history
curl "http://localhost:3000/api/token-usage/daily?accountId=acc_xxx" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

2. **Configure Timeouts**

Prevent runaway requests:

```bash
# .env configuration
CLAUDE_API_TIMEOUT=600000      # 10 minutes for Claude API
PROXY_SERVER_TIMEOUT=660000    # 11 minutes for server
```

## Performance Optimization Strategies

### 1. Database Optimization

#### Enable SQL Query Logging

Identify slow queries:

```bash
# Enable SQL debug logging
DEBUG_SQL=true bun run dev:proxy

# Configure slow query threshold (default: 5000ms)
SLOW_QUERY_THRESHOLD_MS=3000
```

#### Optimize Common Queries

The system includes optimized queries for:

- Conversation tracking with proper indexes
- Sub-task detection using JSONB containment
- Token usage aggregation with window functions

See [ADR-007](../04-Architecture/ADRs/adr-007-subtask-tracking.md) and [ADR-044](../04-Architecture/ADRs/adr-044-subtask-query-executor-pattern.md) for implementation details.

### 2. Request Optimization

#### Configure Timeouts

```bash
# Environment variables
CLAUDE_API_TIMEOUT=600000           # Claude API timeout (10 min)
PROXY_SERVER_TIMEOUT=660000         # Server timeout (11 min)
AI_ANALYSIS_GEMINI_REQUEST_TIMEOUT_MS=60000  # AI analysis timeout
```

#### Dashboard Caching

```bash
# Configure dashboard cache TTL
DASHBOARD_CACHE_TTL=30  # Cache responses for 30 seconds
DASHBOARD_CACHE_TTL=0   # Disable caching for development
```

### 3. Resource Management

#### Connection Pooling

The system uses PostgreSQL connection pooling. Monitor active connections:

```sql
-- Check connection count by state
SELECT state, COUNT(*)
FROM pg_stat_activity
GROUP BY state;

-- Identify long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
AND now() - query_start > interval '30 seconds';
```

## Monitoring Performance

### Built-in Dashboard

Access the performance dashboard at http://localhost:3001:

1. **Analytics Page**: View request latencies, token usage, and error rates
2. **Real-time Updates**: SSE-powered live metrics
3. **Conversation View**: Track request chains and sub-tasks

### Key Metrics to Track

1. **Response Times**
   - `duration_ms`: Total request duration
   - `first_token_ms`: Time to first token (streaming)
   - Monitor via dashboard analytics

2. **Token Usage**
   - Per-account tracking
   - 5-hour rolling windows
   - Daily aggregations

3. **Database Performance**
   - Query execution time (with `DEBUG_SQL=true`)
   - Connection pool usage
   - Slow query alerts

### API Monitoring Endpoints

```bash
# Token usage statistics
curl "http://localhost:3000/api/token-usage/current?window=300" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Conversation analytics
curl "http://localhost:3000/api/conversations?limit=50" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Request details
curl "http://localhost:3000/api/requests/:requestId" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

## Prevention Strategies

### 1. Proactive Monitoring

- Enable `DEBUG_SQL=true` in development to catch slow queries early
- Set up alerts for high token usage patterns
- Monitor dashboard metrics regularly
- Review conversation trees for unusual patterns

### 2. Configuration Best Practices

```bash
# Recommended production settings
STORAGE_ENABLED=true
DEBUG=false
DEBUG_SQL=false
SLOW_QUERY_THRESHOLD_MS=5000
DASHBOARD_CACHE_TTL=30
CLAUDE_API_TIMEOUT=600000
PROXY_SERVER_TIMEOUT=660000
```

### 3. Regular Maintenance

- Run `VACUUM ANALYZE` on PostgreSQL weekly
- Monitor disk space for database growth
- Review and optimize slow queries monthly
- Archive old conversation data quarterly

See [Database Maintenance](../03-Operations/database.md) for detailed procedures.

## Related Documentation

- [Common Issues](./common-issues.md) - General troubleshooting guide
- [Debugging Guide](./debugging.md) - Debug logging and tracing
- [Database Operations](../03-Operations/database.md) - Database maintenance procedures
- [Monitoring Setup](../03-Operations/monitoring.md) - Comprehensive monitoring guide
- [Environment Variables](../06-Reference/environment-vars.md) - Complete configuration reference

## Relevant ADRs

- [ADR-006: Long Running Requests](../04-Architecture/ADRs/adr-006-long-running-requests.md) - Timeout configuration
- [ADR-005: Token Usage Tracking](../04-Architecture/ADRs/adr-005-token-usage-tracking.md) - Token tracking implementation
- [ADR-014: SQL Query Logging](../04-Architecture/ADRs/adr-014-sql-query-logging.md) - Debug SQL features
- [ADR-044: Subtask Query Executor Pattern](../04-Architecture/ADRs/adr-044-subtask-query-executor-pattern.md) - Query optimization
