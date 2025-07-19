# Grooming: simulate-subtask-creation.ts Refactoring

**Date**: 2025-07-19
**File**: `scripts/simulate-subtask-creation.ts`
**Branch**: file-grooming-07-18

## Summary

Converted a utility script that was essentially an integration test into a proper integration test within the test framework.

## Changes Made

### 1. File Relocation

- **Deleted**: `scripts/simulate-subtask-creation.ts`
- **Created**: `test/integration/subtask-linking.test.ts`
- **Created**: `test/integration/README.md`

### 2. Conversion to Proper Test

The original script was refactored into a proper Bun test suite with:

- Proper test framework structure (describe/it blocks)
- Automatic cleanup using beforeAll/afterAll hooks
- Multiple test cases covering different scenarios
- Better error handling and assertions

### 3. Documentation Updates

- Removed reference from `scripts/README.md`
- Added integration test documentation

## Rationale

1. **Proper Organization**: Integration tests belong in the test directory, not scripts
2. **Better Test Infrastructure**: Using the test framework provides:
   - Automatic test discovery
   - Proper setup/teardown
   - Better error reporting
   - CI/CD integration
3. **Maintainability**: Tests written with proper framework are easier to maintain
4. **Coverage**: Added multiple test scenarios beyond the original single happy path

## Test Coverage

The new integration test covers:

1. Successful subtask linking when matching prompt is found
2. No linking when no matching parent task exists
3. No linking when timing window has expired

## Known Issues

During testing, encountered database schema mismatch:

- Error: "value too long for type character varying(50)"
- The current schema defines domain as VARCHAR(255)
- Test database may have outdated schema
- Added documentation about this prerequisite in the test file

## Benefits

1. **Automated Testing**: Tests can now run as part of CI/CD pipeline
2. **Better Coverage**: Multiple scenarios tested instead of just one
3. **Proper Cleanup**: No risk of leaving test data in database
4. **Framework Benefits**: Leverages Bun test framework features
5. **Clear Purpose**: Integration tests are clearly separated from utility scripts

## Migration Notes

For developers who were using the original script:

- Run `bun test test/integration/subtask-linking.test.ts` instead
- Ensure database schema is up to date before running
- Tests require a running PostgreSQL instance with proper schema
