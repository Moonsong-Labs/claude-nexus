# Authentication Guide

Claude Nexus Proxy supports multiple authentication methods to secure access to both the proxy itself and the Claude API.

## Table of Contents

- [Overview](#overview)
- [Client Authentication](#client-authentication)
  - [API Key Authentication](#api-key-authentication)
  - [Disabling Client Authentication](#disabling-client-authentication)
- [Claude API Authentication](#claude-api-authentication)
  - [Method 1: API Key Authentication](#method-1-api-key-authentication)
  - [Method 2: OAuth Authentication](#method-2-oauth-authentication)
- [Setting Up Authentication](#setting-up-authentication)
- [OAuth Management](#oauth-management)
  - [OAuth Auto-Refresh](#oauth-auto-refresh)
  - [Check OAuth Status](#check-oauth-status)
  - [Manual Token Refresh](#manual-token-refresh)
  - [Refresh All Tokens](#refresh-all-tokens)
- [OAuth Troubleshooting](#oauth-troubleshooting)
- [Security Best Practices](#security-best-practices)
  - [Credential File Security](#credential-file-security)
  - [API Key Security](#api-key-security)
  - [OAuth Security](#oauth-security)
  - [Key Rotation](#key-rotation)
  - [Token Revocation](#token-revocation)
  - [Monitoring and Alerting](#monitoring-and-alerting)
- [Dashboard Authentication](#dashboard-authentication)
- [Multi-Domain Setup](#multi-domain-setup)
- [Environment Variables](#environment-variables)
- [Monitoring Authentication](#monitoring-authentication)
- [Next Steps](#next-steps)

## Overview

The proxy uses a two-layer authentication system:

1. **Client Authentication**: Authenticates requests to the proxy using client API keys
2. **Claude API Authentication**: Authenticates requests from the proxy to Claude using either API keys or OAuth tokens

### Key Concepts

- **accountId**: A unique identifier for each Claude account, used for tracking token usage and organizing credentials
- **Client API Key**: A key you generate to authenticate clients connecting to your proxy (`cnp_live_...`)
- **Claude API Key**: Your actual Claude API key from Anthropic (`sk-ant-...`)
- **OAuth Tokens**: Alternative to API keys, with automatic refresh capabilities

### Authentication Flow

```
┌──────────┐       ┌─────────────────┐       ┌──────────────┐
│  Client  │──────▶│  Claude Nexus   │──────▶│  Claude API  │
│          │       │     Proxy       │       │              │
└──────────┘       └─────────────────┘       └──────────────┘
     │                      │                        │
     │ 1. Request with      │ 3. Forward with       │
     │    Host header +     │    Claude API key     │
     │    Client API key    │    or OAuth token     │
     │                      │                        │
     └─────────────────────▶│ 2. Verify client      │
                            │    auth & load        │
                            │    credentials        │
                            │                       │
                            │◀──────────────────────┘
                            │ 4. Return response
```

## Client Authentication

### API Key Authentication

The proxy can require clients to authenticate using a client API key:

```json
// In your domain credential file
{
  "client_api_key": "cnp_live_your_generated_key"
}
```

Client requests must include this key:

```bash
curl -X POST http://proxy:3000/v1/messages \
  -H "Host: your-domain.com" \
  -H "Authorization: Bearer cnp_live_your_generated_key" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

Generate a secure client API key:

```bash
bun run scripts/auth/generate-api-key.ts
```

This generates a cryptographically secure key in the format `cnp_live_[random_string]`.

### Disabling Client Authentication

For development or internal use, you can disable client authentication:

```bash
ENABLE_CLIENT_AUTH=false
```

⚠️ **Warning**: Only disable client authentication in secure, internal environments.

## Claude API Authentication

The proxy supports two methods for authenticating with the Claude API:

### Choosing Between API Key and OAuth

| Feature              | API Key                         | OAuth                                    |
| -------------------- | ------------------------------- | ---------------------------------------- |
| **Setup Complexity** | Simple - just copy key          | More complex - requires browser auth     |
| **Token Management** | Manual - replace when expired   | Automatic - tokens refresh automatically |
| **Security**         | Static long-lived key           | Short-lived tokens with refresh          |
| **Best For**         | Development, simple deployments | Production, enterprise deployments       |
| **Rotation**         | Manual process                  | Automatic via refresh tokens             |

### Method 1: API Key Authentication

Most common and straightforward method:

```json
{
  "type": "api_key",
  "accountId": "acc_unique_identifier",
  "api_key": "sk-ant-api03-...",
  "client_api_key": "cnp_live_..."
}
```

### Method 2: OAuth Authentication

For enhanced security and automatic token management:

```json
{
  "type": "oauth",
  "accountId": "acc_unique_identifier",
  "client_api_key": "cnp_live_...",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890000,
    "scopes": ["org:create_api_key", "user:profile", "user:inference"],
    "isMax": false
  }
}
```

## Setting Up Authentication

### Step 1: Create Credentials Directory

```bash
mkdir -p credentials
```

### Step 2: Create Domain Credential File

For API key authentication:

```bash
# First, generate a unique account ID and client API key
ACCOUNT_ID="acc_$(uuidgen | tr '[:upper:]' '[:lower:]')"
CLIENT_KEY=$(bun run scripts/auth/generate-api-key.ts)

# Create the credential file
cat > credentials/your-domain.com.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "$ACCOUNT_ID",
  "api_key": "sk-ant-your-claude-api-key",
  "client_api_key": "$CLIENT_KEY"
}
EOF
```

⚠️ **Important**: Replace `sk-ant-your-claude-api-key` with your actual Claude API key from Anthropic.

For OAuth authentication:

```bash
bun run scripts/auth/oauth-login.ts credentials/your-domain.com.credentials.json
```

This will open a browser window for OAuth authentication and save the tokens to your credential file.

### Step 3: Configure Request Headers

Requests must include the correct Host header:

```bash
# The Host header determines which credential file to use
curl -H "Host: your-domain.com" http://localhost:3000/v1/messages
```

## OAuth Management

### OAuth Auto-Refresh

The proxy automatically refreshes OAuth tokens:

- Checks token expiration 1 minute before expiry
- Refreshes token using the refresh token
- Updates credential file with new tokens
- Adds `anthropic-beta: oauth-2025-04-20` header

#### OAuth Refresh Flow

```
┌─────────────────┐     Token about      ┌─────────────────┐
│  Proxy checks   │────to expire?────────▶│  Refresh with   │
│  token expiry   │                       │  refresh token  │
└─────────────────┘                       └─────────────────┘
                                                   │
                                                   ▼
┌─────────────────┐                       ┌─────────────────┐
│  Save new       │◀──────Success─────────│  Claude OAuth   │
│  tokens to      │                       │  Endpoint       │
│  credential     │                       └─────────────────┘
│  file           │                                │
└─────────────────┘                                │
         │                                     Failure
         │                                         │
         ▼                                         ▼
┌─────────────────┐                       ┌─────────────────┐
│  Continue with  │                       │  Log error &    │
│  refreshed      │                       │  require        │
│  access token   │                       │  re-auth        │
└─────────────────┘                       └─────────────────┘
```

### Check OAuth Status

```bash
bun run scripts/auth/check-oauth-status.ts credentials/your-domain.com.credentials.json
```

Output shows:

- Token validity status
- Expiration time
- Available scopes
- Refresh token presence

### Manual Token Refresh

```bash
# Refresh if expiring soon
bun run scripts/auth/oauth-refresh.ts credentials/your-domain.com.credentials.json

# Force refresh
bun run scripts/auth/oauth-refresh.ts credentials/your-domain.com.credentials.json --force
```

### Refresh All Tokens

```bash
# Check all domains
bun run scripts/auth/oauth-refresh-all.ts credentials --dry-run

# Actually refresh
bun run scripts/auth/oauth-refresh-all.ts credentials
```

## OAuth Troubleshooting

### Common OAuth Errors

#### "Failed to refresh token: 400 Bad Request - Refresh token not found or invalid"

**Causes:**

- Refresh token expired or revoked
- Invalid or corrupted token
- OAuth client ID mismatch

**Solution:**

```bash
bun run scripts/auth/oauth-login.ts credentials/your-domain.com.credentials.json
```

#### "No refresh token available"

**Cause:** OAuth credentials missing refresh token

**Solution:** Re-authenticate to get complete credentials

### Debugging OAuth Issues

1. **Check credential file**:

   ```bash
   cat credentials/your-domain.credentials.json | jq .
   ```

2. **Verify OAuth status**:

   ```bash
   bun run scripts/auth/check-oauth-status.ts credentials/your-domain.com.credentials.json
   ```

3. **Enable debug logging**:

   ```bash
   DEBUG=true bun run dev:proxy
   ```

### Additional OAuth Errors

#### "Token expired" during request

**Cause:** Access token expired and auto-refresh failed

**Solution:**

- Check if refresh token is still valid
- Ensure `CLAUDE_OAUTH_CLIENT_ID` is set correctly
- Re-authenticate if refresh token is invalid

#### "Invalid scope" errors

**Cause:** OAuth token doesn't have required permissions

**Solution:** Re-authenticate with proper scopes:

- `org:create_api_key` - Required for organization-level operations
- `user:profile` - Basic user information
- `user:inference` - API usage permissions

## Security Best Practices

### Credential File Security

1. **File Permissions**: Restrict access to credential files

   ```bash
   chmod 600 credentials/*.json
   ```

2. **Directory Permissions**: Secure the credentials directory

   ```bash
   chmod 700 credentials/
   ```

3. **Never Commit**: Add to .gitignore
   ```
   credentials/
   *.credentials.json
   ```

### API Key Security

1. **Use Strong Keys**: Generate cryptographically secure keys
2. **Rotate Regularly**: Update client API keys periodically
3. **Limit Scope**: Use separate keys for different environments
4. **Monitor Usage**: Track key usage in dashboard

### OAuth Security

1. **Secure Storage**: Protect OAuth tokens like passwords
2. **Monitor Expiration**: Set up alerts for expiring tokens
3. **Audit Access**: Review OAuth scopes regularly
4. **Revoke Unused**: Remove tokens for inactive domains

### Key Rotation

**Client API Keys:**

1. Generate new key: `bun run scripts/auth/generate-api-key.ts`
2. Update credential file with new key
3. Update all clients with new key
4. Monitor old key usage for 24-48 hours
5. Remove old key from credential file

**Claude API Keys:**

1. Generate new key in Anthropic Console
2. Update credential files
3. Test proxy with new key
4. Revoke old key in Anthropic Console

**Rotation Schedule:**

- Client API keys: Every 90 days
- Claude API keys: Follow Anthropic's recommendations
- OAuth tokens: Auto-refreshed, but re-authenticate every 6 months

### Token Revocation

**OAuth Tokens:**

1. Remove from credential file to prevent usage
2. Revoke in Anthropic Console if compromised
3. Monitor logs for attempted usage

**API Keys:**

1. For client keys: Remove from credential file immediately
2. For Claude keys: Revoke in Anthropic Console
3. Generate and deploy new keys ASAP

### Monitoring and Alerting

**Key Metrics to Monitor:**

1. **Authentication Failures**: Track failed auth attempts
   - Alert on sudden spikes (possible attack)
   - Alert on consistent failures (configuration issue)

2. **Token Expiration**: Monitor OAuth token expiry
   - Alert 7 days before expiration
   - Alert on refresh failures

3. **Rate Limiting**: Track 429 responses
   - Alert when approaching limits
   - Implement backoff strategies

4. **Unusual Usage Patterns**:
   - Geographic anomalies
   - Unusual request volumes
   - Off-hours usage spikes

**Implementation:**

```bash
# View authentication logs
docker compose logs proxy | grep -E "auth|Auth|AUTH"

# Monitor token refresh events
docker compose logs proxy | grep "Token refreshed"

# Check for authentication failures
docker compose logs proxy | grep -E "401|403|Unauthorized"
```

## Dashboard Authentication

The monitoring dashboard uses a separate API key:

```bash
# In .env
DASHBOARD_API_KEY=your-secure-dashboard-key
```

Access the dashboard:

```javascript
// Using header
fetch('http://localhost:3001/api/stats', {
  headers: {
    'X-Dashboard-Key': 'your-secure-dashboard-key',
  },
})

// Using cookie (set by login page)
// Cookie: dashboard_auth=your-secure-dashboard-key
```

## Multi-Domain Setup

The proxy supports multiple domains with separate credentials, routing requests based on the `Host` header.

### How It Works

1. **Request Routing**: The proxy examines the `Host` header of incoming requests
2. **Credential Lookup**: Loads credentials from `credentials/{host}.credentials.json`
3. **Isolation**: Each domain has completely separate authentication and rate limits

### Directory Structure

```bash
credentials/
├── app1.example.com.credentials.json
├── app2.example.com.credentials.json
└── staging.example.com.credentials.json
```

### Example Setup

```bash
# Production domain with OAuth
cat > credentials/api.production.com.credentials.json << EOF
{
  "type": "oauth",
  "accountId": "acc_prod_12345",
  "client_api_key": "cnp_live_prod_key",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890000
  }
}
EOF

# Staging domain with API key
cat > credentials/api.staging.com.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "acc_staging_67890",
  "api_key": "sk-ant-staging-key",
  "client_api_key": "cnp_live_staging_key"
}
EOF
```

### Benefits

- **Isolation**: Complete separation between environments
- **Flexibility**: Different auth methods per domain
- **Account Separation**: Different Claude accounts per domain
- **Independent Quotas**: Each domain has its own rate limits
- **Easy Management**: Add/remove domains by managing credential files

## Environment Variables

### Authentication Configuration

```bash
# Enable/disable client authentication (default: true)
ENABLE_CLIENT_AUTH=true

# OAuth client ID (required for OAuth authentication)
CLAUDE_OAUTH_CLIENT_ID=your-oauth-client-id

# Dashboard authentication key
DASHBOARD_API_KEY=secure-dashboard-key

# Credentials directory (default: ./credentials)
CREDENTIALS_DIR=./credentials

# API key hashing salt (default: 'claude-nexus-proxy-default-salt')
# Change this in production for better security
API_KEY_SALT=your-custom-salt-value

# Request timeout settings
CLAUDE_API_TIMEOUT=600000  # 10 minutes
PROXY_SERVER_TIMEOUT=660000  # 11 minutes
```

## Monitoring Authentication

### View Auth Logs

```bash
# Enable debug mode
DEBUG=true bun run dev:proxy

# View auth-related logs
docker compose logs proxy | grep -i auth
```

### Track Authentication Metrics

The dashboard shows:

- Authentication success/failure rates
- Token refresh events
- Per-domain authentication methods
- OAuth token expiration status

## Next Steps

- [Configure your domains](./configuration.md)
- [Make your first API call](./api-reference.md)
- [Monitor usage in dashboard](./dashboard-guide.md)
- [Set up OAuth automation](../03-Operations/security.md)
