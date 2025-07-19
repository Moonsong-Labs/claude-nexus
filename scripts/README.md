# Scripts Directory

This directory contains utility scripts for managing the Claude Nexus Proxy project, organized by purpose.

## Directory Structure

```
scripts/
├── db/              # Database management scripts
│   ├── migrations/  # Schema migration scripts
│   └── archived-migrations/  # Historical migrations (reference only)
├── auth/            # Authentication and OAuth utilities
├── dev/             # Development helper scripts
├── ops/             # Operations and deployment scripts
└── *.ts             # Root-level utility scripts
```

**Note:** The directory also contains `GROOMING_SUMMARY_*.md` files which are auto-generated summaries from code grooming sessions. These document the refactoring history of various scripts.

## Database Scripts (`db/`)

### Database Migrations (`db/migrations/`)

Numbered migration scripts for database schema evolution. See `db/migrations/README.md` for details.

### analyze-conversations.ts

Analyzes existing requests to preview conversation structure without modifying data.

```bash
bun run scripts/db/analyze-conversations.ts
```

### rebuild-conversations.ts

Retroactively computes conversation IDs and branches from existing requests. Processes data in configurable batches for memory efficiency.

```bash
# IMPORTANT: Backup first!
bun run scripts/db/backup-database.ts

# Dry run (default) - shows what would change without applying
bun run scripts/db/rebuild-conversations.ts

# Execute changes
bun run scripts/db/rebuild-conversations.ts --execute

# Options:
#   --execute                    Actually apply changes (default is dry run)
#   --domain <domain>            Filter by specific domain
#   --limit <number>             Limit number of requests to process
#   --batch-size <number>        Number of requests per batch (default: 1000)
#   --requests <ids>             Process specific request IDs (comma-separated)
#   --debug                      Enable debug logging and SQL query logging
#   --yes                        Skip confirmation prompt (auto-accept)

# Examples:
# Process with custom batch size for memory optimization
bun run scripts/db/rebuild-conversations.ts --batch-size 500 --execute

# Process specific domain with debug output
bun run scripts/db/rebuild-conversations.ts --domain example.com --debug

# Process specific requests
bun run scripts/db/rebuild-conversations.ts --requests "id1,id2,id3" --execute
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

### analyze-request-linking.ts

Analyzes request linking and conversation structure for debugging.

```bash
bun run scripts/db/analyze-request-linking.ts
```

### check-conversation-analyses.ts

Checks the status of conversation analyses in the database.

```bash
bun run scripts/db/check-conversation-analyses.ts
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

### test-client-setup.sh

Sets up test client configuration.

```bash
./scripts/dev/test-client-setup.sh
```

### test-sample-collection.sh

Tests the sample collection functionality for request/response data.

```bash
./scripts/dev/test/test-sample-collection.sh
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

## AI Analysis Scripts

### check-ai-worker-config.ts

Validates AI Analysis Worker configuration and provides troubleshooting guidance.

```bash
bun run scripts/check-ai-worker-config.ts
```

**Features:**

- Validates all AI worker environment variables
- Checks API key configuration
- Verifies model settings and token limits
- Provides actionable feedback for misconfigurations

### check-analysis-jobs.ts

Monitors the status of AI analysis jobs in the database.

```bash
bun run scripts/check-analysis-jobs.ts
```

### check-analysis-content.ts

Inspects analysis content for a specific conversation.

```bash
bun run scripts/check-analysis-content.ts <conversation_id> <branch_id>
```

### process-pending-analyses.ts

Manually triggers processing of pending analysis jobs.

```bash
bun run scripts/process-pending-analyses.ts
```

### fail-exceeded-retry-jobs.ts

Manually fails jobs that have exceeded the maximum retry limit.

```bash
# Preview changes without updating
bun run scripts/fail-exceeded-retry-jobs.ts --dry-run

# Execute changes
bun run scripts/fail-exceeded-retry-jobs.ts

# Skip confirmation prompt
bun run scripts/fail-exceeded-retry-jobs.ts --force
```

## Database Utility Scripts

### copy-conversation.ts

Copies conversations between databases, useful for debugging or migration.

```bash
# Copy a conversation to another database
bun run scripts/copy-conversation.ts --conversation-id <uuid> --dest-db <url> [options]

# Options:
#   --dry-run           Preview what would be copied
#   --include-chunks    Include streaming chunks
#   --source-table      Source table name (default: api_requests)
#   --dest-table        Destination table name (default: api_requests)

# Example
bun run scripts/copy-conversation.ts \
  --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@host:5432/db" \
  --dry-run
```

See [detailed documentation](../docs/03-Operations/utilities/copy-conversation.md) for more information.

## Test Generation Scripts

### generate-conversation-test-fixture.ts

Generates test fixtures from real database requests for conversation linking tests.

```bash
# Usage
bun scripts/generate-conversation-test-fixture.ts <parent_request_id> <child_request_id> [output_file] [description]

# Examples
bun scripts/generate-conversation-test-fixture.ts abc-123 def-456
bun scripts/generate-conversation-test-fixture.ts abc-123 def-456 branch-test.json "Test branch creation"
```

**Features:**

- Creates JSON fixtures in `packages/shared/src/utils/__tests__/fixtures/conversation-linking/`
- Sanitizes sensitive data (API keys, tokens)
- Automatically detects fixture type (standard or compact)
- Extracts summary content for compact conversations

### compute-fixture-hashes.ts

Updates hash values in conversation-linking test fixtures when the hashing algorithm changes.

```bash
# Update a single fixture
bun scripts/compute-fixture-hashes.ts path/to/fixture.json

# Update all fixtures in the default directory
bun scripts/compute-fixture-hashes.ts --all

# Dry run to see what would change
bun scripts/compute-fixture-hashes.ts --all --dry-run

# Verbose output
bun scripts/compute-fixture-hashes.ts --all --verbose

# Create backups before updating
bun scripts/compute-fixture-hashes.ts --all --backup

# Show help
bun scripts/compute-fixture-hashes.ts --help
```

**Features:**

- Batch processing of all fixtures with `--all` flag
- Safe dry-run mode to preview changes
- Backup creation to prevent data loss
- Verbose mode for debugging
- Validates fixture structure before processing
- Handles all fixture types: standard, compact, branch, and subtask
- Supports both string and array system prompts

## Other Utility Scripts

### generate-api-client.ts

Generates TypeScript API client code from OpenAPI specifications.

```bash
bun run scripts/generate-api-client.ts
```

### generate-prompt-assets.ts

Generates prompt assets for MCP (Model Context Protocol) integration.

```bash
bun run scripts/generate-prompt-assets.ts
```

### review-openapi-spec.ts

Reviews and validates OpenAPI specifications.

```bash
bun run scripts/review-openapi-spec.ts
```

### simulate-subtask-creation.ts

Simulates the creation of subtasks for testing conversation linking.

```bash
bun run scripts/simulate-subtask-creation.ts
```

### test-hash-system-reminder.ts

Tests the system reminder hash filtering functionality.

```bash
bun run scripts/test-hash-system-reminder.ts
```

### init-database.sql

SQL script for initializing the database schema. This is automatically used by the writer service when tables don't exist.

```bash
# Manually initialize database
psql $DATABASE_URL < scripts/init-database.sql
```

### find-conversations-not-starting-at-1.sql

SQL query to find conversations that don't start at message number 1, useful for debugging conversation linking issues.

```bash
# Run the query
psql $DATABASE_URL < scripts/find-conversations-not-starting-at-1.sql
```

## Environment Variables

Most scripts require these environment variables:

- `DATABASE_URL` - PostgreSQL connection string
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
