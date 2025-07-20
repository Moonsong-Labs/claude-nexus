# ADR-028: Request ID Middleware Consolidation

## Status

Accepted (Updated 2025-01-20)

## Context

The request ID middleware was duplicated across both the proxy and dashboard services, with identical implementation in:

- `services/proxy/src/middleware/request-id.ts`
- `services/dashboard/src/middleware/request-id.ts`

This duplication violated the DRY (Don't Repeat Yourself) principle and created maintenance overhead. Any changes to the middleware logic would need to be synchronized manually across both services.

## Decision

We have consolidated the request ID middleware into the shared package at `packages/shared/src/middleware/request-id.ts` with the following improvements:

1. **Single Source of Truth**: One implementation shared across all services
2. **Enhanced Documentation**: Comprehensive JSDoc comments explaining the purpose, format, and usage
3. **Distributed Tracing Support**: Check for existing `X-Request-ID` headers to support request correlation across services
4. **Better Code Organization**: Named constants for configuration values
5. **Type Safety**: Proper TypeScript types (though generic to avoid version conflicts)

### Implementation Details

The refactored middleware:

- Uses nanoid with a custom alphabet (excluding ambiguous characters) for 12-character IDs
- Checks for existing `X-Request-ID` headers before generating new ones
- Provides ~71 bits of entropy, sufficient for high-volume distributed systems
- Remains URL-safe and logging-friendly

## Consequences

### Positive

- **Reduced Code Duplication**: Single implementation to maintain
- **Consistent Behavior**: All services use the same request ID generation logic
- **Better Distributed Tracing**: Services can now correlate requests across the entire system
- **Improved Documentation**: Clear explanation of the middleware's purpose and behavior
- **Easier Updates**: Changes to request ID logic only need to be made in one place

### Negative

- **Additional Dependency**: Services now depend on the shared package for this middleware
- **Build Complexity**: Slightly more complex build process with shared dependencies

### Neutral

- **Migration Effort**: Minimal - just updating import statements in existing services

## Implementation Notes

The middleware is exported from `@claude-nexus/shared` and can be used as:

```typescript
import { requestIdMiddleware } from '@claude-nexus/shared'

app.use('*', requestIdMiddleware())
```

The middleware sets the request ID in both the Hono context (accessible via `c.get('requestId')`) and the response headers (as `X-Request-ID`) for debugging and client-side correlation.

## 2025-01-20 Update: Production Hardening

### Issues Identified

1. **Bug Fix**: The original implementation had a trim() bug where it checked the trimmed value but assigned the untrimmed one
2. **Type Safety**: Used generic Context/Next types without proper constraints
3. **Security**: No validation of incoming request IDs (potential for injection attacks)
4. **Flexibility**: Hard-coded configuration values with no customization options

### Improvements Implemented

1. **Hono Best Practices**: Now uses `createMiddleware` from `hono/factory` for proper type safety
2. **Configuration Options**: Added `RequestIdOptions` interface supporting:
   - Custom header names
   - Custom ID generators
   - Custom validation (regex or function)
   - Custom context key
3. **Security Hardening**: Default validation regex prevents injection attacks
4. **Bug Fix**: Properly handles trimming and validation of incoming IDs
5. **Comprehensive Testing**: Added full test suite covering all scenarios

### New Usage Examples

```typescript
// Basic usage (unchanged)
app.use('*', requestIdMiddleware())

// Custom configuration
app.use(
  '*',
  requestIdMiddleware({
    headerName: 'X-Trace-ID',
    generator: () => crypto.randomUUID(),
    validate: /^[0-9a-f-]{36}$/i,
    contextKey: 'traceId',
  })
)
```

### Future Considerations

The middleware is now extensible enough to support W3C Trace Context standard in the future if needed.
