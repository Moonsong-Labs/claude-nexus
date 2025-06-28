# Conversation Copy Script

## Overview

The `copy-conversation.ts` script is a utility for copying all requests of a given conversation between different databases. It's designed to copy data from one database to another, supporting both same and different table names.

## Features

- **Cross-Database Copying**: Copy conversations between different PostgreSQL databases
- **Flexible Table Names**: Works with any source and destination table names
- **Transaction Safety**: Uses database transactions on both connections to ensure atomic operations
- **Dry Run Mode**: Preview what would be copied without making changes
- **Streaming Chunks Support**: Optionally copy related streaming_chunks data
- **Comprehensive Error Handling**: Validates table existence and column compatibility
- **Verbose Logging**: Optional detailed logging for debugging

## Usage

```bash
bun run scripts/copy-conversation.ts --conversation-id <uuid> --dest-db <url> [options]
```

Or using the npm script:

```bash
bun run db:copy-conversation --conversation-id <uuid> --dest-db <url> [options]
```

## Options

- `--conversation-id <uuid>` - Required. The conversation ID to copy
- `--dest-db <url>` - Required. Destination database connection URL
- `--source-table <name>` - Source table name (default: api_requests)
- `--dest-table <name>` - Destination table name (default: api_requests)
- `--dry-run` - Show what would be copied without executing
- `--include-chunks` - Also copy related streaming_chunks data
- `--verbose` - Enable verbose logging
- `--help` - Show help message

## Examples

### Copy to Staging Database

Copy a conversation from production to staging database (same table names):

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db"
```

### Copy Between Different Table Names

Copy from api_requests in source to api_requests_backup in destination:

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db" \
  --source-table api_requests --dest-table api_requests_backup
```

### Dry Run

Preview what would be copied without making changes:

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db" --dry-run
```

### Copy with Streaming Chunks

Copy conversation including streaming response data:

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db" --include-chunks
```

## Expected Table Structure

Both source and destination tables should have a structure similar to the `api_requests` table with at least:

- `request_id` (UUID) - Primary key
- `conversation_id` (UUID) - For filtering conversations
- All other columns from the source should exist in the destination

The script will:

1. Check that both tables exist
2. Analyze column compatibility
3. Copy only columns that exist in both tables
4. Warn about any columns that exist in source but not in destination

## Safety Features

1. **Transaction Support**: All operations are wrapped in a database transaction
2. **Conflict Handling**: Uses `ON CONFLICT (request_id) DO NOTHING` to prevent duplicates
3. **Pre-flight Checks**: Validates tables and columns before copying
4. **Dry Run Mode**: Test the operation without making changes

## Environment Variables

- `DATABASE_URL` - Required. Source database PostgreSQL connection string

## Error Handling

The script will exit with appropriate error messages if:

- DATABASE_URL is not set
- --dest-db is not provided
- Conversation ID is not provided or invalid
- Source or destination table doesn't exist in their respective databases
- Required columns are missing
- Database connection fails

## Notes

- The default table name is `api_requests` for both source and destination
- The script is designed for cross-database copying, using DATABASE_URL for source and --dest-db for destination
- When copying streaming chunks, it maintains referential integrity with the copied requests
- Both database connections use separate transactions for data consistency
