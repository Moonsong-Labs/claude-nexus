# Message Count Implementation Summary

## Overview

Added support for tracking message count as a database column, computed during insertion rather than at query time for better performance.

## Changes Made

### 1. Database Schema

- Added `message_count` column to `api_requests` table with index
- Updated existing migration script (`migrate-conversation-schema.ts`) to include the column
- Added column comment describing its purpose

### 2. Proxy Service Updates

- **MetricsService.ts**: Calculates message count from `request.raw.messages.length`
- **writer.ts**:
  - Added `messageCount` to `StorageRequest` interface
  - Updated SQL INSERT to include message_count column
- **StorageAdapter.ts**: Passes message count from MetricsService to writer

### 3. Dashboard Service Updates

- **reader.ts**:
  - Added `message_count` to `ApiRequest` interface
  - Updated queries to use `MAX(message_count)` instead of `COUNT(*)`
- **conversation-detail.ts**: Uses actual message_count from database
- **conversation.ts** types: Added message_count field

### 4. Scripts

- **rebuild-conversations.ts**:
  - Added support for computing and updating message_count for existing records
  - Logs how many records had message counts computed during rebuild

### 5. UI Changes

- **conversation-graph.ts**:
  - Removed message type icons from nodes
  - Changed node title from model name to first 8 characters of request ID
  - Adjusted text positioning for better centering

## Benefits

1. **Performance**: Pre-computed message count eliminates need for runtime calculation
2. **Accuracy**: Actual message count instead of estimated values
3. **Indexing**: Message count column is indexed for fast queries
4. **Backward Compatibility**: Default value of 0 for existing records

## Migration Steps

1. Run the migration script: `bun run scripts/migrate-conversation-schema.ts`
2. For existing records, use rebuild script which includes message count: `bun run scripts/rebuild-conversations.ts`

Note: The original `recalculate-message-counts.ts` script has been archived to `scripts/db/archived-migrations/` as it's no longer needed for new deployments.
