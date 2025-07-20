# ADR-024: Logger Refactoring

## Status
Accepted

## Context
The logger.ts file in the proxy service had accumulated technical debt:
- The LogEntry interface had grown to 30+ fields, many application-specific
- Sensitive data masking logic was complex with hard-coded patterns
- No JSDoc documentation existed
- Types were not exported for consumer type safety
- Direct console usage without abstraction

This refactoring was performed as part of the file grooming sprint to improve code quality and maintainability.

## Decision
We refactored the logger following these principles:

1. **Interface Segregation**: Split LogEntry to contain only core fields, moving application-specific fields to a `metadata` object
2. **Configuration Enhancement**: Made sensitive keys configurable via LoggerConfig
3. **Documentation**: Added comprehensive JSDoc comments
4. **Type Exports**: Exported LogEntry and LoggerConfig interfaces
5. **Code Organization**: Extracted constants, simplified methods, improved readability

## Consequences

### Positive
- **Better Maintainability**: Clear separation between core logging fields and application metadata
- **Type Safety**: Consumers can now import and use LogEntry and LoggerConfig types
- **Security**: Configurable sensitive data masking is more flexible and secure
- **Documentation**: JSDoc comments improve developer experience
- **Extensibility**: The metadata pattern allows adding context without modifying core interface

### Negative
- **Breaking Change**: All 40+ files using the logger needed updates to use metadata field
- **Migration Effort**: Required updating all log calls that used non-core fields

### Neutral
- Performance impact is negligible as the refactoring mainly reorganized code
- The console output mechanism remains unchanged (future enhancement opportunity)

## Implementation Details

### Core LogEntry Interface
```typescript
export interface LogEntry {
  timestamp: string
  level: LogLevel
  requestId: string
  message: string
  domain?: string
  method?: string
  path?: string
  statusCode?: number
  duration?: number
  error?: any
  metadata?: Record<string, any>  // For all application-specific fields
}
```

### Migration Pattern
Before:
```typescript
logger.info('Message', { ip: '127.0.0.1', model: 'claude-3' })
```

After:
```typescript
logger.info('Message', { metadata: { ip: '127.0.0.1', model: 'claude-3' } })
```

## Related ADRs
- ADR-012: Database Schema Evolution Strategy (similar incremental improvement approach)