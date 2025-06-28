# Conversation Copy Script

## Overview

The `copy-conversation.ts` script is a utility for copying all requests of a given conversation from one database table to another. It's designed to be flexible and work with configurable table names.

## Features

- **Flexible Table Names**: Works with any source and destination table names
- **Transaction Safety**: Uses database transactions to ensure atomic operations
- **Dry Run Mode**: Preview what would be copied without making changes
- **Streaming Chunks Support**: Optionally copy related streaming_chunks data
- **Comprehensive Error Handling**: Validates table existence and column compatibility
- **Verbose Logging**: Optional detailed logging for debugging

## Usage

```bash
bun run scripts/copy-conversation.ts --conversation-id <uuid> [options]
```

Or using the npm script:

```bash
bun run db:copy-conversation --conversation-id <uuid> [options]
```

## Options

- `--conversation-id <uuid>` - Required. The conversation ID to copy
- `--source-table <name>` - Source table name (default: nexus_query_logs)
- `--dest-table <name>` - Destination table name (default: nexus_query_staging)
- `--dry-run` - Show what would be copied without executing
- `--include-chunks` - Also copy related streaming_chunks data
- `--verbose` - Enable verbose logging
- `--help` - Show help message

## Examples

### Basic Copy

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000
```

### Dry Run

Preview what would be copied without making changes:

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 --dry-run
```

### Copy with Streaming Chunks

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 --include-chunks
```

### Custom Table Names

Copy from api_requests to api_requests_staging:

```bash
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --source-table api_requests --dest-table api_requests_staging
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

- `DATABASE_URL` - Required. PostgreSQL connection string

## Error Handling

The script will exit with appropriate error messages if:

- DATABASE_URL is not set
- Conversation ID is not provided or invalid
- Source or destination table doesn't exist
- Required columns are missing
- Database connection fails

## Notes

- The default table names (`nexus_query_logs` and `nexus_query_staging`) are used as requested, but these tables need to be created before using the script
- The script is designed to be generic and can work with any tables that follow a similar structure
- When copying streaming chunks, it maintains referential integrity with the copied requests
