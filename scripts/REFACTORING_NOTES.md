# Script Refactoring Notes

This document tracks refactoring efforts for various scripts in the project to improve code quality, maintainability, and type safety.

## 2025-01-19: fail-exceeded-retry-jobs.ts

### Summary

Refactored the `fail-exceeded-retry-jobs.ts` script to align with project standards and improve safety/usability.

### Changes Made

1. **Added TypeScript Type Safety**
   - Imported `ConversationAnalysisJob` type from the AI worker
   - Used `ConversationAnalysisStatus` enum from shared types
   - Added proper typing for Pool, PoolClient, and query results
   - Created `FailureError` interface for consistent error structure

2. **Implemented CLI Arguments**
   - Added `--dry-run` flag to preview changes without database updates
   - Added `--force` flag to skip confirmation prompt (useful for automation)
   - Simple argument parsing using `process.argv`

3. **Enhanced Error Handling**
   - Added DATABASE_URL validation with proper exit code
   - Proper exit codes: 0 for success, 1 for errors
   - Comprehensive error handling with transaction rollback
   - Top-level catch handler for unhandled errors

4. **Added Transaction Support**
   - All database operations wrapped in a transaction
   - Automatic rollback on errors
   - Ensures atomicity of batch updates

5. **Improved Logging**
   - Added script header with timestamp and configuration
   - Clear visual separation with Unicode box characters
   - Detailed job information display
   - Progress indicators and success/error messages

6. **Better Code Organization**
   - Extracted helper functions: `getExceededJobs()` and `failJobs()`
   - Clear separation of concerns
   - Constants defined at the top
   - Consistent error message schema

7. **Standardized Error Storage**
   - Stores errors as JSON strings (matching TEXT column type)
   - Includes metadata: script name, timestamp, retry counts
   - Consistent with AI worker error handling patterns

### Rationale

- **Safety**: Dry-run mode prevents accidental data loss
- **Automation**: Force flag enables CI/CD integration
- **Reliability**: Transactions ensure data consistency
- **Maintainability**: TypeScript types catch errors at compile time
- **Consistency**: Follows patterns from other maintenance scripts

### Future Considerations

As suggested by Gemini's analysis, the long-term goal should be to integrate this logic directly into the AI worker to automatically fail jobs that exceed retry limits, making this script a fallback for edge cases only.

---

## Conversation Copy Script Refactoring

### Overview

This document outlines the refactoring applied to the `copy-conversation.ts` script to improve code quality, maintainability, and type safety.

## Key Improvements

### 1. Decomposed Main Function

**Before**: 120-line main() function handling everything
**After**: Main function reduced to ~40 lines with clear, focused steps:

- `parseCliArguments()`
- `validateEnvironment()`
- `createDatabaseClients()`
- `connectDatabases()`
- `startTransactions()`
- `validateTables()`
- `analyzeTableStructures()`
- `getConversationRequests()`
- `executeInDryRunMode()` or `executeCopy()`
- `commitTransactions()` or `rollbackTransactions()`
- `closeDatabaseConnections()`

### 2. Type Safety

**Before**: Using `any` types

```typescript
async function tableExists(client: any, tableName: string): Promise<boolean>
```

**After**: Proper TypeScript interfaces

```typescript
interface Config {
  conversationId: string
  sourceTable: string
  destTable: string
  destDbUrl: string
  dryRun: boolean
  includeChunks: boolean
  verbose: boolean
}

interface ApiRequest {
  request_id: string
  conversation_id: string
  timestamp: Date
  model?: string
  domain?: string
  [key: string]: any
}
```

### 3. Extracted Constants

**Before**: Magic strings and numbers scattered throughout

```typescript
if (error.code === '42P01') {
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

**After**: Named constants

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ERROR_CODES = {
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_COLUMN: '42703',
} as const

const QUERIES = {
  TABLE_EXISTS: `...`,
  GET_COLUMNS: `...`,
  // etc.
} as const
```

### 4. Improved Error Handling

**Before**: Duplicate error handling patterns
**After**: Centralized in focused functions with consistent patterns

### 5. Better Organization

The refactored version is organized into clear sections:

- Type Definitions
- Constants
- CLI Handling
- Environment Validation
- Database Operations
- Validation Functions
- Data Operations
- Execution Functions
- Main Function

### 6. Separation of Concerns

Each function now has a single, clear responsibility:

- `validateEnvironment()` - Only checks DATABASE_URL
- `connectDatabases()` - Only establishes connections
- `validateTables()` - Only checks table existence
- `analyzeTableStructures()` - Only compares columns
- `executeCopy()` - Only performs the copy operation

## Benefits

1. **Testability**: Each function can be tested independently
2. **Maintainability**: Changes are localized to specific functions
3. **Readability**: Clear function names express intent
4. **Type Safety**: Compile-time error checking
5. **Reusability**: Functions can be extracted to modules

## Next Steps

For production use, consider:

1. Split into multiple files (cli.ts, database.ts, types.ts, etc.)
2. Add unit tests for each function
3. Implement proper logging instead of console.log
4. Add progress indicators for large copies
5. Implement batch processing for better performance
