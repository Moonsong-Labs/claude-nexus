# ADR-023: Rate Limit Middleware Refactoring

Date: 2025-01-20
Status: Accepted

## Context

The rate-limit.ts middleware file in the proxy service had several code quality issues:

1. **Documentation Conflict**: CLAUDE.md stated "Rate limiting is handled by Claude API directly", but the middleware was actively used when ENABLE_METRICS=true
2. **Code Duplication**: createRateLimiter and createDomainRateLimiter had ~90% duplicate code
3. **Magic Numbers**: Hardcoded values without named constants
4. **Type Safety Issues**: Using NodeJS.Timeout instead of proper timer types
5. **Memory Management**: Potential memory leaks with intervals
6. **Cleanup Bug**: Hardcoded cleanup threshold that didn't respect configured window durations

## Decision

We decided to **keep and refactor** the rate limiting middleware rather than remove it, because:

1. Proxy-level rate limiting provides valuable protection and immediate feedback
2. It complements (not duplicates) Claude API's rate limiting
3. It can be used for usage tracking even without enforcement

## Implementation

### Phase 1 - Immediate Refactoring (Completed)

1. **Unified Rate Limiter Factory**: Created `createRateLimitMiddleware` to eliminate code duplication
2. **Fixed Cleanup Bug**: Added per-entry `expiresAt` timestamps instead of hardcoded values
3. **Extracted Constants**: Defined named constants for all magic numbers
4. **Improved Type Safety**: Used `ReturnType<typeof setInterval>` for timer types
5. **Added Error Handling**: Wrapped cleanup function in try-catch
6. **Enhanced Documentation**: Added comprehensive JSDoc comments explaining purpose and behavior

### Phase 2 - Future Enhancements (TODO)

1. **RateLimitStore Interface**: Prepare for Redis implementation for multi-instance deployments
2. **Configurable Enforcement**: Make blocking optional (tracking-only mode)
3. **Metrics Integration**: Better integration with observability tools

## Key Code Changes

- Reduced code from ~280 lines to ~200 lines (~30% reduction)
- Eliminated ~100 lines of duplicate code
- Added comprehensive documentation
- Fixed the cleanup bug that could cause memory leaks
- Improved logging with limiter names for better debugging

## Consequences

### Positive

- Cleaner, more maintainable code
- Fixed potential memory leak in cleanup logic
- Clear documentation of purpose and behavior
- Easier to extend with Redis support in future
- Better error handling and logging

### Negative

- Still uses in-memory storage (single-instance limitation)
- "Soft" token limiting behavior needs clear documentation
- Requires future work for multi-instance support

## Notes

The refactoring maintains backward compatibility while significantly improving code quality. The middleware now clearly documents that it provides proxy-level rate limiting separate from Claude API's own limits.