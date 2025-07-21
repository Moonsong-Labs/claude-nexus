# ADR-058: Proxy Test File Organization

## Status

Accepted

## Context

During the file grooming sprint, we identified that the `request-type-identification.test.ts` file was located in the root-level `/test/unit/` directory but was testing code from the proxy service (`/services/proxy/src/domain/entities/ProxyRequest.ts`).

The project follows a monorepo structure where each service should contain its own tests. There was already a `/services/proxy/tests/` directory with other proxy-related tests, indicating an inconsistency in test organization.

Additionally, the test was using brittle relative imports (`../../services/proxy/src/...`) instead of package-style imports, which goes against monorepo best practices.

## Decision

We decided to:

1. Move the test file from `/test/unit/request-type-identification.test.ts` to `/services/proxy/tests/request-type-identification.test.ts`
2. Co-locate the test fixtures by creating `/services/proxy/tests/fixtures/requests/` and moving the relevant JSON files there
3. Update imports to use:
   - Direct relative imports for proxy service code (e.g., `../src/domain/entities/ProxyRequest`)
   - Package imports for shared types (e.g., `@claude-nexus/shared`)
   - Local fixture imports (e.g., `./fixtures/requests/quota_haiku.json`)
4. Add test constants (`TEST_DOMAIN`, `TEST_REQUEST_ID`) to reduce repetition and improve maintainability

## Consequences

### Positive

- **Better organization**: Tests are co-located with the code they test, following monorepo best practices
- **Self-contained service**: The proxy service now contains all its code, tests, and test fixtures
- **Cleaner imports**: No more brittle relative paths reaching outside the service directory
- **Improved maintainability**: Test constants reduce repetition and make future changes easier
- **Consistent structure**: Aligns with the existing pattern where other proxy tests are in `/services/proxy/tests/`

### Negative

- **Minor duplication**: If other services need similar test fixtures, they would need their own copies
  - Mitigation: Currently, these fixtures are only used by this one test, so duplication is not an issue

### Neutral

- The test logic itself remains unchanged, ensuring no regression in test coverage
- All 15 tests continue to pass after the refactoring

## Implementation Notes

The refactoring was completed successfully with:

- Test file moved and updated with proper imports
- Fixtures copied to the new location
- Original files removed
- All tests passing

This change supports the broader goal of maintaining a clean, production-ready repository with proper separation of concerns in the monorepo structure.
