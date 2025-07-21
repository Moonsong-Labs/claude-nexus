# ADR-016: MCP Server Implementation

## Status

Superseded on 2024-12-10

> **Notice**: This ADR proposed a database-backed MCP implementation that was ultimately rejected in favor of a simpler file-based approach. The actual implementation and accepted architecture are documented in [ADR-017: MCP Prompt Sharing Implementation](./adr-017-mcp-prompt-sharing.md).

## Context

Claude Nexus Proxy needs to implement a Model Context Protocol (MCP) server that serves prompts from a GitHub repository. The MCP server should:

- Be integrated into the existing proxy service (not a separate service)
- Only serve prompts (no tools or resources)
- Fetch prompts from a frequently updated GitHub repository
- Provide a dashboard UI for prompt management
- Use the existing PostgreSQL database and TypeScript/Bun runtime

## Decision

### Architecture Overview

The MCP server will be implemented as a new module within the proxy service, exposing JSON-RPC 2.0 endpoints according to the MCP specification. It will consist of:

1. **MCP Protocol Handler** - JSON-RPC 2.0 endpoint at `/mcp/rpc`
2. **GitHub Sync Service** - Background service for repository synchronization
3. **Prompt Storage** - PostgreSQL tables for caching prompts
4. **Dashboard Integration** - UI components for prompt management
5. **REST API** - Additional endpoints for dashboard functionality

### Component Design

#### 1. MCP Protocol Implementation

```typescript
// services/proxy/src/mcp/McpServer.ts
interface McpServer {
  // Core MCP methods
  handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>

  // MCP protocol methods
  initialize(params: InitializeParams): Promise<InitializeResult>
  listPrompts(params: ListPromptsParams): Promise<ListPromptsResult>
  getPrompt(params: GetPromptParams): Promise<GetPromptResult>
}
```

**Endpoints:**

- `POST /mcp/rpc` - Main JSON-RPC 2.0 endpoint
- Supports methods: `initialize`, `prompts/list`, `prompts/get`

#### 2. Database Schema

```sql
-- MCP prompts table
CREATE TABLE mcp_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id VARCHAR(255) UNIQUE NOT NULL,  -- GitHub file path as ID
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    arguments JSONB,  -- Prompt arguments/parameters
    metadata JSONB,   -- Additional metadata from GitHub
    github_path VARCHAR(500) NOT NULL,
    github_sha VARCHAR(40),  -- Git commit SHA
    github_url TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- MCP sync status
CREATE TABLE mcp_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository VARCHAR(255) NOT NULL,
    branch VARCHAR(100) DEFAULT 'main',
    last_sync_at TIMESTAMPTZ,
    last_commit_sha VARCHAR(40),
    last_error TEXT,
    sync_status VARCHAR(50) DEFAULT 'pending', -- pending, syncing, success, error
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MCP prompt usage tracking
CREATE TABLE mcp_prompt_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    account_id VARCHAR(255),
    request_id UUID REFERENCES api_requests(request_id),
    used_at TIMESTAMPTZ DEFAULT NOW(),
    arguments JSONB,
    FOREIGN KEY (prompt_id) REFERENCES mcp_prompts(prompt_id)
);

-- Indexes
CREATE INDEX idx_mcp_prompts_prompt_id ON mcp_prompts(prompt_id);
CREATE INDEX idx_mcp_prompts_active ON mcp_prompts(is_active);
CREATE INDEX idx_mcp_prompt_usage_prompt_id ON mcp_prompt_usage(prompt_id);
CREATE INDEX idx_mcp_prompt_usage_used_at ON mcp_prompt_usage(used_at);
```

#### 3. GitHub Integration

```typescript
// services/proxy/src/mcp/GitHubSyncService.ts
interface GitHubSyncService {
  syncRepository(): Promise<void>
  fetchPrompts(): Promise<Prompt[]>
  parsePromptFile(content: string, path: string): Prompt
  setupWebhook(): Promise<void>
}
```

**Sync Strategy:**

- Poll GitHub API every 5 minutes (configurable)
- Support webhook notifications for instant updates
- Parse YAML/JSON/Markdown files with frontmatter
- Store prompts with versioning

**File Format Support:**

```yaml
# prompts/code-review.yaml
id: code-review
name: Code Review Assistant
description: Helps review code for best practices
arguments:
  - name: language
    type: string
    required: true
    description: Programming language
  - name: context
    type: string
    required: false
    description: Additional context
content: |
  You are a code review assistant for {language} code.
  {context}

  Please review the following code...
```

#### 4. REST API for Dashboard

```typescript
// Additional REST endpoints for dashboard
GET /api/mcp/prompts            // List all prompts with filtering
GET /api/mcp/prompts/:id        // Get specific prompt details
GET /api/mcp/prompts/:id/usage  // Get prompt usage statistics
POST /api/mcp/sync              // Trigger manual sync
GET /api/mcp/sync/status        // Get sync status
```

#### 5. Caching Strategy

**Multi-Level Caching:**

1. **Database Cache** - Primary storage, persistent
2. **In-Memory Cache** - LRU cache for frequently used prompts
3. **TTL Strategy** - 5-minute cache for prompt listings

**Cache Invalidation:**

- GitHub webhook triggers immediate invalidation
- Manual sync endpoint clears cache
- Stale-while-revalidate for better performance

### Security Considerations

1. **Authentication:**
   - MCP endpoint uses existing proxy authentication
   - Dashboard API uses `X-Dashboard-Key` header
   - GitHub API uses personal access token (stored in env)

2. **Authorization:**
   - Domain-based access control for prompts
   - Audit trail for prompt usage
   - Rate limiting on MCP endpoints

3. **Data Validation:**
   - Validate prompt content for injection attacks
   - Sanitize GitHub file paths
   - Validate JSON-RPC requests

### Implementation Plan

1. **Phase 1: Core MCP Server**
   - Implement JSON-RPC handler
   - Create database schema
   - Basic prompt listing/retrieval

2. **Phase 2: GitHub Integration**
   - GitHub API client
   - File parsing (YAML/JSON/Markdown)
   - Sync service with polling

3. **Phase 3: Dashboard UI**
   - Prompt listing page
   - Prompt detail view
   - Usage analytics
   - Sync status indicator

4. **Phase 4: Advanced Features**
   - GitHub webhooks
   - Prompt versioning
   - Usage tracking
   - Performance optimization

### Configuration

```typescript
// Environment variables
MCP_ENABLED=true
MCP_GITHUB_OWNER=organization
MCP_GITHUB_REPO=prompt-library
MCP_GITHUB_BRANCH=main
MCP_GITHUB_TOKEN=ghp_xxxx
MCP_GITHUB_PATH=prompts/  // Path within repo
MCP_SYNC_INTERVAL=300     // 5 minutes
MCP_CACHE_TTL=300         // 5 minutes
```

## Consequences

### Positive

- Seamless integration with existing proxy infrastructure
- Reuses authentication and database systems
- Provides standard MCP interface for AI tools
- Centralized prompt management with version control
- Real-time updates from GitHub

### Negative

- Adds complexity to proxy service
- Requires GitHub API rate limit management
- Additional database tables and queries
- Potential performance impact on proxy

### Neutral

- Follows MCP specification for future compatibility
- Can be extended to support tools/resources later
- Dashboard becomes more feature-rich

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
