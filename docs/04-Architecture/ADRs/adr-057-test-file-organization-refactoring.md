# ADR-057: Test File Organization Refactoring

## Status

Accepted

## Context

During code grooming, we discovered the test file `test/unit/conversation-linking-special.test.ts` that was:

1. Located at the root-level `test/` directory instead of co-located with the code it tests
2. Testing functionality from `packages/shared/src/utils/conversation-hash`
3. Using improper relative imports that cross package boundaries (`../../packages/shared/src/utils/conversation-hash`)
4. Partially duplicating tests that exist in the main conversation-linker test file

This violates our project's test organization principles where tests should be co-located with the code they test, especially in a monorepo structure.

## Decision

We decided to:

1. Create a dedicated test file `packages/shared/src/utils/__tests__/conversation-hash.test.ts` for conversation hash functionality
2. Move all unique tests from the misplaced file to the new location
3. Delete the original file at `test/unit/conversation-linking-special.test.ts`
4. Ensure proper imports within the package structure

## Consequences

### Positive

- Tests are now co-located with the code they test, improving maintainability
- Proper import paths that don't cross package boundaries
- Consistent test organization across the monorepo
- Clearer test structure that matches the code structure
- Reduced confusion for developers looking for tests

### Negative

- Minor disruption to any existing references to the old test location (none found)
- Need to ensure CI/CD pipelines don't reference the old location

## Implementation Notes

- Created `packages/shared/src/utils/__tests__/conversation-hash.test.ts`
- Moved all 3 test suites: Conversation Summarization, Context Overflow Continuation, and Branch ID Generation
- Tests continue to pass without modification
- No other files referenced the old test location

## Related ADRs

- ADR-001: Monorepo Structure
- ADR-013: TypeScript Project References
