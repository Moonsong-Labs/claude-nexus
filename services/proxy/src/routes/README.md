# API Routes

This directory contains the API route handlers for the proxy service.

## Structure

### Main Route Files
- `api.ts` - Main API routes for statistics, requests, conversations, and token usage
- `health.ts` - Health check endpoints
- `spark-api.ts` - Spark API integration routes
- `analyses.ts` - AI analysis routes
- `mcp-api.ts` - Model Context Protocol (MCP) routes

### Supporting Files (API module)
- `api-types.ts` - TypeScript type definitions for API requests and responses
- `api-constants.ts` - Constants for token limits, default values, and time intervals
- `api-queries.ts` - SQL query templates for database operations
- `api-utils.ts` - Utility functions for common operations (database pool, error handling, query parsing)

## API Organization

The API routes are organized into logical sections:

1. **Statistics Endpoints** (`/api/stats`)
   - Aggregated statistics
   - Model and request type breakdowns

2. **Request Endpoints** (`/api/requests`)
   - Recent requests listing
   - Request details with streaming chunks

3. **Domain Endpoints** (`/api/domains`)
   - Active domains listing

4. **Conversation Endpoints** (`/api/conversations`)
   - Conversation grouping with branch information
   - Sub-task tracking

5. **Token Usage Endpoints** (`/api/token-usage/*`)
   - Current window usage
   - Daily usage statistics
   - Time series data
   - Account-level usage

6. **Usage Analytics Endpoints** (`/api/usage/*`)
   - Hourly request counts
   - Hourly token usage

## Code Quality Improvements (2025-01)

The API routes module was refactored to improve maintainability and code quality:

- **Eliminated code duplication**: Database pool fallback pattern extracted to utility function
- **Improved type safety**: Replaced `any` types with proper TypeScript interfaces
- **Extracted constants**: Magic numbers moved to constants file
- **Simplified SQL queries**: Complex queries moved to dedicated queries file
- **Consistent error handling**: Standardized error responses via utility function
- **Better organization**: Routes grouped by feature with section comments

This refactoring maintains backward compatibility while improving developer experience and reducing maintenance burden.