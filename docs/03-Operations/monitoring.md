# Monitoring Guide

_Last Updated: 2025-01-21_

Monitor your Claude Nexus Proxy deployment for performance, reliability, and usage tracking.

## Overview

The proxy provides built-in monitoring capabilities:

- Health check endpoints
- Token usage tracking and limits
- Request/response metrics
- AI analysis job monitoring
- Error tracking with Slack alerts
- SQL query performance monitoring

## Health Checks

### Service Health Endpoints

```bash
# Proxy health
curl http://localhost:3000/health
# Returns: {"status":"ok"}

# Dashboard health
curl http://localhost:3001/health
# Returns: {"status":"ok","database":"connected"}
```

### Token Statistics

```bash
# Get aggregated token usage statistics
curl http://localhost:3000/token-stats?domain=example.com
```

## Dashboard API Endpoints

All dashboard API endpoints require authentication:

```bash
# Set your dashboard API key
export DASHBOARD_API_KEY="your-key-here"

# Get current statistics
curl http://localhost:3001/api/stats \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get current 5-hour window usage
curl "http://localhost:3001/api/token-usage/current?accountId=acc_12345&window=300" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get daily usage history
curl "http://localhost:3001/api/token-usage/daily?accountId=acc_12345&days=30" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get all accounts with usage
curl http://localhost:3001/api/token-usage/accounts \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

## Performance Monitoring

### SQL Query Performance

Enable SQL query logging to monitor database performance:

```bash
# Enable SQL query logging (in .env)
DEBUG_SQL=true
SLOW_QUERY_THRESHOLD_MS=5000  # Log queries slower than 5 seconds
```

Monitor slow queries in the logs:

```bash
# View slow queries using docker-up.sh
./docker-up.sh logs proxy | grep "Slow SQL query"

# Or in development
bun run dev 2>&1 | grep "Slow SQL query"
```

### Database Metrics

Monitor database health with these queries:

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Find long-running queries
SELECT
  pid,
  now() - query_start AS duration,
  left(query, 80) AS query_preview
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '1 minute'
ORDER BY duration DESC;

-- Table sizes and growth
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_live_tup AS row_count
FROM pg_tables
LEFT JOIN pg_stat_user_tables ON tablename = relname
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

## Token Usage Monitoring

Track token usage to stay within Claude API limits:

### Current Window Usage

The proxy tracks token usage in 5-hour rolling windows:

```bash
# Check current window usage for an account
curl "http://localhost:3001/api/token-usage/current?accountId=acc_12345&window=300" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Response includes:
# - tokens_used: Current window usage
# - window_start/end: Time boundaries
# - requests_count: Number of requests
```

### Historical Usage

```bash
# Get daily usage for the last 30 days
curl "http://localhost:3001/api/token-usage/daily?accountId=acc_12345&days=30" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get time-series data (5-minute intervals)
curl "http://localhost:3001/api/token-usage/time-series?accountId=acc_12345&hours=24" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

### Setting Up Usage Alerts

Monitor usage programmatically using the API endpoints above. The dashboard displays visual alerts when usage exceeds 80% of typical limits.

## Error Monitoring

### Error Tracking

Monitor errors through the dashboard or directly in the database:

```sql
-- Recent errors by status code
SELECT
  status_code,
  error_type,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence
FROM api_requests
WHERE status_code >= 400
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY status_code, error_type
ORDER BY error_count DESC;

-- Error rate trend
SELECT
  date_trunc('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE status_code >= 400) as errors,
  COUNT(*) as total_requests,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / COUNT(*), 2) as error_percentage
FROM api_requests
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### Slack Notifications

Configure automatic error alerts:

```bash
# In .env file
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

The proxy automatically sends Slack notifications for:

- Authentication failures
- Rate limit errors
- Unexpected errors (5xx status codes)
- AI analysis job failures

## AI Analysis Monitoring

### Analysis Job Status

Monitor AI-powered conversation analysis jobs:

```bash
# Check analysis job status
bun run scripts/check-analysis-jobs.ts

# Check AI worker configuration
bun run scripts/check-ai-worker-config.ts

# View analysis content for a conversation
bun run scripts/check-analysis-content.ts <conversationId> <branchId>
```

### Analysis API Endpoints

```bash
# Create analysis request
curl -X POST http://localhost:3001/api/analyses \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "uuid-here",
    "branchId": "main"
  }'

# Check analysis status
curl "http://localhost:3001/api/analyses/<conversationId>/<branchId>" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

### Worker Configuration

Enable the AI analysis worker:

```bash
# In .env file
AI_WORKER_ENABLED=true
AI_WORKER_POLL_INTERVAL_MS=5000
AI_WORKER_MAX_CONCURRENT_JOBS=3
```

## MCP Server Monitoring

### MCP Health Check

The MCP server status is included in the proxy health endpoint:

```bash
curl http://localhost:3000/health
# Returns MCP status when MCP_ENABLED=true
```

### MCP Configuration

Monitor MCP prompt synchronization:

```bash
# Check MCP configuration
grep "MCP_" .env

# View prompt sync logs
./docker-up.sh logs proxy | grep "MCP"
```

## Log Analysis

### Viewing Logs

Access logs using docker-up.sh:

```bash
# View all logs
./docker-up.sh logs

# View proxy logs only
./docker-up.sh logs proxy

# Follow logs in real-time
./docker-up.sh logs -f proxy

# View last 100 lines
./docker-up.sh logs --tail 100 proxy
```

### Useful Log Filters

```bash
# Find high token usage requests
./docker-up.sh logs proxy | grep "tokens" | grep -E "total.*[0-9]{5,}"

# Find slow requests (>5s)
./docker-up.sh logs proxy | grep "response_time_ms" | grep -E "[0-9]{4,}"

# Track specific account
./docker-up.sh logs proxy | grep "acc_12345"

# Monitor errors
./docker-up.sh logs proxy | grep -E "ERROR|error|failed"
```

### Debug Logging

Enable detailed logging for troubleshooting:

```bash
# In .env file
DEBUG=true           # Enable all debug logging
DEBUG_SQL=true      # Enable SQL query logging only
```

## Monitoring Best Practices

### Key Metrics to Track

1. **Service Health**
   - Both proxy and dashboard health endpoints
   - Database connection status
   - MCP server availability

2. **Token Usage**
   - Current 5-hour window usage per account
   - Daily trends and projections
   - Accounts approaching limits

3. **Performance**
   - SQL query execution times
   - Request response times
   - Database connection pool usage

4. **Errors**
   - Error rates by type and status code
   - Authentication failures
   - AI analysis job failures

### Alert Thresholds

Configure alerts based on your usage patterns:

- **Token usage**: Alert at 80% of window limit
- **Error rate**: Alert if >5% errors for 5 minutes
- **Database connections**: Alert at 90% of pool size
- **Response time**: Alert if p95 >10s for 10 minutes

### Regular Monitoring Tasks

1. **Daily**: Check token usage trends
2. **Weekly**: Review error patterns and slow queries
3. **Monthly**: Analyze database growth and performance

## Cost Monitoring

### Token Usage by Model

Track token usage across different models in the dashboard or via SQL:

```sql
-- Token usage by model (last 30 days)
SELECT
  model,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens
FROM api_requests
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY model
ORDER BY total_tokens DESC;

-- Daily token usage trend
SELECT
  date_trunc('day', created_at) as day,
  SUM(total_tokens) as daily_tokens,
  COUNT(*) as daily_requests
FROM api_requests
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

### Cost Estimation

For cost tracking, refer to [Anthropic's current pricing](https://www.anthropic.com/pricing) and multiply by your token usage. The dashboard displays token counts that can be used for cost calculations.

## Related Documentation

- [Security Configuration](./security.md) - Secure your deployment
- [Backup & Recovery](./backup-recovery.md) - Data protection strategies
- [Database Operations](./database.md) - Database management
- [Performance Optimization](../05-Troubleshooting/performance.md) - Improve response times
