# MCP Prompts Library

This directory contains YAML prompt templates for the Model Context Protocol (MCP) server integrated into Claude Nexus Proxy. These templates enable structured interactions with Claude through standardized, reusable prompts that can be accessed via Claude Desktop and other MCP-compatible clients.

## Overview

The MCP server provides a JSON-RPC 2.0 protocol for serving prompts to Claude instances. Prompts are stored as YAML files with Handlebars templating support, allowing for dynamic variable substitution and conditional logic.

For architectural details, see [ADR-017: MCP Prompt Sharing Implementation](../docs/04-Architecture/ADRs/adr-017-mcp-prompt-sharing.md).

## Quick Start

### 1. Enable MCP Server

```bash
# Basic setup (local files only)
MCP_ENABLED=true
MCP_PROMPTS_DIR=./prompts
MCP_WATCH_FILES=true  # Enable hot-reloading during development
```

### 2. Create a Prompt

Create a YAML file in this directory:

```yaml
# my-prompt.yaml
description: Brief description of what the prompt does
template: |
  You are {{role}}.

  {{#if context}}
  Context: {{context}}
  {{/if}}

  Please help with: {{task}}
```

### 3. Use with Claude Desktop

```bash
claude mcp add nexus-prompts --scope user -- bunx -y mcp-remote@latest \
  http://localhost:3000/mcp --header "Authorization: Bearer YOUR_CLIENT_API_KEY"
```

Replace `YOUR_CLIENT_API_KEY` with your domain's client API key from the credential file.

## Prompt Format

### File Structure

- **Filename**: Becomes the prompt name (e.g., `code-review.yaml` → `/code-review`)
- **Required Fields**:
  - `description`: Brief description of the prompt's purpose
  - `template`: The prompt content with Handlebars placeholders
- **Optional Fields**:
  - `name`: Ignored by the system; filename is used instead

### Template Syntax

Templates use [Handlebars](https://handlebarsjs.com/) syntax:

```yaml
template: |
  # Basic variable substitution
  Hello {{username}}!

  # Conditional blocks
  {{#if showDetails}}
  Here are the details: {{details}}
  {{else}}
  No details available.
  {{/if}}

  # Loops (for arrays)
  {{#each items}}
  - {{this}}
  {{/each}}
```

## Available Prompts

| Filename              | Description                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `code-review.yaml`    | Provides structured, actionable code reviews with severity levels and concrete suggestions |
| `test-generator.yaml` | Generates comprehensive test cases for your code                                           |

## Configuration

### Authentication

The MCP server requires authentication via Bearer token:

- Use the same `client_api_key` from your domain's credential file
- Configured in Claude Desktop during setup (see Quick Start)

### GitHub Synchronization (Optional)

Sync prompts from a GitHub repository:

```bash
# GitHub sync configuration
MCP_GITHUB_OWNER=your-org
MCP_GITHUB_REPO=prompt-library
MCP_GITHUB_BRANCH=main
MCP_GITHUB_TOKEN=ghp_xxxx         # GitHub personal access token
MCP_GITHUB_PATH=prompts/          # Path within the repository
MCP_SYNC_INTERVAL=300             # Sync interval in seconds
```

**Important Notes**:

- GitHub sync only updates files that exist in the repository
- Local-only prompts are preserved during sync
- Path traversal protection prevents security vulnerabilities

### Hot-Reloading

When `MCP_WATCH_FILES=true`, the server automatically reloads prompts when files change. This is useful during development but should be disabled in production for performance.

## API Endpoints

The MCP server exposes these endpoints:

- `POST /mcp` - Main JSON-RPC endpoint
- `GET /mcp` - Discovery endpoint

Supported JSON-RPC methods:

- `initialize` - Protocol handshake
- `prompts/list` - List available prompts
- `prompts/get` - Get and render a specific prompt with variables

## Contributing

When adding new prompts:

1. **Create a descriptive YAML file** in this directory
2. **Follow the naming convention**: Use kebab-case (e.g., `my-new-prompt.yaml`)
3. **Write clear descriptions**: Help users understand when to use the prompt
4. **Use meaningful variable names**: Make templates self-documenting
5. **Test thoroughly**:
   - Verify the prompt loads correctly
   - Test with various variable combinations
   - Check edge cases (missing variables, empty arrays)
6. **Document complex logic**: Add comments in the template if needed

### Validation Checklist

Before committing:

- [ ] YAML syntax is valid
- [ ] Description clearly explains the prompt's purpose
- [ ] Variable names are descriptive and consistent
- [ ] Template handles missing variables gracefully
- [ ] Prompt appears correctly in Claude Desktop

## Troubleshooting

### Prompt Not Appearing in Claude Desktop

1. Verify MCP is enabled: `MCP_ENABLED=true`
2. Check file location: Must be in the configured `MCP_PROMPTS_DIR`
3. Validate YAML syntax: Use a YAML linter
4. Restart Claude Desktop after adding the MCP server
5. Check proxy logs for MCP-related errors

### Authentication Errors

1. Ensure you're using the correct `client_api_key` from your credential file
2. Include the `Bearer` prefix in the Authorization header
3. Check that `ENABLE_CLIENT_AUTH` is not set to `false`

### Template Rendering Issues

1. Missing variables render as empty strings (not errors)
2. Use `{{#if variable}}` to handle optional variables
3. Check Handlebars syntax for complex conditionals

## Security Considerations

- **Path Traversal Protection**: File paths are validated to prevent directory escaping
- **Authentication Required**: All MCP endpoints require valid Bearer token
- **Read-Only Access**: The MCP server only reads prompt files, never writes

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [ADR-017: MCP Prompt Sharing Implementation](../docs/04-Architecture/ADRs/adr-017-mcp-prompt-sharing.md)
- [Handlebars Documentation](https://handlebarsjs.com/)
