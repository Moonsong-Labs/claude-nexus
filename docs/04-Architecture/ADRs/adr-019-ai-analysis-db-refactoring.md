# ADR-019: AI Analysis Database Module Refactoring

## Status

Accepted

## Context

The AI analysis database module (`services/proxy/src/workers/ai-analysis/db.ts`) needed refactoring to improve code quality, security, and maintainability. The module handles critical database operations for background worker job processing.

## Issues Identified

1. **SQL Injection Vulnerability**: The `resetStuckJobs` function used string interpolation for SQL query construction
2. **Code Duplication**: Error parsing logic was duplicated in the `failJob` function
3. **Poor Maintainability**: SQL queries were inline strings scattered throughout the code
4. **Missing Documentation**: Functions lacked JSDoc comments
5. **Complex Functions**: `fetchConversationMessages` was doing too much in a single function
6. **Inconsistent Error Handling**: Different error logging patterns across functions

## Decision

### 1. Fixed SQL Injection Vulnerability

- Replaced string interpolation with validated input for the INTERVAL clause
- Added bounds checking (1-60 minutes) to prevent invalid values
- Used string replacement with validated numeric values only

### 2. Extracted SQL Queries

- Created `SQL_QUERIES` constant object containing all SQL queries
- Improved readability and maintainability
- Easier to review and modify queries in one place

### 3. Reduced Code Duplication

- Created `parseErrorMessage` helper function for consistent error JSON parsing
- Created `logDatabaseError` helper for consistent error logging
- Eliminated duplicate error handling code

### 4. Added Comprehensive Documentation

- Added JSDoc comments to all exported functions
- Documented parameters, return types, and behavior
- Improved code discoverability and IDE support

### 5. Simplified Complex Functions

- Extracted `extractUserMessageContent` to handle different message formats
- Created `formatAssistantContent` to format response blocks
- Made `fetchConversationMessages` more readable and maintainable

### 6. Improved Type Safety

- Better typing for function parameters and returns
- Consistent use of existing types from shared package

## Consequences

### Positive

- **Security**: Eliminated SQL injection vulnerability
- **Maintainability**: Easier to modify and understand SQL queries
- **Code Quality**: Reduced duplication and improved readability
- **Documentation**: Better developer experience with JSDoc
- **Testability**: Smaller, focused functions are easier to test
- **Performance**: No performance degradation (all tests pass)

### Negative

- **File Size**: Slightly larger due to documentation and constants
- **Migration Risk**: Changes to critical job processing code (mitigated by comprehensive test coverage)

## Notes

- All existing tests pass without modification
- The refactoring maintains backward compatibility
- The row-level locking pattern (FOR UPDATE SKIP LOCKED) is preserved
- Error accumulation pattern for debugging is maintained
