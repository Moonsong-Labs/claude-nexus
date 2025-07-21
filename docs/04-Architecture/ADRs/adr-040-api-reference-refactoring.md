# ADR-040: API Reference Documentation Refactoring

Date: 2025-01-21

## Status

Implemented

## Context

During file grooming of `docs/02-User-Guide/api-reference.md`, several discrepancies were found between the documentation and actual implementation:

1. **Service Architecture Mismatch**: Documentation stated Dashboard API endpoints were served on port 3001, but investigation revealed all `/api/*` endpoints are actually served by the proxy service on port 3000
2. **Incorrect Authentication Headers**: Documentation showed `Authorization: Bearer` as the primary header for Dashboard API, but implementation uses `X-Dashboard-Key` as the preferred header
3. **Non-existent Endpoints**: Rate limiting endpoints and Server-Sent Events (SSE) were documented but not implemented
4. **Missing Documentation**: The `/api/domains` endpoint existed in code but was not documented

## Decision

Refactored the API reference documentation to accurately reflect the current implementation:

1. **Clarified Service Architecture**: Added note that all API endpoints (both proxy and dashboard) are served from the same base URL
2. **Updated Authentication Documentation**: Changed to show `X-Dashboard-Key` as the primary authentication header, with `Authorization: Bearer` and `X-API-Key` listed as alternatives
3. **Removed Unimplemented Endpoints**: Moved rate limiting and SSE endpoints to a new "Planned Features" section
4. **Added Missing Endpoints**: Documented the `/api/domains` endpoint under Analytics & Usage section
5. **Improved Structure**: Reorganized endpoints into logical groups:
   - Request & Conversation History
   - Conversation Analysis
   - Analytics & Usage

## Consequences

### Positive

- Documentation now accurately reflects the actual implementation
- Developers won't waste time trying to use non-existent endpoints
- Clear distinction between implemented and planned features
- Better organized structure makes it easier to find relevant endpoints

### Negative

- None identified

## References

- [API Reference Documentation](../../02-User-Guide/api-reference.md)
- [Proxy API Routes](../../../services/proxy/src/routes/api.ts)
- [API Authentication Middleware](../../../services/proxy/src/middleware/api-auth.ts)
