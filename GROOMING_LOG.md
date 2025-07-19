# Grooming Log

## 2025-01-19: Test Script test-any-model.sh Deletion

### File: `scripts/dev/test/test-any-model.sh`

#### Action: DELETED

#### Rationale:

1. **Temporary verification script**: The file was a one-off script to verify the proxy's model-agnostic behavior
2. **Feature already documented**: The proxy is documented as "Model-agnostic (accepts any model name)" in CLAUDE.md
3. **Not integrated with test framework**: Docker-based shell script not part of any formal testing
4. **Wrong location**: Located in `scripts/dev/test/` instead of proper `test/` directory
5. **No references**: Not referenced anywhere in the codebase
6. **Repository hygiene**: Removing unused scripts reduces clutter and technical debt

#### AI Consensus:

Both Gemini (9/10 confidence) and O3 (10/10 confidence) strongly agreed with deletion:

- Aligns with industry best practices for removing dead code
- Reduces maintenance burden and improves codebase clarity
- If model-agnostic testing is needed in future, it should be implemented as proper unit tests

#### Impact:

- No functional impact - the feature remains documented and working
- Cleaner repository structure
- Reduced confusion for future developers

## 2025-01-19: Migration 002-optimize-conversation-indexes.ts Grooming

### File: `scripts/db/migrations/002-optimize-conversation-indexes.ts`

#### Changes Made:

1. **Added missing import**: Added `getErrorMessage` from `@claude-nexus/shared` for consistent error handling across all migrations

2. **Enhanced documentation**:
   - Added comprehensive header comment explaining the migration's purpose
   - Documented that the migration is idempotent (safe to run multiple times)
   - Added reference to ADR-012 for database schema evolution strategy

3. **Improved error handling**: Replaced inline error string conversion with `getErrorMessage` utility for consistency

4. **Added index existence checking**: Migration now checks if indexes already exist before creating them and provides informative messages

5. **Enhanced progress messages**:
   - Added emoji indicators for better visual feedback
   - Made console output more descriptive
   - Shows exactly what's happening at each step

6. **Improved statistics reporting**:
   - Added index size information
   - Shows table and total size (with indexes)
   - Formats numbers with commas for readability
   - Fixed column reference from `tablename` to `relname` for pg_stat_user_tables

7. **Added timing information**: Tracks and reports total migration execution time

#### Rationale:

These changes align migration 002 with the established patterns in other migration files (001, 003, 004, etc.), improving:

- **Consistency**: All migrations now follow the same structure and patterns
- **Maintainability**: Clear documentation and consistent error handling
- **Operational Excellence**: Better logging helps with deployment monitoring
- **Safety**: Idempotency checks prevent issues from accidental re-runs

#### Impact:

- No functional changes to the database operations
- Migration remains backward compatible
- Improves developer experience during deployments
- Reduces risk through better error handling and logging

#### Validation:

- Validated plan with Gemini-2.5-pro (9/10 confidence score recommending the changes)
- Ran `bun run typecheck` - no type errors
- Tested migration script execution - runs successfully with proper output

#### Related:

- ADR-012: Database Schema Evolution Strategy
- Other migrations in scripts/db/migrations/ follow these same patterns

## 2025-01-19: Remove create-logging-pool.ts utility

### Summary

Removed the underutilized `scripts/db/utils/create-logging-pool.ts` utility file and updated the 3 scripts that used it to create PostgreSQL pools directly, matching the pattern used by 20+ other database scripts in the codebase.

### Rationale

1. **Poor adoption**: Only 3 out of 23 database scripts used this utility
2. **Consistency**: 20+ scripts already create pools directly - this is the de facto standard
3. **Type safety issues**: The utility used `any` type for options parameter
4. **Unnecessary abstraction**: The utility was a thin wrapper that added little value
5. **Reduce confusion**: Having two patterns for the same task increases cognitive load

### Changes Made

1. Updated 3 scripts to create pools directly with inline SQL logging configuration:
   - `scripts/db/rebuild-conversations.ts`
   - `scripts/db/analyze-request-linking.ts`
   - `scripts/db/analyze-conversations.ts`
2. Removed `scripts/db/utils/create-logging-pool.ts`
3. Removed empty `scripts/db/utils/` directory

### Implementation Details

Each script now follows the standard pattern:

```typescript
let pool = new Pool({
  connectionString: DATABASE_URL,
  // other options
})

// Enable SQL logging if DEBUG_SQL is set
if (process.env.DEBUG_SQL === 'true') {
  pool = enableSqlLogging(pool, {
    logQueries: true,
    logSlowQueries: true,
    slowQueryThreshold: Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 5000,
    logStackTrace: process.env.DEBUG === 'true',
  })
}
```

### Validation

- Consulted with Gemini-2.5-pro and O3-mini AI models - both recommended removal
- Ran `bun run typecheck` - no type errors
- Tested all 3 modified scripts - they run without import errors
- Verified SQL logging still works when DEBUG_SQL=true

### Decision

Following the "paving the cowpath" principle - formalized the dominant pattern that 87% of scripts were already using. This improves consistency and reduces maintenance burden without losing any functionality.

## 2025-01-19: Archive recalculate-message-counts.ts

### Summary

Archived the one-time database migration script `scripts/db/recalculate-message-counts.ts` that was used to backfill the `message_count` column when it was initially added to the database.

### Rationale

1. **Obsolete functionality**: The message_count is now calculated during insertion by the application (in writer.ts)
2. **Prevent confusion**: Keeping one-time migration scripts in the active codebase can confuse future developers
3. **Reduce risk**: The script could be run accidentally, potentially overwriting correct data with outdated logic
4. **Best practice**: Following industry best practices for handling completed one-time migrations

### Changes Made

1. Created `scripts/db/archived-migrations/` directory for historical migrations
2. Added README.md to archived-migrations explaining the purpose and warnings
3. Moved `recalculate-message-counts.ts` to the archived folder
4. Updated migration 001 documentation to include the historical backfill logic
5. Removed references from:
   - `scripts/README.md`
   - `package.json` (db:recalculate-counts script)
   - Updated `docs/04-Architecture/message-count-implementation.md`

### Validation

- Consulted with Gemini-2.5-pro and O3-mini for best practices
- Ran typecheck to ensure no breaking changes
- Verified archived script syntax is still valid

### Decision

Adopted a balanced approach combining both AI recommendations:

- Archive the script (per Gemini's recommendation) to prevent accidental execution
- Keep it in the repository (per O3-mini's recommendation) for audit trail
- Document the historical logic in the migration file for future reference

This maintains a complete migration history while ensuring obsolete scripts don't interfere with production operations.

## 2025-01-19: packages/shared/README.md Grooming

### File: `packages/shared/README.md`

#### Changes Made:

1. **Updated Overview Section**
   - Enhanced description to clarify the package's purpose
   - Mentioned the three well-defined entry points

2. **Added Installation Section**
   - Clarified that the package is automatically available in the monorepo workspace

3. **Restructured Usage Section**
   - Split into three subsections matching package.json exports: Main Export, Types Export, Config Export
   - Provided comprehensive examples showing what's available from each entry point
   - Aligned documentation with actual exports in package.json

4. **Replaced Contents Section with Available Modules**
   - Listed all modules accessible through the main export
   - Removed directory-based documentation that was incomplete and misleading
   - Focused on functionality rather than file structure

5. **Updated Development Section**
   - Kept existing commands
   - Added typecheck command

6. **Added Testing Section**
   - Documented how to run tests from the monorepo root

7. **Added TypeScript Configuration Section**
   - Mentioned TypeScript Project References usage

8. **Updated Build Output**
   - Corrected to mention ESM only (as per package.json "type": "module")
   - Removed incorrect mention of CommonJS

#### Rationale:

The previous README only documented 3 out of 7+ directories, leading to confusion. Import examples didn't match the actual package.json exports. The new structure follows best practices by documenting the public API (exports) rather than internal structure. This aligns with the principle that README should serve package consumers, not expose internals.

#### Testing:

- Verified `bun run build` succeeds
- Verified `bun run typecheck` passes
- No code changes were made, only documentation updates

## 2025-01-19: Truncation Test Refactoring

### File: `packages/shared/src/prompts/__tests__/truncation.test.ts`

#### Changes Made:

1. **Performance Optimization**
   - Reduced test execution time from ~62s to ~48s (22.7% improvement)
   - Replaced excessive string repetitions (350k) with calculated minimums
   - Maintained full test coverage for all edge cases

2. **Code Quality Improvements**
   - Removed unused variables (`_HEAD_MESSAGES`, `_firstContentMessage`)
   - Extracted magic numbers to named constants
   - Simplified array creation using `Array.from()` instead of for loops
   - Improved type safety in regex match parsing

3. **Constants Added**
   - `CHARS_PER_TOKEN`: Token to character ratio
   - `MAX_TOKENS`: Maximum token limit
   - `LARGE_MESSAGE_CHARS`: Standard large message size
   - `VERY_LARGE_MESSAGE_CHARS`: Extra large message size
   - `SINGLE_MESSAGE_EXCEED_CHARS`: Size for single message overflow test

#### Rationale:

The original tests were using excessively large strings (up to 15.75M characters) which caused:

- Slow test execution (over 1 minute)
- High memory usage
- Unnecessary CPU cycles

The refactored tests use calculated sizes based on actual tokenizer behavior (~16 chars/token) to:

- Trigger the same edge cases with smaller data
- Reduce memory pressure
- Improve developer experience with faster feedback

All test scenarios remain intact, ensuring the truncation functionality is thoroughly validated.

## 2025-01-19: Compact Branch Preservation Test Refactoring

### File: `packages/shared/src/utils/__tests__/compact-branch-preservation.test.ts`

#### Changes Made:

1. **Deleted the standalone test file**
   - Removed `compact-branch-preservation.test.ts` completely
   - The file contained 2 tests that were inconsistent with project patterns

2. **Created new JSON fixture**
   - Added `10-branch-with-existing-children.json` to cover missing test case
   - Tests branch creation for non-compact conversations with existing children

#### Issues Identified:

1. **Test Organization Inconsistency**
   - The project uses JSON fixtures for conversation linking tests
   - This file contained standalone code-based tests
   - Created inconsistency in test approach and maintenance

2. **Code Duplication**
   - Mock creation and setup code was duplicated
   - Manual hash computation duplicated actual implementation
   - Excessive boilerplate for simple test scenarios

3. **Redundant Coverage**
   - Compact branch preservation test was already covered by `05-compact-follow-up.json`
   - Only the branch creation with existing children scenario was missing

#### Benefits of Refactoring:

- **Consistency**: All conversation linking tests now use JSON fixtures
- **Maintainability**: Data-driven tests are easier to update and understand
- **Reduced Duplication**: No more duplicated mock setup code
- **Centralization**: All related tests in one place with consistent patterns
- **Simplicity**: JSON fixtures are clearer than imperative test code

#### Test Coverage:

- ✅ Compact branch preservation: Already covered by fixture `05-compact-follow-up.json`
- ✅ Branch creation with existing children: Now covered by new fixture `10-branch-with-existing-children.json`
- ✅ All tests continue to pass after refactoring (80 tests, 0 failures)
