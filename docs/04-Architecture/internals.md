# Internals

This document provides a deep technical dive into the Claude Nexus Proxy implementation. It complements the [high-level architecture overview](../00-Overview/architecture.md) by focusing on implementation patterns, design decisions, and technical details.

## Overview

The Claude Nexus Proxy is built with Bun and the Hono framework, using TypeScript throughout. This document covers the core subsystems, their interactions, and the patterns used to achieve high performance, reliability, and maintainability.

## Request Processing Pipeline

The proxy service handles requests through a carefully orchestrated pipeline that ensures security, tracking, and proper error handling.

### Request Flow

1. **Request Reception** - Hono router receives HTTP request
2. **Domain Extraction** - Extract domain from Host header for multi-tenant support
3. **Authentication** - Two-layer authentication (client → proxy, proxy → Claude)
4. **Request Enhancement** - Add tracking headers, request IDs, conversation metadata
5. **Claude API Forwarding** - Stream or buffer request to Anthropic API
6. **Response Processing** - Handle streaming SSE or JSON responses
7. **Async Storage** - Queue data for batch database writes
8. **Client Response** - Return processed response maintaining original format

**Implementation**: See `services/proxy/src/controllers/MessageController.ts` for the main request handler

## Core Subsystems

### Storage System

The storage system handles persistent data with high performance through batching and efficient database operations.

#### Key Components

- **StorageAdapter** - Manages batch writes and request ID mapping
- **Database Writer** - Handles SQL operations with connection pooling
- **Partitioning** - Monthly partitions for api_requests and token_usage tables

**Implementation**:

- Storage adapter: `services/proxy/src/storage/StorageAdapter.ts`
- Database operations: `services/proxy/src/storage/db/writer.ts`
- Schema definitions: `scripts/init-database.sql`

#### Batch Processing Strategy

The system queues writes and flushes them based on:

- Batch size threshold (100 records)
- Time threshold (1 second)
- Graceful shutdown handling

This approach significantly reduces database connection overhead and improves throughput.

### Conversation Tracking

The conversation tracking system automatically links messages into conversations and detects branching when users revisit earlier points in a conversation.

#### Core Concepts

- **Message Hashing** - Each message gets a SHA-256 hash based on role and content
- **Parent-Child Linking** - Messages link to their parent via hash references
- **Branch Detection** - Automatic detection when multiple messages share a parent
- **System Hash Separation** - System prompts tracked separately to handle context changes
- **Content Normalization** - Consistent hashing regardless of content format

#### Special Handling

- **System Reminders** - Filtered out during hashing to maintain conversation continuity
- **Duplicate Messages** - Tool use/result duplicates automatically deduplicated
- **Conversation Summarization** - Special handling for compacted conversations
- **Branch Naming** - Automatic generation of meaningful branch IDs

**Implementation**:

- Core logic: `packages/shared/src/utils/conversation-linker.ts`
- Database schema: See conversation tracking fields in `api_requests` table
- Tests: `packages/shared/src/utils/__tests__/conversation-linker.test.ts`

### Token Management

The token tracking system provides comprehensive usage monitoring with support for Claude's 5-hour rolling windows.

#### Features

- **Per-Account Tracking** - Token usage tracked by account ID from credentials
- **Window Calculations** - Support for configurable time windows (default: 5 hours)
- **Cache Token Tracking** - Separate tracking for cache creation and read tokens
- **Real-time Aggregation** - Efficient queries for current usage statistics
- **Historical Analysis** - Daily aggregation for long-term usage patterns

#### Token Extraction

Tokens are extracted from various response types:

- Streaming responses (`message_start` events)
- JSON responses (`usage` field)
- Query evaluation responses
- Quota check responses

**Implementation**:

- Token extraction: `services/proxy/src/services/ProxyService.ts`
- Database queries: `services/proxy/src/services/metrics/TokenUsageCalculator.ts`
- API endpoints: `services/proxy/src/routes/token-usage.ts`

### Authentication & Security

The proxy implements multi-layer authentication to secure both client access and Claude API communication.

#### Authentication Layers

1. **Client → Proxy Authentication**
   - Bearer token validation using client API keys
   - Domain-based credential isolation
   - Timing-safe comparison for security

2. **Proxy → Claude Authentication**
   - API key authentication with `x-api-key` header
   - OAuth 2.0 with automatic token refresh
   - Session token support for Claude.ai accounts

#### Security Patterns

- **Credential Isolation** - Each domain has separate credential files
- **Path Traversal Prevention** - Domain validation before file access
- **Token Masking** - Sensitive data masked in logs and debug output
- **Request Sanitization** - Headers cleaned before storage

**Implementation**:

- Auth middleware: `services/proxy/src/middleware/auth.ts`
- Credential management: `services/proxy/src/services/credentialService.ts`
- OAuth handling: `services/proxy/src/auth/oauth.ts`

### MCP (Model Context Protocol) Server

The MCP server enables prompt management and serving through a standardized protocol, allowing integration with Claude Desktop and other MCP clients.

#### Architecture

- **Prompt Storage** - YAML-based prompt templates with Handlebars support
- **Hot Reloading** - Automatic reload when prompt files change
- **GitHub Sync** - Optional synchronization with remote repositories
- **Protocol Compliance** - Full MCP 2024-11-05 protocol implementation

#### Key Features

- File-based prompts automatically become slash commands
- Variable substitution with `{{variable}}` syntax
- Conditional logic support in templates
- Bearer token authentication for security
- JSON-RPC 2.0 protocol handling

**Implementation**:

- MCP server: `services/proxy/src/mcp/McpServer.ts`
- Prompt registry: `services/proxy/src/services/PromptRegistryService.ts`
- API routes: `services/proxy/src/routes/mcp-api.ts`
- GitHub sync: `services/proxy/src/services/GitHubSyncService.ts`

### AI Analysis Worker

The AI analysis worker provides automated conversation analysis using Google's Gemini models, running as a background job processor.

#### Architecture

- **Background Processing** - Async job queue with PostgreSQL-based locking
- **Concurrent Execution** - Configurable worker pool (default: 3 concurrent jobs)
- **Retry Logic** - Exponential backoff with configurable max retries
- **Graceful Degradation** - Stores raw text if JSON parsing fails

#### Analysis Pipeline

1. **Job Selection** - Poll for pending analysis requests
2. **Conversation Loading** - Fetch full conversation history
3. **Prompt Engineering** - Apply customizable analysis prompts
4. **Token Management** - Smart truncation to fit model limits
5. **Result Storage** - Structured data or fallback to raw text

#### Error Handling

- Sensitive content detection fails immediately
- API errors trigger exponential backoff
- Max retry exceeded auto-fails jobs
- Malformed JSON responses stored as text

**Implementation**:

- Worker: `services/proxy/src/workers/ai-analysis/AnalysisWorker.ts`
- Gemini integration: `services/proxy/src/workers/ai-analysis/GeminiService.ts`
- Database schema: Migration 011 and 012
- Configuration: See AI*WORKER*\* environment variables

### Sub-task Detection

The sub-task tracking system automatically identifies when Claude spawns new tasks using the Task tool.

#### Detection Mechanism

- **Single-Phase Detection** - Integrated into ConversationLinker
- **Temporal Matching** - 30-second window for task correlation
- **Exact Prompt Matching** - Uses PostgreSQL containment operators
- **Inheritance** - Sub-tasks inherit parent conversation context

#### Implementation Details

- Leverages GIN index on response_body for O(log n) performance
- SubtaskQueryExecutor pattern for dependency injection
- Branch naming: `subtask_1`, `subtask_2`, etc.
- Parent-child relationships tracked via `parent_task_request_id`

**Implementation**:

- Detection logic: Integrated in `packages/shared/src/utils/conversation-linker.ts`
- Database optimization: Migration 008
- Tests: `packages/shared/src/utils/__tests__/subtask-detection.test.ts`

## Performance Patterns

### Connection Management

The system uses PostgreSQL connection pooling to efficiently manage database connections:

- **Pool Size** - Configurable max connections (default: 20)
- **Idle Timeout** - Connections closed after 30 seconds of inactivity
- **Statement Timeout** - Queries timeout after 30 seconds
- **Connection Reuse** - Reduces overhead of establishing new connections

### Query Optimization Strategies

#### Efficient Aggregations

- Use of Common Table Expressions (CTEs) for complex queries
- Window functions for rolling calculations
- Partial indexes on frequently queried fields

#### Index Strategy

- GIN index on JSONB response_body for containment queries
- B-tree indexes on timestamp fields for time-based queries
- Partial indexes on enum fields (e.g., conversation analysis status)

#### Partitioning

- Monthly partitions for api_requests and token_usage tables
- Automatic partition creation via scheduled jobs
- Efficient data retention and archival

### Caching Patterns

- **Request ID Mapping** - In-memory cache for streaming chunk correlation
- **Credential Caching** - Reduces file system access
- **Dashboard Caching** - Configurable TTL for analytics queries

### Streaming Optimizations

- **Chunk Buffering** - Efficient handling of SSE streams
- **Backpressure Handling** - Prevents memory overflow
- **Zero-Copy Forwarding** - Direct stream piping where possible

## Dashboard Integration

The dashboard service provides real-time monitoring and analytics through a React-based web interface.

### Server-Sent Events (SSE)

The dashboard uses SSE for live updates:

- Real-time request monitoring
- Live token usage tracking
- Conversation flow visualization

### Message Parsing

Complex message handling for Claude responses:

- Multiple tool invocation display
- Duplicate content filtering
- System reminder removal
- Rich formatting with syntax highlighting

**Implementation**:

- Dashboard service: `services/dashboard/`
- Message parser: `services/dashboard/src/utils/conversation.ts`
- SSE handler: `services/dashboard/src/lib/sse-client.ts`
- React components: `services/dashboard/src/components/`

## Testing & Development Patterns

### Test Strategy

- **Unit Tests** - Core logic isolation with mocks
- **Integration Tests** - Database and API interaction
- **Fixture-Based Tests** - Real-world scenario validation
- **Type Safety** - TypeScript strict mode throughout

### Development Tools

- **Test Sample Collection** - Capture real API interactions
- **SQL Query Logging** - Debug mode query analysis
- **Debug Logging** - Comprehensive request/response logging
- **Mock Services** - Development without Claude API access

**Key Test Files**:

- Conversation linking: `packages/shared/src/utils/__tests__/conversation-linker.test.ts`
- Subtask detection: `packages/shared/src/utils/__tests__/subtask-detection.test.ts`
- Service tests: `services/proxy/tests/`

## Error Handling Patterns

### Graceful Degradation

- **Partial Failures** - Continue operation when non-critical services fail
- **Retry Logic** - Exponential backoff for transient failures
- **Circuit Breakers** - Prevent cascade failures
- **Error Context** - Rich error information for debugging

### Recovery Strategies

- **Automatic Reconnection** - Database and API connections
- **State Recovery** - Resume from last known good state
- **Data Integrity** - Transaction rollback on failures
- **Monitoring Integration** - Error tracking and alerting

## References

For additional technical details and related documentation:

- [Architecture Overview](../00-Overview/architecture.md) - High-level system architecture
- [Architecture Decision Records](./ADRs/) - Technical decisions and rationale
- [Database Operations](../03-Operations/database.md) - Schema and management
- [Environment Variables](../06-Reference/environment-vars.md) - Configuration reference
- [Development Guide](../02-Getting-Started/development.md) - Setup and workflow
- [CLAUDE.md](/CLAUDE.md) - Project overview and guidelines
