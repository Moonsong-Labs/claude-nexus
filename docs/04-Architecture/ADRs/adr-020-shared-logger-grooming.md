# ADR-020: Shared Logger Grooming

**Status:** Accepted  
**Date:** 2025-01-19  
**Driver:** Code grooming initiative  
**Approvers:** Gemini 2.5 Pro, O3-mini

## Context

During a code grooming exercise on `packages/shared/src/logger/index.ts`, we discovered:

1. The shared logger is actively used in production (by proxy service and as a type dependency)
2. Both proxy and dashboard services have their own duplicate logger implementations with more features
3. The service loggers have:
   - Request context helpers
   - Middleware functions
   - More comprehensive sensitive data masking
   - Class-based architecture

This creates code duplication and inconsistent logging approaches across the monorepo.

## Decision

We decided to take a **pragmatic, minimal refactoring approach** for this grooming task:

1. **Keep the shared logger** - It's actively used and changing it would require updates across services
2. **Make minimal enhancements**:
   - Added comprehensive type definitions for all commonly used fields
   - Implemented sensitive data masking with configurable sensitive keys
   - Improved documentation and added JSDoc comments
   - Added a `Logger` type export for better type safety
   - Added TODO comment with tracking information for future consolidation
3. **Defer consolidation** - Consolidating all three loggers is too complex for a grooming task

## Implementation Details

### Enhanced Type Definitions

- Extended `LogContext` interface to include commonly used fields (method, path, statusCode, etc.)
- Added `Logger` type export for better type inference
- Added `sensitiveKeys` option to `LoggerOptions`

### Sensitive Data Masking

- Implemented recursive masking for objects and arrays
- Default sensitive keys include common patterns (api_key, password, token, etc.)
- Special handling for:
  - Claude API keys (sk-ant-\*)
  - Client API keys (cnp\_\*)
  - Bearer tokens
  - Token count fields (excluded from masking)
- Support for additional custom sensitive keys per logger instance

### Documentation

- Added comprehensive JSDoc comments
- Added TODO comment referencing future consolidation with issue tracking
- Listed duplicate implementations for visibility

## Consequences

### Positive

- Improved security through better data masking
- Better type safety with comprehensive interfaces
- Maintains backward compatibility
- Clear documentation of technical debt
- Minimal risk to production systems

### Negative

- Code duplication remains (accepted trade-off)
- Inconsistent log formats across services continue
- Different logger APIs between shared and service implementations

## Future Work

A future consolidation effort should:

1. Create a unified logger with all features from service implementations
2. Provide middleware factories for Hono framework
3. Support request context helpers
4. Maintain consistent log format across all services
5. Consider adopting a standard logging library if complexity grows

The consolidation is tracked as technical debt and should be prioritized based on team capacity and the pain level of maintaining three separate implementations.

## Alternatives Considered

1. **Full consolidation now** - Rejected as too complex for a grooming task
2. **Adopt Pino** - Already rejected per ADR-019, current approach is sufficient
3. **Do nothing** - Rejected as the security improvements are valuable

## References

- ADR-019: Remove Unused Pino Logger
- Issue tracking: https://github.com/yourusername/claude-nexus-proxy/issues (to be created)
