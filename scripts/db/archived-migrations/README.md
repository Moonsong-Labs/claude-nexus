# Archived Database Migrations

This folder contains one-time database migration scripts that have already been executed and are no longer needed for normal operations. These scripts are preserved for:

1. **Historical audit trail** - Understanding how the database evolved
2. **Troubleshooting** - Debugging legacy data issues
3. **Recovery scenarios** - In case old backups need to be migrated

## Important Notes

- **DO NOT RUN** these scripts unless you fully understand their purpose and impact
- These scripts may contain outdated logic that differs from current application behavior
- Running these scripts could cause data corruption or inconsistencies
- Always verify with the team before executing any archived migration

## Archived Scripts

### recalculate-message-counts.ts

- **Purpose**: One-time backfill of `message_count` column when it was added to `api_requests` table
- **Archived Date**: 2025-01-19
- **Reason**: The message_count is now calculated during insertion in the main application flow
- **Original Migration**: See migration 001-add-conversation-tracking.ts for column addition
