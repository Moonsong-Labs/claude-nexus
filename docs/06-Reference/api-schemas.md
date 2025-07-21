# API Schemas Reference

Reference guide for request and response schemas used in Claude Nexus Proxy.

## TypeScript Type Definitions

### Claude API Types

All Claude API type definitions are maintained in the source code:

- **Location**: [`packages/shared/src/types/claude.ts`](../../packages/shared/src/types/claude.ts)
- **Key Types**:
  - `ClaudeMessagesRequest` - Request format for Messages API
  - `ClaudeMessagesResponse` - Response format for Messages API
  - `ClaudeStreamEvent` - Streaming event types
  - `ClaudeContent` - Content block types (text, image, tool_use, tool_result)
  - `ClaudeUsage` - Token usage information

### Dashboard API Types

Dashboard-specific API types are defined in:

- **Location**: [`services/dashboard/src/services/api-client.types.ts`](../../services/dashboard/src/services/api-client.types.ts)
- **Key Types**:
  - `StatsResponse` - Dashboard statistics
  - `RequestDetails` - Detailed request information
  - `TokenUsageWindow` - Token usage tracking
  - `ConversationsResponse` - Conversation listing

## API Endpoints

### Claude Messages API

**Endpoint**: `POST /v1/messages`

Create a new message with Claude. The proxy transparently forwards requests to Claude's API while adding monitoring and storage capabilities.

**Example Request**:

```json
{
  "model": "claude-3-opus-20240229",
  "messages": [
    {
      "role": "user",
      "content": "Hello, Claude!"
    }
  ],
  "max_tokens": 1000
}
```

For complete schema details, see the [Claude API types](../../packages/shared/src/types/claude.ts).

### Proxy Monitoring Endpoints

#### Token Stats

- **Endpoint**: `GET /token-stats`
- **Description**: Get aggregated token usage statistics
- **Authentication**: Requires client API key

#### Health Check

- **Endpoint**: `GET /health`
- **Description**: Check proxy service health and database connectivity

### Dashboard API Endpoints

#### Statistics

- **Endpoint**: `GET /api/stats`
- **Description**: Get dashboard statistics and metrics
- **Authentication**: X-Dashboard-Key header

#### Token Usage

- **Current Window**: `GET /api/token-usage/current`
- **Daily History**: `GET /api/token-usage/daily`
- **Query Parameters**:
  - `accountId` - Filter by account
  - `window` - Time window in minutes (default: 300)

#### Conversations

- **List**: `GET /api/conversations`
- **Details**: `GET /api/requests/:id`
- **Query Parameters**:
  - `domain` - Filter by domain
  - `limit` - Maximum results

For complete API documentation, see [API Reference](../02-User-Guide/api-reference.md).

## Database Schema

For complete database schema documentation, see [Database Schema](../03-Operations/database.md).

## Error Handling

The proxy handles various error scenarios:

1. **Client Authentication Errors** (401)
   - Invalid or missing client API key
   - Expired OAuth tokens

2. **Claude API Errors** (4xx/5xx)
   - Rate limiting
   - Invalid requests
   - Model availability

3. **Proxy Errors** (500)
   - Database connectivity issues
   - Internal processing errors

Error responses follow a consistent format with `error.type` and `error.message` fields.

## Related Documentation

- [API Reference](../02-User-Guide/api-reference.md) - Complete API endpoint documentation
- [Authentication Guide](../02-User-Guide/authentication.md) - Authentication setup and configuration
- [Database Schema](../03-Operations/database.md) - Database tables and indexes
- [TypeScript Types](../../packages/shared/src/types/) - Source code type definitions
