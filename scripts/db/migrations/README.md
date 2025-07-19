# Database Migrations

This directory contains all database migration scripts for the Claude Nexus Proxy project.

## Migration Naming Convention

Migrations are named with a 3-digit numeric prefix to ensure they run in the correct order:

- `000-` Initial database setup
- `001-` First migration
- `002-` Second migration
- etc.

## Migration Files

### 000-init-database.ts

Initial database schema creation wrapper that executes `init-database.sql`:

- **Special Role**: This migration serves as a wrapper for the init-database.sql file
- **Single Source of Truth**: Executes scripts/init-database.sql instead of duplicating schema
- **Idempotent**: Checks if core tables exist before execution
- **Path Resolution**: Searches multiple paths to find init-database.sql
- **Alignment with ADR-012**: Follows the principle that "init-database.sql remains for fresh installations"

This approach ensures that:

- Schema is maintained in one place (init-database.sql)
- No risk of schema drift between migration and init script
- Consistent with how writer.ts handles auto-initialization
- Easier maintenance - update only init-database.sql

### 001-add-conversation-tracking.ts

Adds conversation tracking columns to support message threading:

- `current_message_hash` - SHA-256 hash of the current message
- `parent_message_hash` - Hash of the parent message
- `conversation_id` - UUID grouping related messages
- `branch_id` - Branch identifier within conversations
- `message_count` - Total messages in conversation up to this point
- Related indexes for efficient querying

### 002-optimize-conversation-indexes.ts

Performance optimizations for conversation queries:

- Composite index on `conversation_id` and `timestamp`
- Covering index with commonly needed fields
- Table statistics update with ANALYZE

## Running Migrations

All migrations are TypeScript files that can be run with Bun:

```bash
# Run a specific migration
bun run scripts/db/migrations/000-init-database.ts
bun run scripts/db/migrations/001-add-conversation-tracking.ts
bun run scripts/db/migrations/002-optimize-conversation-indexes.ts

# Run all migrations in order
for file in scripts/db/migrations/*.ts; do
  bun run "$file"
done
```

## Important Notes

1. Always run migrations in order (000, 001, 002, etc.)
2. Check if a migration has already been applied before running it
3. Test migrations on a development database first
4. Make backups before running migrations on production data
5. Some migrations include checks to prevent duplicate execution

## Migration Details

### 003-add-subtask-tracking.ts

Adds support for detecting and linking sub-tasks created via Claude's Task tool:

- `parent_task_request_id` - References the parent task request
- `is_subtask` - Boolean flag for sub-task conversations
- `task_tool_invocation` - JSONB storing Task tool invocation details
- Retroactively processes existing data to link sub-tasks
- Creates GIN index for efficient JSONB queries

### 004-optimize-conversation-window-functions.ts

Performance optimizations for conversation queries using window functions:

- Composite index on (conversation_id, timestamp DESC, request_id DESC)
- Specialized index for sub-task filtering and ordering
- Ensures request_id is indexed for JOIN operations
- Removes redundant indexes
- Runs ANALYZE to update query planner statistics

### 005-populate-account-ids.ts

Populates the account_id column based on known domain-to-account mappings:

- Maps domains to their respective account IDs
- Only updates rows where account_id is NULL
- Creates performance index on (account_id, timestamp)
- Safe to run multiple times (idempotent)

### 006-split-conversation-hashes.ts

Separates system prompt hashing from message content hashing:

- Adds `system_hash` column for tracking system prompt changes
- Allows conversations to maintain links when system prompts change
- Creates index on system_hash for efficient queries
- Backward compatible with existing conversations

### 007-add-parent-request-id.ts

Adds direct parent request linking:

- `parent_request_id` - UUID reference to immediate parent request
- Foreign key constraint ensures referential integrity
- Populates existing data by matching parent/child message hashes
- Creates index for efficient parent-child queries

### 008-subtask-updates-and-task-indexes.ts

Optimizes Task tool queries and updates subtask conversation IDs:

- Updates subtasks to inherit parent conversation IDs
- Fixes branch numbering for consistency
- Creates specialized indexes for Task invocation queries
- Adds GIN index on response_body for efficient JSONB searches

### 009-add-response-body-gin-index.ts

Creates full GIN index on response_body:

- Enables efficient containment queries with @> operator
- Supports complex JSONB queries for Task tool detection
- Improves performance for subtask linking

### 010-add-temporal-awareness-indexes.ts

Adds indexes for temporal queries:

- Composite index on (conversation_id, timestamp)
- Partial index for subtask sequence queries
- Optimizes historical rebuild and temporal awareness features

### 011-add-conversation-analyses.ts

Creates infrastructure for AI-powered conversation analysis and audit logging:

**conversation_analyses table:**

- Stores AI-generated analyses for conversations
- ENUM type `conversation_analysis_status` for processing states
- Automatic `updated_at` trigger for timestamp management
- Unique constraint on (conversation_id, branch_id)
- Optimized indexes for pending analyses and conversation lookups
- Supports multiple AI models and comprehensive token tracking

**analysis_audit_log table:**

- Tracks all AI analysis related events for security monitoring
- Event types: ANALYSIS_REQUEST, ANALYSIS_REGENERATION_REQUEST, etc.
- Outcome tracking: SUCCESS, FAILURE_AUTH, FAILURE_RATE_LIMIT, etc.
- Comprehensive metadata storage with JSONB fields
- Indexes for efficient querying by conversation, domain, and timestamp
- Supports security monitoring and compliance requirements

## Future Migrations

When adding new migrations:

1. Use the next sequential number (e.g., 012-)
2. Use descriptive names after the number
3. Include comments explaining what the migration does
4. Add idempotency checks where possible (IF NOT EXISTS, etc.)
5. Update this README with the new migration details
6. Always use transactions (BEGIN/COMMIT/ROLLBACK)
7. Run ANALYZE after significant data changes
8. Test on a development database first
9. Consider performance impact on large tables
10. Document any manual steps required

## Best Practices

### Writing Idempotent Migrations

```typescript
// Adding columns
ALTER TABLE api_requests
ADD COLUMN IF NOT EXISTS new_column VARCHAR(255);

// Creating indexes
CREATE INDEX IF NOT EXISTS idx_name ON table(column);

// Updating data conditionally
UPDATE api_requests
SET column = value
WHERE column IS NULL;
```

### Transaction Safety

Always wrap migrations in transactions:

```typescript
try {
  await pool.query('BEGIN')
  // Migration logic here
  await pool.query('COMMIT')
} catch (error) {
  await pool.query('ROLLBACK')
  throw error
}
```

### Performance Considerations

- Run ANALYZE after bulk updates or index creation
- Consider table size when adding indexes
- Test query performance before and after
- Monitor migration execution time on large datasets

## Troubleshooting

If a migration fails:

1. Check the error message for details
2. Verify DATABASE_URL is set correctly
3. Ensure you have necessary permissions
4. Check if the migration was partially applied
5. Consider running with DEBUG=true for more details

See [ADR-012: Database Schema Evolution](../../../docs/04-Architecture/ADRs/adr-012-database-schema-evolution.md) for the architectural decisions behind this migration system.
