# OAuth Troubleshooting Guide

This guide helps troubleshoot OAuth authentication issues with the Claude Nexus Proxy.

## Common OAuth Errors

### "Failed to refresh token: 400 Bad Request - Refresh token not found or invalid"

This error occurs when:

1. The refresh token has expired or been revoked
2. The refresh token is invalid or corrupted
3. The OAuth client ID doesn't match the one used to create the token

**Solution:**
Re-authenticate to get new OAuth credentials:

```bash
bun run scripts/oauth-login.ts credentials/your-domain.credentials.json
```

### "No refresh token available"

This error means the OAuth credentials are missing a refresh token, which prevents automatic token renewal.

**Solution:**
Re-authenticate to get complete OAuth credentials with a refresh token.

## Diagnostic Tools

### Check OAuth Status

Use this script to check the status of OAuth credentials:

```bash
bun run scripts/check-oauth-status.ts credentials/your-domain.credentials.json
```

This shows:

- Access token status (valid/expired)
- Refresh token availability
- Token expiration time
- OAuth scopes

### Test OAuth Refresh

Test if a refresh token is working:

```bash
bun run scripts/test-oauth-refresh.ts <refresh_token>
```

### Refresh OAuth Token

Manually refresh a token for a specific domain:

```bash
bun run scripts/oauth-refresh.ts credentials/your-domain.credentials.json
```

Force refresh even if token is still valid:

```bash
bun run scripts/oauth-refresh.ts credentials/your-domain.credentials.json --force
```

### Refresh All OAuth Tokens

Check and refresh all expiring OAuth tokens:

```bash
# Dry run - see what would be refreshed
bun run scripts/oauth-refresh-all.ts credentials --dry-run

# Actually refresh expiring tokens
bun run scripts/oauth-refresh-all.ts credentials
```

### Re-authenticate OAuth

When refresh tokens fail, re-authenticate:

```bash
bun run scripts/oauth-login.ts credentials/your-domain.credentials.json
```

## OAuth Credential Structure

A valid OAuth credential file looks like:

```json
{
  "type": "oauth",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890000,
    "scopes": ["org:create_api_key", "user:profile", "user:inference"],
    "isMax": false
  }
}
```

## How OAuth Works in the Proxy

1. **Token Expiration Check**: The proxy checks if the access token will expire within 1 minute
2. **Automatic Refresh**: If expiring soon, it uses the refresh token to get a new access token
3. **Credential Update**: New tokens are saved back to the credential file
4. **Error Handling**: If refresh fails, the proxy logs detailed errors and suggests re-authentication

## Best Practices

1. **Monitor Token Expiration**: Use the check-oauth-status script regularly
2. **Keep Refresh Tokens Secure**: Don't share or expose credential files
3. **Re-authenticate Promptly**: When refresh fails, re-authenticate immediately
4. **Use Environment Variables**: Set `CLAUDE_OAUTH_CLIENT_ID` if using a custom OAuth client

## Environment Variables

- `CLAUDE_OAUTH_CLIENT_ID`: Custom OAuth client ID (default: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`)
- `DEBUG=true`: Enable detailed logging for OAuth operations

## Error Messages Explained

### During Token Refresh

The improved error handling now provides:

- HTTP status code
- Error code (e.g., `invalid_grant`)
- Detailed error description
- Suggestions for resolution

Example log output:

```
Failed to refresh OAuth token for /app/credentials/domain.credentials.json: Refresh token not found or invalid
Refresh token is invalid or expired. Re-authentication required.
Please run: bun run scripts/oauth-login.ts /app/credentials/domain.credentials.json
```

## Debugging Steps

1. **Check credential file exists**: `ls -la credentials/`
2. **Verify OAuth status**: `bun run scripts/check-oauth-status.ts credentials/domain.credentials.json`
3. **Test refresh token**: `bun run scripts/test-oauth-refresh.ts <refresh_token>`
4. **Re-authenticate if needed**: `bun run scripts/oauth-login.ts credentials/domain.credentials.json`
5. **Check logs**: Look for detailed error messages in proxy logs

## Security Notes

- OAuth tokens are stored in plain text in credential files
- Ensure credential files have appropriate permissions
- Never commit credential files to version control
- Refresh tokens don't expire but can be revoked by the user or Claude
