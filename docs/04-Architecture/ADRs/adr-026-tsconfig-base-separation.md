# ADR-026: TypeScript Base Configuration Separation

## Status

Accepted

## Context

During a grooming sprint, we identified that the root `tsconfig.json` was violating TypeScript monorepo best practices by mixing configuration concerns. The file contained both compiler options and project references, which can lead to:

- Circular dependency issues
- Configuration drift between packages
- Maintenance overhead
- Violation of single responsibility principle

This issue was identified through code review and validated with industry best practices research.

## Decision

We have refactored the TypeScript configuration to follow the standard monorepo pattern:

1. **Created `tsconfig.base.json`** - Contains all shared compiler options
2. **Updated root `tsconfig.json`** - Now serves purely as an orchestrator for project references
3. **Updated all package/service tsconfigs** - Now extend the base configuration

### Key Changes

#### Before:

- Root tsconfig contained mixed responsibilities
- `composite: false` contradicted project references usage
- Risk of circular dependencies

#### After:

- Clear separation of concerns
- Base config for shared settings
- Root config as minimal orchestrator
- All projects extend base and override as needed

## Consequences

### Positive

- **Better Maintainability**: Single source of truth for compiler options
- **Prevents Configuration Drift**: All projects inherit from base
- **Follows Best Practices**: Aligns with TypeScript team recommendations
- **Clearer Architecture**: Each file has a single, clear purpose
- **Easier Onboarding**: New developers can understand the setup quickly

### Negative

- **Initial Setup Complexity**: Slightly more files to manage
- **Build Artifacts**: Projects must emit declaration files for references

### Technical Details

The refactoring required careful handling of the `noEmit` and `allowImportingTsExtensions` options:

- Base config doesn't set `noEmit` (allows projects to decide)
- Projects that emit must set `noEmit: false` explicitly
- Root config can use `allowImportingTsExtensions` with `noEmit: true`

## Validation

The refactoring was validated through:

1. Consensus workflow with Gemini-2.5-pro (10/10 confidence) and O3-mini (9/10 confidence)
2. Successful `tsc --build` execution
3. Alignment with TypeScript documentation and industry standards

## Links

- [TypeScript Project References Documentation](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [ADR-013: TypeScript Project References](./adr-013-typescript-project-references.md)
- [Best Practices Research](https://moonrepo.dev/docs/guides/javascript/typescript-project-refs)

## Notes

This change maintains full compatibility with the existing build process while improving the long-term health of the codebase. The pattern implemented here is the de facto standard for TypeScript monorepos using project references.

---

Date: 2025-01-19
Authors: Claude Assistant, crystalin
