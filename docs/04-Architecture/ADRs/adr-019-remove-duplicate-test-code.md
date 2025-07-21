# ADR-019: Remove Duplicate Test Code

**Status:** Accepted  
**Date:** 2025-01-21  
**Author:** Code Grooming Initiative

## Context

During the code grooming sprint, we discovered multiple test files that were not actually testing the NotificationService implementation. Instead, they were duplicating the formatting logic inline within the test files.

Files identified with this issue:

- `test/unit/tool-notification-formatting.test.ts`
- `test/unit/notification-formatting.test.ts`

Key issues identified:

1. The test files imported ProxyResponse but didn't test NotificationService
2. All formatting logic was duplicated from NotificationService's `toolFormatters`
3. The tests were structured as examples rather than proper unit tests
4. NotificationService's formatting methods are private and formatters are not exported, making direct testing difficult
5. Both files exhibited the same anti-pattern of duplicating production code in tests

## Decision

We decided to **DELETE** both files:

- `test/unit/tool-notification-formatting.test.ts`
- `test/unit/notification-formatting.test.ts`

## Rationale

1. **No Real Test Coverage**: The file provided false confidence by appearing to test functionality while actually testing duplicated code
2. **Maintenance Burden**: Keeping duplicated logic in sync with the actual implementation creates unnecessary work
3. **Technical Debt**: The file was technical debt masquerading as a test
4. **Better Alternatives Exist**: The formatting logic is already tested indirectly through NotificationService usage in real scenarios

## Alternatives Considered

1. **Convert to Integration Test**: Test the full notification flow including formatting
   - Rejected: Would require significant setup and wouldn't provide focused unit testing
2. **Refactor NotificationService First**: Export formatters to enable unit testing
   - Rejected: Premature refactoring without clear need; formatting is already tested indirectly

## Consequences

### Positive

- Removes misleading test coverage
- Eliminates code duplication
- Reduces maintenance burden
- Makes test suite more honest about actual coverage

### Negative

- Removes the only explicit tests for notification formatting
- May need to revisit if formatting bugs arise

## Future Considerations

If explicit formatting tests become necessary:

1. Refactor NotificationService to export `toolFormatters` or create a separate formatting module
2. Write proper unit tests that test the actual implementation
3. Consider using snapshot testing for formatting consistency

## References

- Expert analysis from AI models (Gemini and O3) confirmed this approach
- GROOMING.md principles: remove dead code and maintain production-ready quality
