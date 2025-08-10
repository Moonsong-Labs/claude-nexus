# Security - Critical Production Configurations

## ⚠️ CRITICAL VULNERABILITY: Dashboard Read-Only Mode

**NEVER deploy production without `DASHBOARD_API_KEY`** - Exposes ALL conversation data!

**Impact when not set:**

- Anyone with network access can view ALL conversations
- All API requests and responses visible
- Token usage, costs, account information exposed
- AI analysis results accessible
- Potential customer data, API keys, proprietary information exposed

**Checking vulnerability:**

```bash
# If empty, dashboard is UNSECURED
echo $DASHBOARD_API_KEY

# Test public access
curl http://your-server:3001/dashboard
# If you see dashboard without login, it's exposed
```

## Critical Authentication Bypass

**Development setting that DISABLES all authentication:**

```bash
ENABLE_CLIENT_AUTH=false  # NEVER use in production
```

## OAuth Auto-Refresh Security Pattern

**Critical non-intuitive timing: Refreshes 1 minute before expiry**

```bash
# Proxy automatically adds this header for OAuth requests:
anthropic-beta: oauth-2025-04-20
```

## Essential File Permissions (Often Overlooked)

```bash
chmod 600 credentials/*.json  # Owner read-only
chmod 700 credentials/        # No group/other access
```

**Credential auto-reload pattern (no restart required):**

```bash
# Update credential file - proxy reloads automatically
echo '{"client_api_key": "new_key"}' > credentials/domain.json
```

## Database Security - Critical SSL Configuration

```sql
-- Essential PostgreSQL security hardening
REVOKE ALL ON DATABASE claude_nexus FROM PUBLIC;
GRANT CONNECT ON DATABASE claude_nexus TO proxy_user;

-- Force SSL connections (often missed)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

## Data Storage Security Risk

**When `STORAGE_ENABLED=true` all request/response bodies stored in PostgreSQL:**

- Consider encrypting sensitive fields
- Implement data retention policies
- Request bodies contain potentially sensitive user data

## Critical Security Monitoring Queries

**Detect authentication failures (potential attacks):**

```sql
SELECT COUNT(*), ip_address, domain
FROM api_requests
WHERE response_status = 401
GROUP BY ip_address, domain
HAVING COUNT(*) > 10;
```

**Detect unusual token usage spikes:**

```sql
SELECT domain, DATE(timestamp), SUM(total_tokens)
FROM api_requests
GROUP BY domain, DATE(timestamp)
HAVING SUM(total_tokens) > average_daily_usage * 2;
```

## Essential Security Checklist

**Pre-Production (MANDATORY):**

- [ ] Set `DASHBOARD_API_KEY` (CRITICAL)
- [ ] `chmod 600 credentials/*.json`
- [ ] Database SSL: `?sslmode=require`
- [ ] Never expose port 3001 to internet
- [ ] Test: `curl your-server:3001/dashboard` should require auth

**Post-Deployment:**

- [ ] Monitor 401 errors for attack patterns
- [ ] Set up token usage spike alerts
- [ ] Regular credential rotation schedule
