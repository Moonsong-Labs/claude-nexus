# ADR-018: MCP Prompt Sharing Implementation

## Status

Accepted

## Context

As the Claude Nexus Proxy project grew, there was a need to share and manage prompts effectively across different Claude instances, developers, and teams. Without a standardized system, prompts were scattered, hard to discover, and difficult to keep updated. The Model Context Protocol (MCP) provides a standard for serving prompts that can be consumed by clients like Claude Desktop, addressing this need for a centralized and manageable prompt library.

## Decision Drivers

- **Simplicity**: The solution should be easy to implement, maintain, and use, without adding significant complexity (like database migrations) to the core proxy service.
- **Flexibility**: Support both simple, local-only deployments and more complex, centralized deployments using a Git-based workflow.
- **Developer Experience**: Enable rapid prompt development with features like hot-reloading and the ability to edit prompts in a standard, human-readable format.
- **Security**: Ensure that the prompt-sharing mechanism integrates with existing authentication and is secure by default.
- **Compatibility**: Adhere to the MCP specification to ensure compatibility with clients like Claude Desktop.

## Considered Options

### 1. Database-Backed Sync (Rejected)

- **Description**: This approach involved creating several new PostgreSQL tables to store prompts, sync status, and usage metrics. A background service would poll a GitHub repository, parse prompt files, and write them to the database.
- **Pros**:
  - Persistent, queryable storage for prompts.
  - Enables rich usage analytics and version tracking.
- **Cons**:
  - Significantly increases the complexity of the proxy service.
  - Requires database migrations, adding friction to deployment.
  - Slower development cycle compared to direct file editing.

### 2. File-Based with Optional Sync (Accepted)

- **Description**: This approach uses a local directory of YAML files as the primary source of truth for prompts. An optional background service can be enabled to synchronize this directory with a GitHub repository. The server serves prompts directly from the in-memory representation of these files.
- **Pros**:
  - Extremely simple for local or single-instance deployments.
  - No database dependency or migrations needed.
  - Fast development with hot-reloading of prompt files.
  - Git provides a natural mechanism for versioning and collaboration.
- **Cons**:
  - No built-in usage analytics.
  - Prompt distribution across multiple instances relies on an external mechanism (Git sync).

## Decision

We will implement **Option 2: A file-based MCP server with optional GitHub synchronization**. This approach provides the most flexibility and the best developer experience while meeting the core requirement of sharing prompts via the MCP standard. It avoids adding unnecessary complexity to the database and leverages Git for version control, which is a natural fit for managing text-based prompts.

### Implementation Details

The implementation consists of three main components:

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude Desktop    │────▶│   Proxy Service  │◀────│     GitHub      │
│  (MCP Client)       │     │   (MCP Server)   │     │  (Optional)     │
└─────────────────────┘     └──────────────────┘     └─────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  Local YAML      │
                            │  Files           │
                            └──────────────────┘
```

#### 1. File-Based Storage (`PromptRegistryService`)

- Prompts are stored as simple YAML files in the `prompts/` directory.
- Each file defines a `name`, `description`, and a `template`.
- The service uses the **Handlebars** engine for templating (e.g., `{{variable}}`), supporting conditionals and other logic.
- A file system watcher enables hot-reloading for rapid development.

#### 2. Optional GitHub Synchronization (`GitHubSyncService`)

- When configured with a GitHub token and repository, this service periodically fetches prompts from the specified path.
- The sync is non-destructive: it only updates local files that have a corresponding file in the GitHub repo, preserving any local-only prompts.
- Security is handled by validating filenames to prevent path traversal attacks.

#### 3. MCP Protocol Handler (`McpServer`)

- Implements the JSON-RPC 2.0 protocol at the `/mcp/rpc` endpoint.
- Supports MCP protocol version `2024-11-05` for compatibility with Claude Desktop.
- Handles `initialize`, `prompts/list`, and `prompts/get` methods.
- Integrates with the proxy's existing Bearer token authentication.

### Configuration

```bash
# Basic setup (local files only)
MCP_ENABLED=true
MCP_PROMPTS_DIR=./prompts
MCP_WATCH_FILES=true

# With optional GitHub sync
MCP_GITHUB_OWNER=your-org
MCP_GITHUB_REPO=prompt-library
MCP_GITHUB_TOKEN=ghp_xxxx
MCP_GITHUB_PATH=prompts/
MCP_SYNC_INTERVAL=300 # Sync every 5 minutes
```

### Claude Desktop Integration

Users can add the MCP server to Claude Desktop with a single command, using `mcp-remote` to handle the HTTP transport and authentication header.

```bash
claude mcp add nexus-prompts --scope user -- bunx -y mcp-remote@latest \
  http://localhost:3000/mcp --header "Authorization: Bearer YOUR_CLIENT_API_KEY"
```

## Consequences

### Positive

- **Standardized Prompt Sharing**: Provides a consistent way to manage and distribute prompts across teams.
- **Simple Deployment**: The feature can be enabled without any database changes or complex setup.
- **Excellent Developer Experience**: Hot-reloading and a simple, powerful templating engine make creating and testing prompts easy.
- **Secure by Default**: Leverages existing authentication and includes protections against path traversal.
- **Flexible Storage Model**: Works well for single developers (local files) and large teams (GitHub).

### Negative

- **No Usage Analytics**: The simplified design does not include tracking of which prompts are used and how often.
- **Manual Distribution**: In a multi-instance setup without GitHub, prompts must be distributed manually.
- **Limited Advanced Features**: The file-based approach makes features like argument validation or system-level versioning more difficult to implement.

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [PR #83: Initial MCP Implementation](https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/83)
- [PR #87: MCP Server Fixes](https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/87)
