# ADR-028: Request ID Middleware Consolidation

## Status
Accepted

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