# Security Guide

This guide covers security considerations and best practices for deploying Claude Nexus Proxy.

## Authentication

### Client Authentication

The proxy supports multiple authentication layers:

1. **Client API Keys** - For authenticating clients to the proxy
2. **Claude API Keys** - For authenticating the proxy to Claude
3. **OAuth Tokens** - Alternative to API keys with auto-refresh

#### Client Authentication Setup

```bash
# Generate secure client API key
bun run auth:generate-key
# Output: cnp_live_1a2b3c4d5e6f...

# Add to domain credentials
{
  "client_api_key": "cnp_live_1a2b3c4d5e6f..."
}
```

Clients must include this key in requests:

```bash
curl -H "Authorization: Bearer cnp_live_..." http://proxy/v1/messages
```

#### Disabling Client Auth (Development Only)

```bash
ENABLE_CLIENT_AUTH=false  # NOT recommended for production
```

### OAuth Implementation

OAuth tokens are automatically refreshed before expiry:

```json
{
  "type": "oauth",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

The proxy adds required headers:

```
anthropic-beta: oauth-2025-04-20
```

## Credential Management

### Storage Security

1. **File Permissions** - Credential files should be readable only by the proxy user:

```bash
chmod 600 credentials/*.json
chown proxy-user:proxy-user credentials/*.json
```

2. **Directory Security**:

```bash
chmod 700 credentials/
```

3. **Encryption at Rest** - Consider encrypting the credentials directory

### Credential Rotation

Best practices for key rotation:

1. Generate new keys regularly
2. Update credentials without downtime:

```bash
# Update credential file - proxy reloads automatically
echo '{"client_api_key": "new_key"}' > credentials/domain.json
```

3. Monitor old key usage before removal

## Data Protection

### Sensitive Data Masking

Debug logs automatically mask:

- API keys: `sk-ant-****`
- Bearer tokens: `Bearer ****`
- OAuth tokens: `token-****`

### Request/Response Storage

When `STORAGE_ENABLED=true`:

- Request bodies are stored in PostgreSQL
- Consider encrypting sensitive fields
- Implement data retention policies

### Database Security

```sql
-- Restrict database access
REVOKE ALL ON DATABASE claude_nexus FROM PUBLIC;
GRANT CONNECT ON DATABASE claude_nexus TO proxy_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES TO proxy_user;

-- Use SSL connections
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

## Network Security

### TLS/SSL Configuration

1. **Proxy Behind Load Balancer**:

```nginx
upstream proxy {
    server localhost:3000;
}

server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://proxy;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. **Direct TLS** (using a reverse proxy):

- Terminate TLS at nginx/caddy
- Keep proxy on localhost only

### IP Whitelisting

Restrict access by IP:

```nginx
location / {
    allow 10.0.0.0/8;
    allow 192.168.1.0/24;
    deny all;
    proxy_pass http://proxy;
}
```

## Audit and Monitoring

### Access Logging

The proxy logs all requests with:

- Timestamp
- Domain
- Request ID
- IP address
- Response status

### Security Monitoring

1. **Failed Authentication Attempts**:

```sql
SELECT COUNT(*), ip_address, domain
FROM api_requests
WHERE response_status = 401
GROUP BY ip_address, domain
HAVING COUNT(*) > 10;
```

2. **Unusual Usage Patterns**:

```sql
-- Detect token usage spikes
SELECT domain, DATE(timestamp), SUM(total_tokens)
FROM api_requests
GROUP BY domain, DATE(timestamp)
HAVING SUM(total_tokens) > average_daily_usage * 2;
```

3. **Slack Alerts**:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Security Checklist

### Pre-Deployment

- [ ] Generate strong client API keys
- [ ] Set secure `DASHBOARD_API_KEY`
- [ ] Configure TLS/SSL
- [ ] Set appropriate file permissions
- [ ] Enable database SSL
- [ ] Review firewall rules

### Post-Deployment

- [ ] Monitor authentication failures
- [ ] Set up log aggregation
- [ ] Configure alerts for anomalies
- [ ] Regular credential rotation
- [ ] Database backup encryption
- [ ] Security audit schedule

## Common Vulnerabilities

### 1. Exposed Dashboard

**Risk**: Dashboard accessible without authentication

**Mitigation**:

- Always set `DASHBOARD_API_KEY`
- Use strong, unique keys
- Restrict dashboard to internal network

### 2. Credential Leakage

**Risk**: Credentials in logs or error messages

**Mitigation**:

- Enable log masking
- Review error handling
- Avoid logging request bodies

### 3. Database Injection

**Risk**: SQL injection through user input

**Mitigation**:

- Proxy uses parameterized queries
- No user input in SQL construction
- Regular dependency updates

## Incident Response

### Suspected Breach

1. **Immediate Actions**:

```bash
# Rotate all keys
bun run auth:generate-key

# Check access logs
SELECT * FROM api_requests
WHERE timestamp > 'suspected_breach_time'
ORDER BY timestamp;
```

2. **Investigation**:

- Review authentication logs
- Check for unusual patterns
- Analyze token usage

3. **Recovery**:

- Rotate all credentials
- Update client configurations
- Monitor for continued activity

## Security Updates

Stay informed about security updates:

1. Watch the repository for security advisories
2. Update dependencies regularly:

```bash
bun update
```

3. Monitor Claude API security announcements

## Compliance

For regulatory compliance:

1. **Data Residency** - Deploy in appropriate regions
2. **Audit Trails** - Enable comprehensive logging
3. **Encryption** - Use TLS and encrypt at rest
4. **Access Control** - Implement principle of least privilege
5. **Data Retention** - Configure appropriate retention policies
