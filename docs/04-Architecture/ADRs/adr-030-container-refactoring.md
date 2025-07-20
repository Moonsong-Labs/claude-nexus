# ADR-030: Container Refactoring - Production-Ready DI Implementation

## Date

2025-01-20

## Status

Accepted

## Context

The proxy service's dependency injection container (`services/proxy/src/container.ts`) had several code quality issues that needed to be addressed for production readiness:

1. **Code Duplication**: Two classes (Container and LazyContainer) with LazyContainer duplicating all 14 getter methods
2. **Poor Error Handling**: Generic "X not initialized" errors without context
3. **Complex Initialization**: 100+ line initialization method doing too much
4. **Async Anti-pattern**: Async operations in constructor using `.then().catch()`
5. **Missing Documentation**: Lack of JSDoc comments on public methods
6. **No Health Checks**: No way to verify service health

## Decision

We refactored the container to improve code quality while maintaining backward compatibility:

### 1. Eliminated Code Duplication

- Removed the LazyContainer class wrapper
- Maintained singleton pattern directly in Container class
- Reduced code by ~70 lines

### 2. Improved Error Handling

- Added contextual error messages for better debugging
- Proper error type checking with `instanceof Error`
- Clear hints about why services might not be initialized

### 3. Simplified Initialization

- Split `initializeServices()` into focused methods:
  - `initializeDatabase()` - Database pool setup
  - `initializeStorageServices()` - Storage adapters
  - `initializeCoreServices()` - Core business services
  - `initializeMcpServices()` - Optional MCP features

### 4. Fixed Async Pattern

- Maintained backward compatibility with synchronous constructor
- Added `waitForInitialization()` method for async contexts
- Proper async/await throughout initialization

### 5. Enhanced Documentation

- Added comprehensive JSDoc comments
- Clear documentation of return types and exceptions
- Explained when services might be undefined

### 6. Added Health Monitoring

- New `getHealth()` method returns detailed status
- Checks database connectivity, storage, and MCP services
- Returns structured `HealthReport` for monitoring

## Implementation Details

```typescript
// Health status types
interface HealthStatus {
  status: 'ok' | 'error' | 'degraded'
  message?: string
}

interface HealthReport {
  initialized: boolean
  database: HealthStatus
  storage: HealthStatus
  mcp: HealthStatus
}

// Backward-compatible initialization
constructor() {
  this.initializeServicesSync()
}

// New health check method
public async getHealth(): Promise<HealthReport>
```

## Consequences

### Positive

- **Improved Maintainability**: Cleaner code structure with focused methods
- **Better Debugging**: Contextual error messages help identify issues quickly
- **Production Ready**: Health checks enable proper monitoring
- **Backward Compatible**: No breaking changes to existing code
- **Type Safety**: Proper error handling with TypeScript type guards

### Negative

- **Async Complexity**: Still maintaining synchronous API for compatibility adds some complexity
- **Optional Async**: Consumers need to know about `waitForInitialization()` for guaranteed initialization

### Future Improvements

1. Consider migrating to fully async initialization in next major version
2. Add metrics collection for service initialization times
3. Implement circuit breakers for external service connections

## References

- [Dependency Injection Best Practices](https://blog.logrocket.com/dependency-injection-node-js-typedi/)
- [ADR-019: Single Composition Root](./adr-019-single-composition-root.md)
