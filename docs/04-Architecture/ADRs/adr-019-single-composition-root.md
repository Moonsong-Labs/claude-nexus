# ADR-019: Single Composition Root for Dependency Injection

## Date

2025-01-20

## Status

Accepted

## Context

The proxy service had duplicate dependency injection implementations:

1. `container.ts` - Proper DI container with lazy initialization
2. `server.ts` - Duplicate composition root that recreated all services

This duplication violated the DRY principle and created several issues:

- Services were instantiated twice with different configurations
- Maintenance burden from keeping both implementations in sync
- Risk of inconsistent dependency wiring
- Dead code (MessageController created but never used)
- Hardcoded database pool configuration duplicated

## Decision

We refactored `server.ts` to use the existing DI container from `container.ts`, following the single composition root pattern:

- Removed all duplicate service instantiation from `server.ts`
- Imported and used the `container` singleton
- Focused `server.ts` solely on HTTP server startup and graceful shutdown
- Added proper error handling with try-catch block
- Replaced manual resource cleanup with `container.cleanup()`

## Consequences

### Positive

- **Single source of truth** for dependency configuration
- **Reduced duplication** and maintenance burden
- **Consistent service instantiation** across the application
- **Better separation of concerns** - server.ts handles only server lifecycle
- **Proper resource cleanup** through centralized container cleanup

### Negative

- None identified - this is a clear improvement following established best practices

## References

- [Dependency Injection Best Practices](https://blog.logrocket.com/dependency-injection-node-js-typedi/)
- [Single Composition Root Pattern](https://dev.to/gdsources/tsyringe-and-dependency-injection-in-typescript-3i67)
