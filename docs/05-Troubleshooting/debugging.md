# Debugging Guide

This guide provides techniques and tools for debugging issues in Claude Nexus Proxy.

## Quick Troubleshooting Checklist

**Before diving into detailed debugging:**

- [ ] Check all required environment variables are set (especially `DATABASE_URL`, `DASHBOARD_API_KEY`)
- [ ] Verify credential files exist and have correct format in `credentials/` directory
- [ ] Ensure PostgreSQL is running and accessible
- [ ] Confirm Docker containers are healthy with `./docker-up.sh ps`
- [ ] Check for recent error logs: `./docker-up.sh logs --tail=50 proxy`
- [ ] Verify the correct branch is deployed (check git status)

## Debug Mode Configuration

### Enable Debug Logging

```bash
# Enable comprehensive debug logging
DEBUG=true bun run dev

# Enable only SQL query logging
DEBUG_SQL=true bun run dev

# Or add to .env file
DEBUG=true
DEBUG_SQL=true
SLOW_QUERY_THRESHOLD_MS=5000  # Log queries slower than 5 seconds
```

**Debug mode features:**

- Full request/response logging (with sensitive data masked)
- Detailed error stack traces with source maps
- Performance timing for each request
- SQL query logging with execution time
- Slow query warnings
- Memory usage tracking

### Debug Output Format

```typescript
// Example debug log from services/proxy/src/logging/logger.ts
interface DebugLog {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  service: 'proxy' | 'dashboard'
  event: string
  domain?: string
  method?: string
  path?: string
  headers?: Record<string, string> // Sensitive values auto-masked
  body?: unknown
  duration?: number
  error?: {
    message: string
    stack?: string
    code?: string
  }
  sql?: {
    query: string
    params: unknown[]
    duration: number
    rows: number
  }
}
```

## Common Debugging Scenarios

### SQL Query Debugging

#### Enable SQL Query Logging

```bash
# Enable SQL logging with slow query detection
DEBUG_SQL=true SLOW_QUERY_THRESHOLD_MS=1000 bun run dev:proxy
```

**SQL log output includes:**

- Full query text with parameters
- Execution time in milliseconds
- Number of rows returned
- Slow query warnings (queries exceeding threshold)
- Stack trace for query origin

#### Monitor Database Performance

```sql
-- Check active queries
SELECT
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- Find slow queries in api_requests
SELECT
  id,
  domain,
  path,
  response_time_ms,
  created_at
FROM api_requests
WHERE response_time_ms > 5000
ORDER BY response_time_ms DESC
LIMIT 10;
```

### Debugging Authentication Issues

#### Debug Client Authentication

```bash
# Enable auth debugging
DEBUG=true bun run dev:proxy

# Check logs for auth flow
./docker-up.sh logs proxy | grep -i auth
```

**Common auth patterns in logs:**

```typescript
// Successful auth (from services/proxy/src/auth/clientAuth.ts)
{
  level: 'debug',
  event: 'client_auth_check',
  domain: 'example.com',
  result: 'success',
  hasClientKey: true
}

// Failed auth with timing-safe comparison
{
  level: 'warn',
  event: 'client_auth_failed',
  domain: 'example.com',
  reason: 'key_mismatch',
  // Keys are never logged for security
}
```

#### Debug OAuth Flow

```bash
# Monitor OAuth token refresh in real-time
./docker-up.sh logs -f proxy | grep -i oauth

# Check OAuth credential status
bun run scripts/check-credentials.ts
```

**OAuth debugging checklist:**

- Verify `anthropic-beta: oauth-2025-04-20` header is present
- Check token expiry times in credential files
- Monitor auto-refresh attempts (1 minute before expiry)
- Ensure refresh tokens are being saved back to files

### Debugging Request/Response Issues

#### Enable Request Capture

The proxy automatically logs full requests when `DEBUG=true`. To capture test samples:

```bash
# Enable test sample collection
COLLECT_TEST_SAMPLES=true TEST_SAMPLES_DIR=test-samples bun run dev:proxy
```

This creates sanitized request/response files in `test-samples/` for test development.

#### Debug Streaming Responses

```bash
# Monitor streaming chunks for a specific request
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT
    request_id,
    chunk_index,
    LENGTH(content) as size,
    created_at
  FROM streaming_chunks
  WHERE request_id = 'your-request-id'
  ORDER BY chunk_index;
"

# Check for incomplete streams
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT r.id, r.domain, COUNT(s.chunk_index) as chunks
  FROM api_requests r
  LEFT JOIN streaming_chunks s ON r.id = s.request_id
  WHERE r.is_streaming = true
  AND r.created_at > NOW() - INTERVAL '1 hour'
  GROUP BY r.id, r.domain
  HAVING COUNT(s.chunk_index) = 0;
"
```

### Debugging the Proxy Service

#### Check Proxy Health

```bash
# Quick health check
curl -s http://localhost:3000/health | jq .

# Check proxy logs for errors
./docker-up.sh logs --tail=100 proxy | grep -E "error|Error|ERROR"

# Monitor real-time proxy activity
./docker-up.sh logs -f proxy
```

#### Common Proxy Issues

**Connection refused:**

```bash
# Verify proxy is running
./docker-up.sh ps proxy

# Check port binding
lsof -i :3000
```

**Request timeout:**

```bash
# Check timeout configuration
grep -E "CLAUDE_API_TIMEOUT|PROXY_SERVER_TIMEOUT" .env

# Default: 10 minutes for Claude API, 11 minutes for server
```

### Debugging the Dashboard

#### Dashboard Health Check

```bash
# Check dashboard status
curl -s http://localhost:3001/health \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY" | jq .

# Monitor SSE connections
./docker-up.sh logs dashboard | grep -i sse
```

#### Common Dashboard Issues

**Authentication failures:**

```bash
# Verify DASHBOARD_API_KEY is set
grep DASHBOARD_API_KEY .env

# Test authentication
curl -v http://localhost:3001/api/requests \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

**Missing data:**

```bash
# Check if storage is enabled
grep STORAGE_ENABLED .env  # Should be true

# Verify database connectivity from dashboard
./docker-up.sh exec dashboard env | grep DATABASE_URL
```

### Debugging AI Worker

#### Enable AI Worker Debugging

```bash
# Check AI worker configuration
bun run scripts/check-ai-worker-config.ts

# Monitor AI analysis jobs
bun run scripts/check-analysis-jobs.ts

# Enable AI worker with debug logging
AI_WORKER_ENABLED=true DEBUG=true bun run dev:proxy
```

#### Common AI Worker Issues

**Jobs stuck in processing:**

```bash
# Check for stuck jobs
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT conversation_id, branch_id, status,
         EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_stuck
  FROM conversation_analyses
  WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
"

# Manually fail stuck jobs
bun run scripts/fail-exceeded-retry-jobs.ts
```

**Gemini API errors:**

```bash
# Check Gemini configuration
grep -E "GEMINI_API_KEY|GEMINI_MODEL_NAME" .env

# Test Gemini connectivity
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Test"}]}]}'
```

### Debugging MCP Server

#### Enable MCP Debugging

```bash
# Check MCP configuration
grep -E "MCP_ENABLED|MCP_PROMPTS_DIR" .env

# Monitor MCP requests
./docker-up.sh logs proxy | grep -i mcp

# Test MCP endpoint
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}'
```

#### MCP Prompt Issues

**Prompts not loading:**

```bash
# Check prompts directory
ls -la prompts/

# Verify YAML syntax
for file in prompts/*.yaml; do
  echo "Checking $file..."
  bun run scripts/validate-yaml.ts "$file"
done
```

**GitHub sync issues:**

```bash
# Check GitHub configuration
grep -E "MCP_GITHUB_" .env

# Test GitHub API access
curl -H "Authorization: token $MCP_GITHUB_TOKEN" \
  https://api.github.com/repos/$MCP_GITHUB_OWNER/$MCP_GITHUB_REPO/contents/$MCP_GITHUB_PATH
```

## Debugging Conversation Tracking

### Verify Conversation Linking

```bash
# Check conversation grouping
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT
    conversation_id,
    branch_id,
    COUNT(*) as message_count,
    MIN(created_at) as started,
    MAX(created_at) as last_message
  FROM api_requests
  WHERE conversation_id IS NOT NULL
  GROUP BY conversation_id, branch_id
  ORDER BY MAX(created_at) DESC
  LIMIT 10;
"
```

### Debug Subtask Detection

```bash
# Find subtasks
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT
    ar.id,
    ar.conversation_id,
    ar.branch_id,
    ar.is_subtask,
    parent.domain as parent_domain,
    SUBSTRING(ar.request_body::text, 1, 100) as request_preview
  FROM api_requests ar
  LEFT JOIN api_requests parent ON ar.parent_task_request_id = parent.id
  WHERE ar.is_subtask = true
  ORDER BY ar.created_at DESC
  LIMIT 10;
"
```

## Debugging Token Usage

### Monitor Token Consumption

```bash
# Check current 5-hour window usage
curl "http://localhost:3000/api/token-usage/current?accountId=acc_123&window=300" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY" | jq .

# View daily token usage
curl "http://localhost:3000/api/token-usage/daily?accountId=acc_123" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY" | jq .
```

### Debug Token Tracking Issues

```sql
-- Check token tracking for recent requests
SELECT
  id,
  account_id,
  domain,
  input_tokens,
  output_tokens,
  total_tokens,
  created_at
FROM api_requests
WHERE created_at > NOW() - INTERVAL '1 hour'
AND total_tokens > 0
ORDER BY created_at DESC
LIMIT 10;
```

## Log Analysis Tools

### Extract and Analyze Logs

```bash
# Extract specific request logs
REQUEST_ID="req_123"
./docker-up.sh logs proxy | grep $REQUEST_ID > request_debug.log

# Parse JSON logs for errors
./docker-up.sh logs proxy | jq 'select(.level == "error")'

# Count errors by type
./docker-up.sh logs proxy | jq -r 'select(.level == "error") | .error.message' | sort | uniq -c

# Find slow requests
./docker-up.sh logs proxy | jq 'select(.duration > 5000) | {domain, path, duration}'
```

### SQL Query Analysis

```bash
# When DEBUG_SQL=true, analyze query patterns
./docker-up.sh logs proxy | grep "SQL Query" | jq '{
  query: .sql.query | split(" ")[0],
  duration: .sql.duration,
  rows: .sql.rows
}' | jq -s 'group_by(.query) | map({
  query: .[0].query,
  count: length,
  avg_duration: (map(.duration) | add / length),
  total_rows: (map(.rows) | add)
})'
```

## Useful Debug Scripts

### Check System Health

```bash
#!/bin/bash
# scripts/health-check-all.sh

echo "=== Proxy Health ==="
curl -s http://localhost:3000/health | jq .

echo -e "\n=== Dashboard Health ==="
curl -s http://localhost:3001/health \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY" | jq .

echo -e "\n=== Database Status ==="
./docker-up.sh exec postgres pg_isready

echo -e "\n=== Container Status ==="
./docker-up.sh ps

echo -e "\n=== Recent Errors (last 10) ==="
./docker-up.sh logs --tail=50 proxy dashboard | grep -i error | tail -10
```

### Test Specific Features

```typescript
// Test conversation tracking
import { ConversationLinker } from '@claude-nexus-proxy/shared'

const linker = new ConversationLinker()
const result = await linker.processRequest({
  messages: [{ role: 'user', content: 'Test' }],
  // ... other request data
})
console.log('Conversation ID:', result.conversationId)
console.log('Branch ID:', result.branchId)
```

### Database Inspection Queries

```sql
-- Inspect request details with full context
SELECT
  id,
  domain,
  account_id,
  method,
  path,
  status_code,
  error_type,
  error_message,
  response_time_ms,
  input_tokens,
  output_tokens,
  conversation_id,
  branch_id,
  is_subtask,
  parent_task_request_id,
  created_at
FROM api_requests
WHERE id = 'your-request-id'\gx

-- View conversation flow
WITH conversation_tree AS (
  SELECT
    id,
    conversation_id,
    branch_id,
    parent_message_hash,
    current_message_hash,
    created_at,
    SUBSTRING(request_body::text, 1, 100) as preview
  FROM api_requests
  WHERE conversation_id = 'your-conversation-id'
  ORDER BY created_at
)
SELECT * FROM conversation_tree;
```

## Performance Debugging

### Identify Bottlenecks

```bash
# Find slow database queries
DEBUG_SQL=true SLOW_QUERY_THRESHOLD_MS=1000 bun run dev:proxy

# Monitor response times
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT
    domain,
    path,
    AVG(response_time_ms) as avg_ms,
    MAX(response_time_ms) as max_ms,
    COUNT(*) as requests
  FROM api_requests
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY domain, path
  ORDER BY avg_ms DESC
  LIMIT 20;
"
```

### Memory Usage Monitoring

```typescript
// Add to services/proxy/src/app.ts for memory tracking
if (process.env.DEBUG === 'true') {
  setInterval(() => {
    const usage = process.memoryUsage()
    logger.debug({
      event: 'memory_usage',
      rss: Math.round(usage.rss / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
    })
  }, 60000) // Every minute
}
```

## Common Pitfalls

### Environment Variables

**Missing DATABASE_URL:**

- Symptom: "Cannot read properties of undefined" errors
- Fix: Ensure DATABASE_URL is set in .env file

**Wrong API key format:**

- Symptom: 401 Unauthorized
- Fix: Use `sk-ant-...` for Claude API, `cnp_live_...` for client auth

### Docker Issues

**Containers not starting:**

```bash
# Reset everything
./docker-up.sh down -v
./docker-up.sh build --no-cache
./docker-up.sh up -d
```

**Database connection refused:**

```bash
# Check if postgres is ready
./docker-up.sh exec postgres pg_isready

# Verify connection string
./docker-up.sh exec proxy env | grep DATABASE_URL
```

### Credential Problems

**Invalid credential format:**

```bash
# Validate credential file
bun run scripts/validate-credentials.ts credentials/domain.com.credentials.json
```

**OAuth token expired:**

- Check `expires_at` field in credential file
- Monitor auto-refresh in logs: `grep "Token refreshed" logs`

## Essential Debug Commands

```bash
# View all errors in last hour
./docker-up.sh logs --since 1h proxy | grep -i error

# Check database size and table stats
./docker-up.sh exec postgres psql -U postgres claude_nexus -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup AS row_count
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Monitor real-time logs with filters
./docker-up.sh logs -f --tail=50 proxy | grep -v "health"

# Export logs for detailed analysis
./docker-up.sh logs > debug-$(date +%Y%m%d-%H%M%S).log

# Full system check
bun run scripts/health-check-all.sh
```

## Next Steps

- [Review common issues](./common-issues.md)
- [Optimize performance](./performance.md)
- [Set up monitoring](../03-Operations/monitoring.md)
- [Check security](../03-Operations/security.md)
- [View ADR-014: SQL Query Logging](../04-Architecture/ADRs/adr-014-sql-query-logging.md)
