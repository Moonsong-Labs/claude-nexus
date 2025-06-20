# Scripts Directory

This directory contains utility scripts for managing the Claude Nexus Proxy project, organized by purpose.

## Directory Structure

```
scripts/
├── db/           # Database management scripts
├── auth/         # Authentication and OAuth utilities
├── dev/          # Development helper scripts
├── ops/          # Operations and deployment scripts
└── test/         # Testing utilities
```

## Database Scripts (`db/`)

### Database Migrations (`db/migrations/`)
Numbered migration scripts for database schema evolution. See `db/migrations/README.md` for details.

### analyze-conversations.ts
Analyzes existing requests to preview conversation structure without modifying data.

```bash
bun run scripts/db/analyze-conversations.ts
```

### rebuild-conversations.ts
Retroactively computes conversation IDs and branches from existing requests.

```bash
# IMPORTANT: Backup first!
bun run scripts/db/backup-database.ts
bun run scripts/db/rebuild-conversations.ts
```

### recalculate-message-counts.ts
Updates the message_count field for all requests in the database.

```bash
bun run scripts/db/recalculate-message-counts.ts
```

### backup-database.ts
Creates database backups with automatic timestamping.

```bash
# Create backup database
bun run scripts/db/backup-database.ts

# Export to SQL file
bun run scripts/db/backup-database.ts --file

# Export to specific file
bun run scripts/db/backup-database.ts --file=backup.sql
```

## Authentication Scripts (`auth/`)

### generate-api-key.ts
Generates secure API keys for client authentication.

```bash
bun run scripts/auth/generate-api-key.ts
```

### oauth-login.ts
Initiates OAuth login flow for a domain.

```bash
bun run scripts/auth/oauth-login.ts example.com
```

### oauth-refresh.ts
Manually refreshes OAuth token for a specific domain.

```bash
bun run scripts/auth/oauth-refresh.ts example.com
```

### oauth-refresh-all.ts
Refreshes all OAuth tokens across all configured domains.

```bash
bun run scripts/auth/oauth-refresh-all.ts
```

### check-oauth-status.ts
Displays OAuth status and token information for all domains.

```bash
bun run scripts/auth/check-oauth-status.ts
```

## Development Scripts (`dev/`)

### dev-proxy.sh
Starts the proxy service in development mode.

```bash
./scripts/dev/dev-proxy.sh
```

### dev-dashboard.sh
Starts the dashboard service in development mode.

```bash
./scripts/dev/dev-dashboard.sh
```

### test-client-setup.sh
Sets up test client configuration.

```bash
./scripts/dev/test-client-setup.sh
```

## Operations Scripts (`ops/`)

### manage-nexus-proxies.sh
Manages multiple proxy instances.

```bash
./scripts/ops/manage-nexus-proxies.sh
```

### update-proxy.sh
Updates proxy deployment.

```bash
./scripts/ops/update-proxy.sh
```

## Test Scripts (`test/`)

Testing utilities and scripts for validating proxy functionality.

### test-any-model.sh
Tests proxy with various model configurations.

### test-dashboard-api.sh
Tests dashboard API endpoints.

### test-storage-behavior.sh
Validates storage functionality.

## Environment Variables

Most scripts require these environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `CLAUDE_API_KEY` - Default Claude API key (optional)
- `DASHBOARD_API_KEY` - Dashboard authentication key
- `CREDENTIALS_DIR` - Directory for domain credentials

## Best Practices

1. **Always backup your database** before running modification scripts
2. **Check script requirements** - Some scripts need specific environment variables
3. **Use absolute paths** when providing file arguments
4. **Run from project root** unless otherwise specified

## Adding New Scripts

When adding new scripts:

1. Place in the appropriate subdirectory
2. Make executable: `chmod +x script-name.ts`
3. Add shebang: `#!/usr/bin/env bun`
4. Document in this README
5. Consider adding to package.json scripts section