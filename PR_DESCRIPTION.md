# Conversation Branching Updates

## Summary

This PR includes two main improvements:

1. **Cache Fix for Dashboard** - Addresses the issue where the dashboard was showing stale data
2. **Improved Conversation Branching Logic** - When multiple conversations have the same parent hash, the system now picks the conversation with fewer requests
3. **Database Migration Scripts** - Added scripts to retroactively compute conversation IDs and branches for existing data

## Changes

### 1. Dashboard Cache Improvements

- Reduced default cache TTL from 15 minutes to 30 seconds
- Added `DASHBOARD_CACHE_TTL` environment variable to control caching (set to 0 to disable)
- Added refresh functionality with `?refresh=true` parameter
- Added refresh button to the main dashboard
- Updated all cache operations to respect the TTL setting

### 2. Conversation Branching Logic

Modified the branching logic in the storage writer:

**`findConversationByParentHash`**:
- Find all conversations that contain a given parent hash
- Count the number of requests in each conversation
- Select the conversation with the fewest requests
- Log when multiple conversations are found for debugging

**`detectBranch`** (Bug Fix):
- Fixed issue where messages after a branch point were reverting to 'main'
- Now correctly inherits the branch ID from the parent message
- Only creates new branches when multiple children share the same parent
- Ensures continuous branch flow within a conversation

This ensures that:
- Smaller conversations (likely newer branches) get continued rather than always adding to larger, older conversations
- Messages stay on their parent's branch unless they're creating a new branch point

### 3. Database Scripts

Added two new scripts for conversation management:

- **`analyze-conversations.ts`** - Dry-run analysis of existing data showing:
  - Conversation chains that would be created
  - Branch points detected
  - Orphaned requests
  - Statistics by domain

- **`rebuild-conversations.ts`** - Retroactively computes conversation IDs and branches:
  - Builds conversation trees from message hashes
  - Assigns conversation IDs to related requests
  - Detects and labels branches
  - Updates the database with computed values

### Usage

```bash
# Analyze existing conversations (dry run)
bun run db:analyze-conversations

# Rebuild conversations (modifies database)
bun run db:rebuild-conversations
```

### Files Changed

- `/services/dashboard/src/storage/reader.ts` - Cache TTL updates
- `/services/dashboard/src/routes/dashboard-api.ts` - Refresh functionality
- `/services/proxy/src/storage/writer.ts` - Improved parent hash matching
- `/scripts/analyze-conversations.ts` - New analysis script
- `/scripts/rebuild-conversations.ts` - New rebuild script
- `/scripts/README.md` - Documentation for scripts
- `/CLAUDE.md` - Updated documentation
- `/package.json` - Added script commands