# Copy Conversation Utility

## Overview

The `copy-conversation.ts` script is a utility for copying all requests of a given conversation between different PostgreSQL databases. It supports cross-database copying with flexible table naming and comprehensive safety features.

For basic usage and examples, see the [Copy Conversation section in CLAUDE.md](../../../CLAUDE.md#copy-conversation-between-databases).

## Technical Details

### Expected Table Structure

Both source and destination tables should have a structure similar to the `api_requests` table with at least:

- `request_id` (UUID) - Primary key
- `conversation_id` (UUID) - For filtering conversations
- All other columns from the source should exist in the destination

The script will:

1. Check that both tables exist
2. Analyze column compatibility
3. Copy only columns that exist in both tables
4. Warn about any columns that exist in source but not in destination

### Safety Features

1. **Transaction Support**: All operations are wrapped in a database transaction
2. **Conflict Handling**: Uses `ON CONFLICT (request_id) DO NOTHING` to prevent duplicates
3. **Pre-flight Checks**: Validates tables and columns before copying
4. **Dry Run Mode**: Test the operation without making changes

### Environment Variables

- `DATABASE_URL` - Required. Source database PostgreSQL connection string

### Error Handling

The script will exit with appropriate error messages if:

- DATABASE_URL is not set
- --dest-db is not provided
- Conversation ID is not provided or invalid
- Source or destination table doesn't exist in their respective databases
- Required columns are missing
- Database connection fails

### Implementation Notes

- The default table name is `api_requests` for both source and destination
- The script is designed for cross-database copying, using DATABASE_URL for source and --dest-db for destination
- When copying streaming chunks, it maintains referential integrity with the copied requests
- Both database connections use separate transactions for data consistency
