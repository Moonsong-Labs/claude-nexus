# Environment Variables - Critical Non-Obvious Settings

## ⚠️ CRITICAL SECURITY VARIABLES (NEVER deploy production without these)

| Variable            | Critical Impact if Missing                  | Required |
| ------------------- | ------------------------------------------- | -------- |
| `DASHBOARD_API_KEY` | **Dashboard exposes ALL conversation data** | ✅       |
| `DATABASE_URL`      | Service won't start                         | ✅       |

**Database URL with SSL (often overlooked):**

```bash
DATABASE_URL=postgresql://user:password@host:5432/claude_nexus?sslmode=require
```

## Non-Intuitive Timeout Configuration

**Critical timing relationship (server timeout MUST be > Claude timeout):**

```bash
CLAUDE_API_TIMEOUT=600000      # 10 minutes for Claude API
PROXY_SERVER_TIMEOUT=660000    # 11 minutes (must be higher!)
```

## Authentication Bypass (Development Only)

```bash
ENABLE_CLIENT_AUTH=false  # DISABLES ALL client authentication - NEVER use in production
```

## AI Analysis - Critical Truncation Logic (Most Complex)

**Non-intuitive token limits with safety margins:**

```bash
AI_MAX_CONTEXT_TOKENS=1000000        # Gemini model limit
AI_MAX_PROMPT_TOKENS=855000          # Calculated with safety margin
AI_TOKENIZER_SAFETY_MARGIN=0.95     # 5% safety buffer for tokenizer differences
```

**Tail-first priority truncation (preserves recent context):**

```bash
AI_HEAD_MESSAGES=5                   # Keep first 5 messages
AI_TAIL_MESSAGES=20                  # Keep last 20 messages (prioritized)
AI_ANALYSIS_TRUNCATE_FIRST_N_TOKENS=1000   # Tokens from start
AI_ANALYSIS_TRUNCATE_LAST_M_TOKENS=4000    # Tokens from end (4x more)
```

**Gemini-specific configuration:**

```bash
GEMINI_MODEL_NAME=gemini-2.0-flash-exp     # Default model for analysis
AI_ANALYSIS_REQUEST_TIMEOUT_MS=60000       # 1 minute timeout for Gemini requests
```

## OAuth Client ID (Non-obvious default)

```bash
CLAUDE_OAUTH_CLIENT_ID=9d1c250a-e61b-44d9-88ed-5944d1962f5e  # Anthropic's default OAuth client
```

## Critical Directory Configuration

```bash
CREDENTIALS_DIR=./credentials  # Must match docker volume mount path exactly
```

## Docker Compose Override Pattern (Non-intuitive)

**For custom configuration without modifying base compose file:**

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  proxy:
    environment:
      - DEBUG=true
      - STORAGE_ENABLED=true
```

## Essential Production Security Variables

```bash
NODE_ENV=production           # Enables production optimizations
FORCE_HTTPS=true             # Redirects HTTP to HTTPS
SECURE_COOKIES=true          # Requires HTTPS for cookies
```

## Critical Validation Pattern

**The proxy validates required variables on startup:**

```typescript
const requiredVars = ['DATABASE_URL', 'DASHBOARD_API_KEY']
// Will throw error if missing - prevents silent failures
```

## Domain Credentials File Naming (Critical Pattern)

**File naming MUST match domain exactly:**

- Domain: `example.com` → File: `example.com.credentials.json`
- Domain: `localhost:3000` → File: `localhost:3000.credentials.json`

**OAuth auto-refresh timing (non-intuitive):**

```jsonc
{
  "expiresAt": 1735689599000, // Unix timestamp
  // Proxy refreshes 1 minute BEFORE this time
}
```

## Common Environment Variable Errors

**Variable not loading:**

1. Check `.env` file location (must be in project root)
2. Verify format: `KEY=value` (no spaces around `=`)
3. No quotes unless value contains spaces

**Docker variable issues:**

1. Use `docker compose config` to verify resolution
2. Check precedence: CLI > docker-compose.yml > .env
3. Use `printenv` inside container to debug
