# Agent 1: Type Consolidation & Shared Utilities

## Overview

You are responsible for consolidating duplicate type definitions and migrating shared utilities to the packages/shared directory.

## Working Branch

- Work on: `feature/cleanup-types-utilities`
- Create from: `feature/repository-cleanup`

## Phase 1: Type Consolidation (Days 1-2)

### Task 1: Consolidate Claude Types

1. Compare `/services/proxy/src/types/claude.ts` with `/packages/shared/src/types/claude.ts`
2. Merge all unique fields into the shared version
3. Keep the more flexible types from proxy (with `thinking` object)
4. Update all imports in both services to use `@claude-nexus/shared`

### Task 2: Consolidate Error Types

1. Compare `/services/proxy/src/types/errors.ts` with `/packages/shared/src/types/errors.ts`
2. Add `UpstreamError.upstreamResponse` property to shared version
3. Include Claude-specific error mapping from proxy
4. Update all imports to use shared version

### Task 3: Context Types Review

1. Check for overlapping types in context.ts files
2. Consolidate any duplicates into shared
3. Keep service-specific contexts separate

## Phase 2: Shared Utilities Migration (Days 3-4)

### Task 4: Generic Utilities

1. Move `/services/proxy/src/utils/retry.ts` to `/packages/shared/src/utils/`
2. Move `/services/proxy/src/utils/circuit-breaker.ts` to `/packages/shared/src/utils/`
3. Review `/services/dashboard/src/utils/formatters.ts` for generic functions
4. Move generic formatters to shared
5. Update all imports

### Task 5: Testing

1. Run `bun test` after each major change
2. Ensure all existing tests pass
3. Add tests for moved utilities if missing

## Coordination Points

- Sync with Agent 2 before merging to avoid conflicts
- Create separate PRs for type consolidation and utility migration
- Use descriptive commit messages following conventional format

## Success Criteria

- Zero duplicate type definitions
- All shared utilities in packages/shared
- All tests passing
- No breaking changes to existing functionality
