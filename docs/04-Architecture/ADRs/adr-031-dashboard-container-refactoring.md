# ADR-031: Dashboard Container Refactoring - Optional Database Support

## Date

2025-01-20

## Status

Accepted

## Context

The dashboard service's dependency injection container (`services/dashboard/src/container.ts`) needed refactoring to support the architectural transition from direct database access to API-first communication. Key issues identified:

1. **Singleton Pattern Issues**: Basic singleton with immediate initialization in constructor
2. **Configuration Duplication**: `buildDatabaseUrl()` duplicated logic from shared config
3. **Poor Error Handling**: Generic errors without context, no graceful degradation
4. **Tight Coupling**: Hard-coded dependencies without proper DI pattern
5. **Outdated Comments**: References to "Phase 3" removal
6. **Resource Management**: No handling of failed initialization
7. **Required Database**: Methods threw errors when database wasn't configured, preventing API-only operation

## Decision

We refactored the container to make the database connection truly optional while maintaining backward compatibility:

### 1. Lazy Initialization

- Moved initialization logic out of constructor
- Services are initialized on first access
- Prevents side effects during object creation

### 2. Centralized Configuration

- Removed `buildDatabaseUrl()` method
- Uses shared config from `@claude-nexus/shared/config`
- Eliminates code duplication

### 3. Enhanced Error Handling

- Contextual error messages for better debugging
- Graceful handling of database initialization failures
- Dashboard continues to work with just API client

### 4. Optional Storage Service

- Changed `getStorageService()` to return `StorageReader | undefined`
- All consumers updated to handle optional storage
- Enables API-only operation when database is unavailable

### 5. Comprehensive Documentation

- Added JSDoc comments for all public methods
- Documented optional vs required services
- Included usage examples

### 6. Improved Resource Management

- Better error handling in cleanup method
- Logging for all initialization and cleanup operations
- Proper error type checking

## Implementation Details

```typescript
// Key changes to the Container class:

class Container {
  private initialized = false

  // Lazy initialization on first service access
  private async initialize(): Promise<void> {
    if (this.initialized) return
    // ... initialization logic
    this.initialized = true
  }

  // Returns optional storage service
  getStorageService(): StorageReader | undefined {
    if (!this.initialized) {
      this.initialize().catch(err => {
        logger.error('Failed to initialize container', { error: err })
      })
    }
    return this.storageReader
  }
}

// Updated consumer code pattern:
const storageService = container.getStorageService()
if (!storageService) {
  return c.json({ error: 'Storage service not available' }, 503)
}
```

## Consequences

### Positive

- **Graceful Degradation**: Dashboard can operate without database using only API
- **Better Maintainability**: Cleaner code with proper separation of concerns
- **Production Ready**: Handles initialization failures gracefully
- **Future-Proof**: Supports transition to API-first architecture
- **Improved Developer Experience**: Clear error messages and documentation

### Negative

- **Breaking Change**: `getStorageService()` return type changed to optional
- **Consumer Updates**: All code using storage service needs null checks
- **Async Complexity**: Lazy initialization adds some complexity

### Migration Path

All consumers of `getStorageService()` were updated to handle the optional return value:

1. API endpoints return 503 Service Unavailable when storage is not available
2. UI routes show appropriate error messages
3. No functionality is silently broken

## References

- [ADR-009: Dashboard Architecture](./adr-009-dashboard-architecture.md)
- [Gemini 2.5 Pro Consensus Analysis](https://claude.ai/chat) - 9/10 confidence score
- Dashboard transition roadmap in CLAUDE.md
