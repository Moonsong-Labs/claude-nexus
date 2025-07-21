# Security Guide

This guide covers operational security considerations and best practices for deploying Claude Nexus Proxy in production.

> **Related Documentation**:
>
> - [AI Analysis Security Guide](./ai-analysis-security.md) - Security for AI-powered features
> - [ADR-004: Proxy Authentication](../04-Architecture/ADRs/adr-004-proxy-authentication.md) - Authentication architecture
> - [Credential Templates](../../credentials/README.md) - Example credential configurations

## Authentication

### Client Authentication

The proxy supports multiple authentication layers:

1. **Client API Keys** - For authenticating clients to the proxy
2. **Claude API Keys** - For authenticating the proxy to Claude
3. **OAuth Tokens** - Alternative to API keys with auto-refresh

#### Client Authentication Setup

```bash
# Generate secure client API key
bun run scripts/generate-api-key.ts
# Output: cnp_live_1a2b3c4d5e6f...

# Add to domain credentials (see credentials/README.md for templates)
{
  "type": "api_key",
  "accountId": "acc_unique_id",
  "api_key": "sk-ant-...",
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

> **Security Note**: See [CLAUDE.md](../../CLAUDE.md#authentication-flow) for implementation details

### OAuth Implementation

OAuth tokens are automatically refreshed before expiry:

```json
{
  "type": "oauth",
  "accountId": "acc_unique_id",
  "client_api_key": "cnp_live_...",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890000,
    "scopes": ["user:inference"],
    "isMax": true
  }
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

4. **Template Files** - Use the provided credential templates in `credentials/` directory

### Credential Rotation

Best practices for key rotation:

1. Generate new keys regularly
2. Update credentials without downtime:

```bash
# Update credential file - proxy reloads automatically
# Copy from template and edit
cp credentials/example-api-key.com.credentials.json credentials/domain.com.credentials.json
# Edit with your actual values
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
GRANT SELECT, INSERT, UPDATE ON api_requests, streaming_chunks TO proxy_user;

-- Use SSL connections
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

### Environment Variable Security

- Store sensitive values in `.env` files, never in code
- Use `API_KEY_SALT` to hash API keys in database
- Set appropriate `SLOW_QUERY_THRESHOLD_MS` for monitoring
- Review all environment variables in [Environment Variables Reference](../06-Reference/environment-vars.md)

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
SELECT COUNT(*), domain, DATE(timestamp)
FROM api_requests
WHERE response_status = 401
GROUP BY domain, DATE(timestamp)
HAVING COUNT(*) > 10
ORDER BY DATE(timestamp) DESC;
```

2. **Unusual Usage Patterns**:

```sql
-- Detect token usage spikes by account
SELECT account_id, domain, DATE(timestamp) as usage_date,
       SUM(total_tokens) as daily_tokens
FROM api_requests
WHERE account_id IS NOT NULL
GROUP BY account_id, domain, DATE(timestamp)
ORDER BY daily_tokens DESC
LIMIT 20;
```

3. **Slack Alerts**:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## MCP Server Security

When MCP server is enabled:

1. **Authentication** - MCP uses the same client API keys
2. **Prompt Validation** - File paths are validated against path traversal
3. **GitHub Sync** - Use minimal scope tokens for `MCP_GITHUB_TOKEN`
4. **Access Control** - MCP endpoints require valid authentication

See [MCP Server Implementation](../04-Architecture/ADRs/adr-016-mcp-server-implementation.md) for details.

## Dashboard Security

> **Important**: The dashboard auth cookie is set with `httpOnly: false` to enable API calls. See [CLAUDE.md](../../CLAUDE.md#spark-tool-integration) for security trade-offs and alternatives.

## Security Checklist

### Pre-Deployment

- [ ] Generate strong client API keys using `scripts/generate-api-key.ts`
- [ ] Set secure `DASHBOARD_API_KEY`
- [ ] Configure TLS/SSL termination
- [ ] Set file permissions: `chmod 600 credentials/*.json`
- [ ] Enable database SSL connections
- [ ] Review firewall rules
- [ ] Configure environment variables securely

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
bun run scripts/generate-api-key.ts

# Check access logs by account
SELECT request_id, account_id, domain, timestamp,
       path, response_status
FROM api_requests
WHERE timestamp > 'suspected_breach_time'
ORDER BY timestamp DESC;
```

2. **Investigation**:

- Review authentication logs
- Check for unusual patterns
- Analyze token usage

3. **Recovery**:

- Rotate all credentials
- Update client configurations
- Monitor for continued activity

## Threat Model

Key threats and mitigations:

1. **API Key Exposure** - Use client API keys, rotate regularly
2. **Token Exhaustion** - Monitor usage, set alerts
3. **Data Leakage** - Mask sensitive data in logs
4. **Injection Attacks** - Parameterized queries, input validation
5. **MCP Prompt Injection** - Path validation, sandboxing

## Dependency Management

```bash
# Check for vulnerabilities
bun audit

# Update dependencies
bun update

# Review security advisories
git log --grep="security" --oneline
```

## Security Updates

Stay informed:

1. Watch repository for security advisories
2. Monitor [Claude API announcements](https://www.anthropic.com/news)
3. Review dependency updates regularly
4. Subscribe to security mailing lists

## Compliance

For regulatory compliance:

1. **Data Residency** - Deploy in appropriate regions
2. **Audit Trails** - Enable comprehensive logging
3. **Encryption** - Use TLS and encrypt at rest
4. **Access Control** - Implement principle of least privilege
5. **Data Retention** - Configure appropriate retention policies
6. **AI Analysis** - Review [AI Analysis Security](./ai-analysis-security.md) for PII handling

## References

- [Authentication Guide](../02-User-Guide/authentication.md) - User-facing auth documentation
- [Environment Variables](../06-Reference/environment-vars.md) - Complete configuration reference
- [Database Guide](./database.md) - Database security and management
- [Monitoring Guide](./monitoring.md) - Security monitoring setup
