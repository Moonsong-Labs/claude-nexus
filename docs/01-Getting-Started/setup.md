# Setup Guide

Complete setup guide for Claude Nexus Proxy development and deployment.

## Prerequisites

- **[Bun](https://bun.sh)** runtime v1.0+ (exclusive - no Node.js)
- **PostgreSQL** 12+
- **Docker** (optional for containerized deployment)

## Essential Setup Commands

### 1. Database Initialization (Non-intuitive)

```bash
# Create database and run ALL migrations in order
createdb claude_nexus
bun run scripts/init-database.ts  # Runs all migrations sequentially
```

**Why**: Migrations must run in specific order due to foreign key dependencies. The init script handles this automatically.

### 2. Domain Credentials (Non-intuitive naming)

```bash
# Generate secure client API key
bun run scripts/generate-api-key.ts

# Create credential file - MUST match domain pattern
echo '{
  "type": "api_key",
  "accountId": "acc_unique_id",
  "api_key": "sk-ant-your-key",
  "client_api_key": "generated_key_from_above"
}' > credentials/your-domain.com.credentials.json
```

**Why**: File naming pattern `<domain>.credentials.json` is critical - the domain must exactly match the Host header in requests.

### 3. OAuth Token Refresh (Non-intuitive timing)

```bash
# Check OAuth expiry status
bun run auth:oauth-status

# Manual refresh (auto-refreshes 1 minute before expiry)
bun run scripts/auth/oauth-refresh.ts example.com
```

**Why**: The 1-minute pre-expiry refresh prevents race conditions during long-running requests.

## Development Setup

### Essential Environment Variables

```bash
# .env file - CRITICAL settings only
DATABASE_URL=postgresql://localhost/claude_nexus
DASHBOARD_API_KEY=your-secure-key  # ⚠️ CRITICAL: Without this, dashboard has NO auth!
STORAGE_ENABLED=true                # Required for conversation tracking
```

### TypeScript Project References (Non-intuitive)

```bash
# Build shared packages first - required for type checking
bun run build:shared
bun run typecheck  # Will fail without shared build
```

**Why**: Monorepo uses TypeScript project references (ADR-013). Shared packages must compile before dependent services can type-check.

## Production Deployment

### Security-Critical Configuration

```bash
# Production .env - security essentials
NODE_ENV=production
DASHBOARD_API_KEY=<strong-random-key>  # NEVER deploy without this!
ENABLE_CLIENT_AUTH=true                # Enforce API key authentication
FORCE_HTTPS=true                       # Prevent credential exposure
```

**Why**: Dashboard without API key exposes all conversation data (ADR-019).

### Docker Symlink Pattern (Non-intuitive)

```bash
# Avoid credential duplication with symlinks
mkdir -p client-setup
cp credentials/localhost:3000.credentials.json client-setup/.credentials.json
# Note: On Windows, colons in filenames are invalid. Use a hostname instead:
# cp client-setup/.credentials.json credentials/localdev.test.credentials.json
ln -sf ../client-setup/.credentials.json credentials/proxy:3000.credentials.json
```

**Why**: Prevents credential drift when multiple services need same auth.

## Performance Optimization

### Query Performance Monitoring

```bash
SLOW_QUERY_THRESHOLD_MS=1000  # Log queries >1s
SQL_DEBUG=true                 # See actual queries (dev only)
```

**Why**: N+1 query pattern was major bottleneck (resolved in ADR technical debt).

### Memory Leak Prevention

```bash
# Known issue: StorageAdapter requestIdMap grows unbounded
# Workaround: Restart proxy service periodically in production
```

**Why**: requestIdMap not cleared after request completion - technical debt item.

## Troubleshooting

### Common Non-Intuitive Issues

1. **"Missing required environment variable"** - Check both .env AND docker-compose.yml precedence
2. **OAuth expires during request** - Token refresh happens 1 minute before expiry, not at expiry
3. **Dashboard shows no data** - STORAGE_ENABLED must be true in proxy service
4. **Type errors in CI** - Must build shared packages before typecheck

## Next Steps

- [Environment Variables Reference](../06-Reference/environment-vars.md) - Complete configuration options
- [API Reference](../02-User-Guide/api-reference.md) - Integration details
- [Security Guide](../03-Operations/security.md) - Production hardening
