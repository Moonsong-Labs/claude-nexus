# ADR-019: Remove Unused Pino Logger

**Status:** Accepted  
**Date:** 2025-01-19  
**Driver:** Code grooming initiative  
**Approvers:** Gemini 2.5 Pro

## Context

During a code grooming exercise, we discovered that `packages/shared/src/logger/pino-logger.ts` was completely unused in the codebase. The file was added but never integrated into the project. The Pino dependency was installed solely for this unused file.

The project already has working logger implementations:

- A simple console-based logger in `packages/shared/src/logger/index.ts`
- Custom logger implementations in each service (proxy and dashboard)

## Decision

We decided to:

1. Delete the unused `pino-logger.ts` file
2. Remove the `pino` dependency from `packages/shared/package.json`
3. Remove the `@types/pino` devDependency
4. Keep the existing logger architecture as-is

## Consequences

### Positive

- Reduced dependency footprint (one less package to maintain/update)
- Cleaner codebase without dead code
- Eliminated confusion about the project's logging strategy
- Faster npm/bun install times
- Reduced security surface area

### Negative

- None identified

## Alternative Considered

We considered fully adopting Pino across the project, but this would require:

- Significant refactoring of existing logging code
- Testing to ensure no logging functionality is lost
- No clear benefit over the current simple logging approach

The current logger implementations are sufficient for the project's needs and follow a consistent pattern across services.
