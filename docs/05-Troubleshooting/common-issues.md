# Common Issues

This guide helps you quickly resolve the most frequently encountered issues with Claude Nexus Proxy.

## Table of Contents

- [Authentication Errors](#authentication-errors)
  - [Invalid x-api-key](#invalid-x-api-key)
  - [401 Unauthorized](#401-unauthorized)
- [Request Errors](#request-errors)
  - [Request Timeout](#request-timeout)
  - [Rate Limiting (429)](#rate-limiting-429)
  - [CORS Issues](#cors-issues)
- [Database Issues](#database-issues)
  - [Connection Failed](#connection-failed)
  - [Missing Tables](#missing-tables)
- [Service Issues](#service-issues)
  - [Service Won't Start](#service-wont-start)
  - [Memory Usage Problems](#memory-usage-problems)
- [Token Usage](#token-usage)
  - [Token Limit Exceeded](#token-limit-exceeded)
- [Getting Help](#getting-help)

## Authentication Errors

### Invalid x-api-key

**Error Message:**

```json
{
  "error": {
    "type": "authentication_error",
    "message": "invalid x-api-key"
  }
}
```

**Causes:**

1. Invalid or expired Claude API key
2. Using wrong API key format
3. API key not properly configured

**Solutions:**

1. **Check API Key Format**
   - Claude API keys should start with `sk-ant-`
   - OAuth tokens should use `Bearer` prefix

2. **Verify Credential Files**

   ```bash
   # Check if credential files exist
   ls -la credentials/

   # Verify the credential file for your domain
   cat credentials/your-domain.credentials.json
   ```

3. **Test API Key Directly**

   ```bash
   # Test with curl using your API key
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: sk-ant-..." \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{
       "model": "claude-3-sonnet-20240229",
       "max_tokens": 10,
       "messages": [{"role": "user", "content": "Hi"}]
     }'
   ```

4. **Use Request Headers**
   - Pass API key in request: `Authorization: Bearer sk-ant-...`
   - Or use: `x-api-key: sk-ant-...`

### 401 Unauthorized

**Error Message:**

```json
{
  "error": "Unauthorized",
  "message": "Invalid client API key"
}
```

**Causes:**

1. Missing or incorrect client API key
2. Domain not properly configured
3. Client authentication disabled

**Solutions:**

1. **Verify Client API Key**

   ```bash
   # Check your domain's credential file
   cat credentials/your-domain.credentials.json | jq '.client_api_key'
   ```

2. **Include Client Key in Request**

   ```bash
   curl http://proxy.example.com/v1/messages \
     -H "Authorization: Bearer cnp_live_..." \
     -H "Content-Type: application/json" \
     -d '{"messages": [{"role": "user", "content": "test"}]}'
   ```

3. **Ensure Client Auth is Enabled**
   ```bash
   # Check environment variable
   echo $ENABLE_CLIENT_AUTH  # Should be "true"
   ```

## Request Errors

### Request Timeout

**Error Message:**

```json
{
  "error": {
    "type": "timeout_error",
    "message": "Request timed out after 600000ms"
  }
}
```

**Causes:**

1. Long-running Claude API requests
2. Network connectivity issues
3. Timeout configuration too low

**Solutions:**

1. **Increase Timeout Settings**

   ```bash
   # Set in .env file
   CLAUDE_API_TIMEOUT=900000  # 15 minutes
   PROXY_SERVER_TIMEOUT=960000  # 16 minutes
   ```

2. **Check Network Connectivity**

   ```bash
   # Test connection to Claude API
   curl -I https://api.anthropic.com
   ```

3. **Monitor Request Duration**
   ```sql
   -- Check average response times
   SELECT
     AVG(response_time_ms) as avg_time,
     MAX(response_time_ms) as max_time
   FROM api_requests
   WHERE created_at > NOW() - INTERVAL '1 hour';
   ```

### Rate Limiting (429)

**Error Message:**

```json
{
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded"
  }
}
```

**Causes:**

1. Exceeding Claude API rate limits
2. Too many concurrent requests
3. Burst of requests in short time

**Solutions:**

1. **Check Current Usage**

   ```bash
   # View token usage for current window
   curl "http://localhost:3000/api/token-usage/current?accountId=your_account_id" \
     -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
   ```

2. **Implement Request Throttling**
   - Add delays between requests
   - Use request queue with rate limiting
   - Monitor usage via dashboard

3. **Distribute Load**
   - Use multiple API keys/accounts
   - Implement request scheduling

### CORS Issues

**Error Message:**

```
Access to fetch at 'http://proxy.example.com' from origin 'http://localhost:3001' has been blocked by CORS policy
```

**Causes:**

1. Missing CORS headers
2. Incorrect origin configuration
3. Preflight request failing

**Solutions:**

1. **Configure CORS in Proxy**

   ```typescript
   // Ensure CORS middleware is configured
   app.use(
     cors({
       origin: ['http://localhost:3001', 'https://dashboard.example.com'],
       credentials: true,
     })
   )
   ```

2. **Check Request Headers**
   ```bash
   # Test CORS preflight
   curl -X OPTIONS http://proxy.example.com/v1/messages \
     -H "Origin: http://localhost:3001" \
     -H "Access-Control-Request-Method: POST" -v
   ```

## Database Issues

### Connection Failed

**Error Message:**

```
Error: Database configuration is required for dashboard service
```

**Causes:**

1. Missing DATABASE_URL environment variable
2. PostgreSQL server not running
3. Incorrect connection credentials

**Solutions:**

1. **Set DATABASE_URL**

   ```bash
   # In .env file
   DATABASE_URL="postgresql://user:pass@host:5432/dbname"
   ```

2. **Verify PostgreSQL is Running**

   ```bash
   # Check if PostgreSQL is running
   docker compose ps postgres

   # Or for local PostgreSQL
   pg_isready -h localhost -p 5432
   ```

3. **Test Database Connection**
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

### Missing Tables

**Error Message:**

```
error: relation "api_requests" does not exist
```

**Causes:**

1. Database not initialized
2. Migrations not run
3. Wrong database/schema

**Solutions:**

1. **Initialize Database**

   ```bash
   # Run initialization script
   bun run scripts/init-database.sql
   ```

2. **Run Migrations**

   ```bash
   # Run all migrations in order
   for file in scripts/db/migrations/*.ts; do
     bun run "$file"
   done
   ```

3. **Verify Tables Exist**
   ```sql
   -- Check existing tables
   SELECT tablename FROM pg_tables
   WHERE schemaname = 'public';
   ```

## Service Issues

### Service Won't Start

**Error Message:**

```
process.on is not a function
```

**Causes:**

1. Bundler minification issues
2. Missing dependencies
3. Port already in use

**Solutions:**

1. **Use Development Mode**

   ```bash
   # Start in development mode
   bun run dev
   ```

2. **Check Port Availability**

   ```bash
   # Check if ports are in use
   lsof -i :3000  # Proxy port
   lsof -i :3001  # Dashboard port
   ```

3. **Reinstall Dependencies**
   ```bash
   # Clean install
   rm -rf node_modules bun.lockb
   bun install
   ```

### Memory Usage Problems

**Symptoms:**

- Increasing memory usage over time
- Service crashes with OOM errors
- Performance degradation

**Causes:**

1. Request map memory leak
2. Large response bodies in memory
3. Unbounded caches

**Solutions:**

1. **Configure Cleanup Intervals**

   ```bash
   # In .env file
   STORAGE_ADAPTER_CLEANUP_MS=300000  # 5 minutes
   STORAGE_ADAPTER_RETENTION_MS=3600000  # 1 hour
   ```

2. **Monitor Memory Usage**

   ```bash
   # Check service memory
   docker stats proxy --no-stream
   ```

3. **Enable Memory Limits**
   ```yaml
   # docker-compose.yml
   services:
     proxy:
       mem_limit: 2g
       memswap_limit: 2g
   ```

## Token Usage

### Token Limit Exceeded

**Error Message:**

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "max_tokens is too large"
  }
}
```

**Causes:**

1. Request exceeds model's token limit
2. Accumulated context too large
3. Output tokens set too high

**Solutions:**

1. **Check Token Limits by Model**
   - Claude 3 Opus: 200K context
   - Claude 3 Sonnet: 200K context
   - Claude 3 Haiku: 200K context

2. **Monitor Token Usage**

   ```bash
   # View daily usage
   curl "http://localhost:3000/api/token-usage/daily?accountId=your_account_id" \
     -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
   ```

3. **Optimize Requests**

   ```javascript
   // Reduce context size
   const messages = conversation.slice(-10) // Keep last 10 messages

   // Limit output tokens
   const request = {
     model: 'claude-3-haiku-20240307',
     max_tokens: 1000, // Reasonable limit
     messages: messages,
   }
   ```

## Getting Help

If you're still experiencing issues:

1. **Enable Debug Mode**

   ```bash
   # Set in .env file
   DEBUG=true
   DEBUG_SQL=true  # For database query debugging
   ```

2. **Check Logs**

   ```bash
   # View proxy logs
   docker compose logs -f proxy

   # View dashboard logs
   docker compose logs -f dashboard

   # Filter for errors
   docker compose logs proxy | grep ERROR
   ```

3. **Gather Information**
   - Error messages and stack traces
   - Steps to reproduce the issue
   - Environment details (OS, Bun version, etc.)
   - Relevant configuration settings

4. **Get Support**
   - Check [GitHub Issues](https://github.com/your-org/claude-nexus-proxy/issues)
   - Review [Debugging Guide](./debugging.md) for advanced troubleshooting
   - See [Performance Guide](./performance.md) for optimization tips

## Quick Reference

### Common Commands

```bash
# Check service health
curl http://localhost:3000/health
curl http://localhost:3001/health

# View current configuration
bun run scripts/check-config.ts

# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Monitor real-time logs
docker compose logs -f --tail=50

# Check token usage
curl http://localhost:3000/token-stats
```

### Environment Variables

Key variables for troubleshooting:

- `DEBUG=true` - Enable verbose logging
- `DEBUG_SQL=true` - Log SQL queries
- `CLAUDE_API_TIMEOUT` - Request timeout (ms)
- `DATABASE_URL` - PostgreSQL connection
- `ENABLE_CLIENT_AUTH` - Client authentication

See [Environment Variables Reference](../06-Reference/environment-vars.md) for complete list.
