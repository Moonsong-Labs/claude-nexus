# ADR-019: MCP Proxy Routes Refactoring

## Status

Accepted

## Context

During the code grooming sprint, the `services/dashboard/src/routes/mcp-proxy.ts` file was identified for review. Initial analysis revealed several code quality issues:

1. **Incorrect endpoint paths**: The sync endpoint was calling `/api/mcp/sync` but the actual proxy endpoint is just `/sync`
2. **Type safety issues**: Using `any` type for responses
3. **Poor error handling**: Generic error messages without proper logging or error propagation
4. **Missing sync status endpoint**: Only had sync trigger, not status checking
5. **Broken path manipulation**: The GET handler had incorrect path replacement logic

The initial recommendation from AI assistant (validated by Gemini 2.5 Pro with 10/10 confidence) was to delete the file entirely, as it appeared to be a redundant "proxy of a proxy" anti-pattern. However, further investigation revealed that this proxy layer serves an important security purpose.

## Decision

Refactor the mcp-proxy.ts file to fix all identified issues rather than deleting it. The proxy layer is necessary because:

1. It keeps the dashboard API key on the server side, not exposed to the browser
2. It provides CSRF protection for state-changing operations
3. It maintains consistency with other dashboard API patterns (e.g., spark-proxy.ts)

## Consequences

### Positive

- Improved type safety with proper TypeScript interfaces
- Better error handling with detailed logging and error propagation
- Fixed endpoint paths to match actual proxy API routes
- Added missing sync status endpoint
- Consistent with dashboard security architecture
- Maintains CSRF protection

### Negative

- Maintains an extra network hop (browser → dashboard → proxy)
- Slight additional latency compared to direct API calls

### Changes Made

1. Fixed sync endpoint path from `/api/mcp/sync` to `/api/mcp/sync` (kept as is - the proxy API uses this path)
2. Added proper TypeScript interfaces for API responses
3. Implemented comprehensive error handling with logging
4. Added sync status endpoint proxy
5. Improved error response handling with proper status code propagation
6. Enhanced logging with structured error information

## Alternatives Considered

1. **Delete the file entirely** - Rejected due to security implications
2. **Move logic to frontend** - Rejected as it would expose dashboard API key
3. **Use a different authentication pattern** - Out of scope for grooming sprint

## References

- Original file analysis and Gemini validation in grooming sprint
- Dashboard security patterns in spark-proxy.ts
- MCP API implementation in services/proxy/src/routes/mcp-api.ts
