# Domain Credentials

This directory contains credential files for domain-specific authentication.

## File Format

Each domain should have its own credential file named `<domain>.credentials.json`.

Two example templates are provided:
- `example.com.credentials.json` - OAuth authentication template
- `example-api-key.com.credentials.json` - API key authentication template

⚠️ **Security Note**: The example files use clear placeholder values like `YOUR-CLAUDE-API-KEY-HERE`. Never commit real credentials to version control. See [ADR-021](../docs/04-Architecture/ADRs/adr-021-credential-example-templates.md) for template design decisions.

## Credential Structure

### API Key Authentication

```json
{
  "type": "api_key",
  "accountId": "YOUR-UNIQUE-ACCOUNT-ID",       // Unique account identifier
  "api_key": "YOUR-CLAUDE-API-KEY-HERE",       // Your Claude API key
  "client_api_key": "YOUR-CLIENT-API-KEY-HERE", // Required for proxy authentication
  "slack": {                                    // Optional Slack configuration
    "webhook_url": "YOUR-SLACK-WEBHOOK-URL-HERE",
    "channel": "#your-channel-name",
    "username": "Claude Proxy",
    "icon_emoji": ":robot_face:",
    "enabled": false
  }
}
```

### OAuth Authentication

```json
{
  "type": "oauth",
  "accountId": "YOUR-UNIQUE-ACCOUNT-ID",        // Unique account identifier
  "client_api_key": "YOUR-CLIENT-API-KEY-HERE",  // Required for proxy authentication
  "oauth": {
    "accessToken": "YOUR-CLAUDE-ACCESS-TOKEN-HERE",
    "refreshToken": "YOUR-CLAUDE-REFRESH-TOKEN-HERE",
    "expiresAt": 1234567890000,                // Token expiration timestamp
    "scopes": [
      "user:inference",
      "user:profile"
    ],
    "isMax": true                               // Whether this is a Claude Pro account
  },
  "slack": {                                    // Optional Slack configuration
    "webhook_url": "YOUR-SLACK-WEBHOOK-URL-HERE",
    "channel": "#your-channel-name",
    "username": "Claude Proxy",
    "icon_emoji": ":robot_face:",
    "enabled": false
  }
}
```

## Security Features

### Client API Key Authentication

Each domain can have its own `client_api_key` that clients must provide to access the proxy. This adds an extra layer of security on top of the Claude API authentication.

To generate a secure client API key:

```bash
# From the credentials directory
bun run ../scripts/generate-api-key.ts
```

### How It Works

1. Clients must send the domain's API key in the `Authorization` header:
   ```
   Authorization: Bearer cnp_live_YOUR-API-KEY
   ```

2. The proxy verifies this key before forwarding requests to Claude API

3. If no `client_api_key` is configured for a domain, authentication is bypassed (unless disabled via `ENABLE_CLIENT_AUTH=false`)

## Security Best Practices

- Generate strong, random API keys using the provided script
- Store credential files securely with restricted permissions
- Rotate API keys regularly
- Never commit real credentials to version control
- Use environment-specific credential directories

## Example Setup

1. Generate a client API key:
   ```bash
   # From the credentials directory
   bun run ../scripts/generate-api-key.ts
   ```

2. Create credential file for your domain:
   ```bash
   # For OAuth authentication:
   cp example.com.credentials.json yourdomain.com.credentials.json
   
   # For API key authentication:
   cp example-api-key.com.credentials.json yourdomain.com.credentials.json
   ```

3. Edit the file and replace all placeholder values:
   - Replace `YOUR-UNIQUE-ACCOUNT-ID` with a unique identifier for your account
   - Replace `YOUR-CLAUDE-API-KEY-HERE` or OAuth tokens with your actual Claude credentials
   - Replace `YOUR-CLIENT-API-KEY-HERE` with the generated client API key
   - Configure optional Slack webhook if needed

4. Test the authentication:
   ```bash
   curl -H "Authorization: Bearer YOUR-CLIENT-API-KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"claude-3-opus-20240229","messages":[{"role":"user","content":"Hello"}]}' \
        https://yourdomain.com/v1/messages
   ```