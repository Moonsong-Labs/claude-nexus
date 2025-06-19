# Database Scripts

This directory contains utility scripts for managing the Claude Nexus Proxy database.

## Conversation Management Scripts

### analyze-conversations.ts

A dry-run script that analyzes existing requests in the database to show what conversation structure would be created. This script does not modify any data.

**Usage:**
```bash
# Ensure DATABASE_URL is set
export DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Run the analysis
bun run db:analyze-conversations
```

**What it shows:**
- Total requests with message hashes
- Conversation chains that would be created
- Branch points detected
- Orphaned requests (parent hash not found)
- Statistics by domain

### rebuild-conversations.ts

Retroactively computes conversation IDs and branches from existing requests in the database. This script WILL modify your database by updating the `conversation_id` and `branch_id` fields.

**Usage:**
```bash
# Ensure DATABASE_URL is set
export DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# IMPORTANT: Backup your database first!
pg_dump $DATABASE_URL > backup_before_rebuild.sql

# Run the rebuild
bun run db:rebuild-conversations
```

**What it does:**
1. Loads all requests with message hashes
2. Builds conversation trees based on parent/child relationships
3. Assigns conversation IDs to related requests
4. Detects and labels branches when multiple requests share the same parent
5. Updates the database with the computed values

**How it handles edge cases:**
- When multiple parents exist for a message hash, it chooses the one from the same domain with the closest timestamp
- Orphaned requests (no parent found) become new conversation roots
- Branch points are created when multiple children share the same parent
- The first child (by timestamp) continues on the same branch, others get new branch IDs

## Other Scripts

### init-database.sql

SQL script to initialize the database schema. Usually not needed as the proxy service creates tables automatically on first run.

### dev-proxy.sh / dev-dashboard.sh

Development scripts to run the services with proper environment setup.

### generate-api-key.ts

Generates secure API keys for client authentication.

**Usage:**
```bash
bun run scripts/generate-api-key.ts
```

## Important Notes

1. **Always backup your database** before running any script that modifies data
2. The conversation rebuild script uses timestamps to determine parent-child relationships when ambiguous
3. Branch IDs are generated using timestamps to ensure uniqueness
4. The scripts respect domain boundaries - conversations don't span across domains