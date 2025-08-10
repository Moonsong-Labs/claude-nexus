# Authentication Security - Critical Configurations

## ⚠️ CRITICAL SECURITY WARNINGS

### 1. Client Authentication Bypass

**Development-only setting that DISABLES all client auth:**

```bash
ENABLE_CLIENT_AUTH=false  # NEVER use in production
```

### 2. Host Header Domain Routing (Non-intuitive)

**The proxy routes credentials based on Host header, not request URL:**

```bash
# This determines which credential file is used
curl -H "Host: your-domain.com" http://localhost:3000/v1/messages
```

**File naming must match exactly:** `your-domain.com.credentials.json`

## 3. OAuth Token Auto-Refresh (Critical Timing)

**Non-intuitive timing decision - refreshes 1 minute before expiry:**

```bash
# The proxy adds this header automatically for OAuth requests
anthropic-beta: oauth-2025-04-20
```

**OAuth credential structure requires ALL fields:**

```json
{
  "type": "oauth",
  "accountId": "acc_unique_identifier",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890000,
    "scopes": ["org:create_api_key", "user:profile", "user:inference"],
    "isMax": false
  }
}
```

## 4. Essential OAuth Management Commands

**Force refresh OAuth token (bypasses timing logic):**

```bash
bun run scripts/oauth-refresh.ts credentials/domain.credentials.json --force
```

**Bulk OAuth refresh with dry-run safety check:**

```bash
bun run scripts/oauth-refresh-all.ts credentials --dry-run
```

## 5. Critical Security File Permissions

**Essential non-obvious credential security:**

```bash
chmod 600 credentials/*.json  # Read-only for owner
chmod 700 credentials/        # No group/other access
```

## 6. Dashboard Security Vulnerability

**CRITICAL:** Dashboard uses separate API key system:

```bash
# In .env - NEVER deploy production without this
DASHBOARD_API_KEY=your-secure-dashboard-key
```

**Dashboard access patterns:**

```javascript
// Header-based auth
headers: { 'X-Dashboard-Key': 'your-key' }

// Cookie-based (set by login page)
// Cookie: dashboard_auth=your-key
```

## OAuth Troubleshooting - Most Common Errors

### "Refresh token not found or invalid"

**Quick fix:** Re-authenticate completely

```bash
bun run scripts/oauth-login.ts credentials/your-domain.credentials.json
```

### Debug OAuth with token test

```bash
bun run scripts/test-oauth-refresh.ts <refresh_token>
```
