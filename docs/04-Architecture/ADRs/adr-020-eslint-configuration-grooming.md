# ADR-020: ESLint Configuration Grooming

## Status

Accepted

## Context

During the file grooming sprint, the ESLint configuration file (`eslint.config.js`) was identified as needing improvements:

1. **Inconsistent ignore patterns**: The `scripts/` directory was ignored by ESLint but processed by lint-staged
2. **Legacy globals**: The configuration included `__dirname` and `__filename` which are not available in ESM modules
3. **Missing modern globals**: Bun runtime globals like `fetch`, `Response`, etc. were not declared
4. **Redundant overrides**: Multiple separate file overrides for the `no-console` rule
5. **Lack of code quality rules**: Missing stricter TypeScript rules for production code quality

## Decision

We refactored the ESLint configuration with the following changes:

1. **Removed `scripts/**` from ignores\*\* to align with lint-staged configuration
2. **Updated globals**:
   - Removed: `__dirname`, `__filename` (not available in ESM)
   - Added: `Bun`, `fetch`, `Response`, `Request`, `URL`, `URLSearchParams`, `Headers`, `FormData`, `Blob`
3. **Consolidated no-console overrides** into a single file pattern array
4. **Added stricter TypeScript rules**:
   - `@typescript-eslint/consistent-type-imports`: Enforce using `import type` for type-only imports
   - `@typescript-eslint/no-floating-promises`: Prevent unhandled promises
   - `@typescript-eslint/no-misused-promises`: Prevent promise misuse
5. **Added code quality rules**:
   - `prefer-template`: Enforce template literals over string concatenation
   - `object-shorthand`: Enforce object literal shorthand syntax
6. **Improved documentation** with clear section headers and explanatory comments

## Consequences

### Positive

- **Consistent linting**: Scripts are now linted like other source files
- **Modern runtime support**: Proper globals for Bun runtime environment
- **Better code quality**: Stricter rules catch more potential issues
- **Improved maintainability**: Cleaner configuration with better organization
- **Type-safe imports**: Consistent use of type imports reduces bundle size

### Negative

- **Breaking changes**: Existing code may have new ESLint errors (but these are fixable)
- **Stricter rules**: Developers need to follow more stringent coding standards

### Neutral

- The configuration now better reflects the project's use of Bun and ESM modules
- Aligns with modern JavaScript/TypeScript best practices

## Implementation Notes

The changes were validated by:

1. Running `bun run lint` to ensure the configuration works
2. Verifying that scripts are now being linted
3. Confirming that new rules catch expected issues

## References

- [ESLint Flat Config Documentation](https://eslint.org/docs/latest/use/configure/configuration-files)
- [TypeScript ESLint Rules](https://typescript-eslint.io/rules/)
- [Bun Runtime Documentation](https://bun.sh/docs)
