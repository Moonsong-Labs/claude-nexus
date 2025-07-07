# MCP Server Actual Implementation

## Overview

This document describes the actual implementation of the Model Context Protocol (MCP) server in Claude Nexus Proxy, which differs significantly from the [original plan](./mcp-server-original-plan.md).

## Key Design Decisions

### File-Based Instead of Database-Based

The implementation uses a simple file-based approach:

- Prompts are stored as YAML files in the `prompts/` directory
- No database tables or migrations required
- Hot-reloading supported via file system watcher

### Handlebars Templating

Instead of custom templating:

- Uses industry-standard Handlebars templating engine
- Supports full Handlebars features (conditionals, loops, helpers)
- Variables use `{{variable}}` syntax instead of `{variable}`

### No GitHub Synchronization

Simplified deployment model:

- Prompts are managed directly in the file system
- No GitHub API integration or rate limits
- Prompts can be version controlled with the main repository

## Implementation Components

### 1. PromptRegistryService

Located at `services/proxy/src/mcp/PromptRegistryService.ts`

Key features:

- Loads YAML files from configurable directory
- Compiles templates with Handlebars
- Maintains in-memory cache
- Watches for file changes and reloads automatically

### 2. File Format

Prompts use a simple YAML format:

```yaml
# prompts/example.yaml
name: Example Prompt
description: Description of what this prompt does
template: |
  You are an AI assistant helping with {{task}}.
  {{#if context}}
  Additional context: {{context}}
  {{/if}}
```

### 3. MCP Protocol Handler

The `McpServer` class implements the MCP protocol:

- `initialize` - Returns server capabilities
- `prompts/list` - Lists all available prompts
- `prompts/get` - Returns a specific prompt with rendered template

### 4. Dashboard Integration

The dashboard provides:

- List of all prompts at `/dashboard/prompts`
- Individual prompt details at `/dashboard/prompts/:id`
- Display of Handlebars template syntax

## Configuration

Simple environment variables:

```bash
MCP_ENABLED=true              # Enable MCP server
MCP_PROMPTS_DIR=./prompts     # Directory containing YAML files
MCP_WATCH_FILES=true          # Enable hot-reloading
```

## Benefits of This Approach

1. **Simplicity**: No database complexity or migrations
2. **Developer Experience**: Direct file editing with hot-reload
3. **Standard Tooling**: Handlebars is well-known and documented
4. **Deployment**: Prompts deploy with the application
5. **Performance**: In-memory caching with minimal overhead

## Trade-offs

- No centralized prompt repository across deployments
- No built-in usage analytics
- Manual prompt synchronization between environments
- No UI for editing prompts (must edit files directly)

## Future Enhancements

If needed, the system could be extended to support:

- Git-based synchronization (simpler than GitHub API)
- Optional database storage for analytics
- Web-based prompt editor
- Prompt versioning and rollback
