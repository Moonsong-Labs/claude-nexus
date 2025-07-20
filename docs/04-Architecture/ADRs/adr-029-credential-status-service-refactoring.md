# ADR-029: CredentialStatusService Refactoring

## Status

Accepted

## Context

The CredentialStatusService is a startup utility that checks all credential files and provides visibility into their health status. During code grooming review, several code quality issues were identified that needed addressing for production readiness.

### Issues Identified

1. **Async/Sync Inconsistency**: Methods marked as `async` were using synchronous file operations
2. **Type Safety**: Use of non-null assertion operator (`!`) bypassing TypeScript's null checking
3. **Magic Numbers**: Hardcoded time calculations without named constants
4. **Complex Methods**: 80+ line formatting method with multiple responsibilities
5. **Generic Error Handling**: Lack of specific error type checking and context

## Decision

We refactored the CredentialStatusService with the following changes:

1. **Converted to Async File Operations**: Replaced `readdirSync`, `statSync`, and `existsSync` with their async counterparts from `fs.promises` to align with the async method signatures
2. **Added Time Constants**: Extracted magic numbers into named constants for better readability
3. **Improved Type Safety**: Removed non-null assertions and added proper null checks
4. **Decomposed Complex Methods**: Broke down the large formatting method into smaller, focused helper methods
5. **Enhanced Error Handling**: Added specific error type checking and improved logging context

## Consequences

### Positive

- **Consistency**: Async operations now match method signatures
- **Future-Proofing**: Service can be easily adapted for runtime use (e.g., admin endpoints)
- **Maintainability**: Smaller, focused methods are easier to test and modify
- **Type Safety**: Eliminated potential runtime crashes from null assertions
- **Readability**: Named constants make time calculations self-documenting
- **Debugging**: Better error context aids in production troubleshooting

### Negative

- **Minimal Performance Impact**: Async operations add slight overhead for a startup-only service
- **More Code**: Decomposition increased line count slightly (but improved clarity)

### Trade-offs Accepted

While the service only runs at startup where blocking operations would be acceptable, using async operations provides consistency with modern Node.js practices and leaves the door open for future runtime usage without major refactoring.

## Implementation Details

### Key Changes

- Replaced sync file operations with `fs.promises` API
- Added time constants: `ONE_MINUTE_MS`, `ONE_HOUR_MS`, `ONE_DAY_MS`
- Created helper methods:
  - `groupStatusesByType()`: Groups statuses using reduce
  - `formatStatusLine()`: Formats individual status lines
  - `getStatusesNeedingAttention()`: Filters problematic statuses
- Added null check for OAuth credentials before access
- Enhanced error messages with operation context

### Testing

The refactored service was tested with actual credential files and confirmed to:

- Correctly identify credential statuses
- Format output identically to the original
- Handle missing directories gracefully
- Provide appropriate error messages

## References

- Original file: `services/proxy/src/services/CredentialStatusService.ts`
- Related: `services/proxy/src/main.ts` (usage at startup)
- Grooming guidelines: `GROOMING.md`
