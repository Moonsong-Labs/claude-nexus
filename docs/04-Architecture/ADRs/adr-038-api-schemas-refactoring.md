# ADR-038: API Schemas Documentation Refactoring

**Status**: Implemented  
**Date**: 2025-01-21  
**Author**: Claude (AI Assistant)

## Context

The `docs/06-Reference/api-schemas.md` file contained hardcoded TypeScript interface definitions, database schemas, and validation helpers that duplicated actual source code. This created several maintenance issues:

1. **Duplication**: TypeScript interfaces were copied from `packages/shared/src/types/claude.ts`
2. **Drift Risk**: Documentation could become out of sync with implementation
3. **Maintenance Burden**: Changes required updates in multiple places
4. **Hardcoded Lists**: Model validation contained hardcoded lists that would become outdated
5. **Second Source of Truth**: Created confusion about which was authoritative

## Decision

Transform the API schemas documentation from a code duplication file into a reference guide that:

1. Points to actual source files for type definitions
2. Provides high-level API endpoint descriptions
3. Includes usage examples
4. Links to related documentation
5. Serves as a navigation guide rather than implementation

## Consequences

### Positive

- **Single Source of Truth**: Source code becomes the authoritative reference
- **No Documentation Drift**: Documentation always points to current implementation
- **Reduced Maintenance**: No need to update documentation when types change
- **Better Developer Experience**: Developers can trust the documentation
- **Follows DRY Principle**: Eliminates code duplication

### Negative

- None identified

## Implementation

The file was refactored to:

1. Replace all TypeScript interface definitions with links to source files:
   - `packages/shared/src/types/claude.ts` for Claude API types
   - `services/dashboard/src/services/api-client.types.ts` for Dashboard types

2. Remove database schema section (duplicated `database.md`)

3. Keep high-level API endpoint information with examples

4. Add clear navigation to related documentation

## Validation

Gemini-2.5-pro strongly endorsed this approach with a 10/10 confidence score, noting it:

- Addresses a critical maintenance anti-pattern
- Is a "clear-cut improvement with virtually no downsides"
- Aligns with industry best practices
- Sets foundation for future automation (TypeDoc/JSDoc)

## Related

- [API Schemas Reference](../../06-Reference/api-schemas.md) - The refactored file
- [ADR-022: Documentation Strategy](adr-022-documentation-strategy.md) - Overall documentation approach
