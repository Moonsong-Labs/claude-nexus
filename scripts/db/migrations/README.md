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

Initial database schema creation with core tables:

- `api_requests` - Main table for storing API requests and responses
- `streaming_chunks` - Table for SSE response chunks
- `hourly_stats` - Materialized view for dashboard performance
- Basic indexes for efficient querying
- Table comments and documentation

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
bun run scripts/migrations/000-init-database.ts
bun run scripts/migrations/001-add-conversation-tracking.ts
bun run scripts/migrations/002-optimize-conversation-indexes.ts

# Run all migrations in order
for file in scripts/migrations/*.ts; do
  bun run "$file"
done
```

## Important Notes

1. Always run migrations in order (000, 001, 002, etc.)
2. Check if a migration has already been applied before running it
3. Test migrations on a development database first
4. Make backups before running migrations on production data
5. Some migrations include checks to prevent duplicate execution

## Future Migrations

When adding new migrations:

1. Use the next sequential number (e.g., 004-)
2. Use descriptive names after the number
3. Include comments explaining what the migration does
4. Add idempotency checks where possible (IF NOT EXISTS, etc.)
5. Update this README with the new migration details
