# MCP Prompts Directory

This directory contains YAML files that define prompts for the MCP (Model Context Protocol) server.

## Table of Contents

- [Quick Start](#quick-start)
- [Prompt Format](#prompt-format)
- [Naming Conventions](#naming-conventions)
- [Handlebars Template Examples](#handlebars-template-examples)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)
- [GitHub Sync](#github-sync)
- [References](#references)

## Quick Start

1. Create a new YAML file in this directory (e.g., `my-prompt.yaml`):

```yaml
name: My Prompt Display Name
description: What this prompt does
template: |
  You are a helpful assistant.
  The user wants help with: {{task}}
```

2. The prompt is immediately available in Claude as `/my-prompt`
3. Test it by typing `/my-prompt` in Claude Desktop and providing the required variables

## Prompt Format

Each YAML file must contain three fields:

```yaml
name: Display Name # Used for documentation/UI display
description: Brief description of the prompt's purpose
template: |
  The actual prompt template using Handlebars syntax
```

**Important**: The command name (e.g., `/my-prompt`) comes from the filename, not the `name` field.

## Naming Conventions

- **File names**: Use `kebab-case.yaml` (e.g., `code-review.yaml`, `bug-fix-helper.yaml`)
- **Command names**: Automatically derived from filename (e.g., `code-review.yaml` → `/code-review`)
- **Descriptive names**: Choose names that clearly indicate the prompt's purpose
- **Avoid**: Special characters, spaces, or starting with numbers

## Handlebars Template Examples

### Basic Variable Interpolation

```yaml
template: |
  Analyze this {{language}} code for {{issue_type}} issues.
```

### Conditional Logic

```yaml
template: |
  Review this pull request.

  {{#if guidelines}}
  Follow these specific guidelines:
  {{guidelines}}
  {{else}}
  Use general best practices for code review.
  {{/if}}
```

### Iteration Over Lists

```yaml
template: |
  Generate unit tests for the following functions:
  {{#each functions}}
  - {{this}}
  {{/each}}
```

### Nested Conditionals and Complex Logic

```yaml
template: |
  You are a {{role}} assistant.

  {{#if context}}
  Context: {{context}}
  {{/if}}

  {{#if examples}}
  Here are some examples:
  {{#each examples}}
  Example {{@index}}: {{this}}
  {{/each}}
  {{/if}}

  Task: {{task}}
```

## Security Best Practices

### Input Sanitization

- Never include sensitive data (API keys, passwords) in templates
- Be cautious with user-provided variables that might contain malicious content
- Use clear delimiters between instructions and user content

### Prompt Injection Prevention

```yaml
# Good: Clear separation between instructions and user input
template: |
  You are a code reviewer. Analyze the following code:

  === BEGIN USER CODE ===
  {{user_code}}
  === END USER CODE ===

  Provide constructive feedback only on the code above.
```

### Data Minimization

- Only request necessary information in variables
- Avoid storing personal or confidential data in templates
- Keep templates focused on their specific purpose

## Troubleshooting

### Common Issues

1. **Prompt not appearing in Claude**
   - Check file has `.yaml` extension
   - Verify YAML syntax is valid
   - Ensure MCP server is running (`MCP_ENABLED=true`)
   - Restart Claude Desktop after adding the MCP server

2. **Template variables not working**
   - Variable names are case-sensitive
   - Check for typos in variable names
   - Ensure variables are provided when invoking the prompt

3. **YAML parsing errors**
   - Use proper indentation (2 spaces recommended)
   - Quote strings containing special characters
   - Use `|` for multi-line templates

### Debugging Tips

- Check proxy logs for MCP-related errors
- Validate YAML syntax using online tools or `yamllint`
- Test Handlebars templates locally before deployment

## GitHub Sync

When configured, the MCP server can sync prompts from a GitHub repository:

```bash
# Configure in .env
MCP_GITHUB_OWNER=your-org
MCP_GITHUB_REPO=prompt-library
MCP_GITHUB_TOKEN=ghp_xxxx
```

The sync process:

1. Fetches YAML files from the repository
2. Validates filenames for security
3. Updates local files (preserves local-only prompts)
4. Hot-reloads changes automatically

## References

- [ADR-017: MCP Prompt Sharing Implementation](../../../docs/04-Architecture/ADRs/adr-017-mcp-prompt-sharing.md) - Architectural decisions
- [CLAUDE.md MCP Section](../../../CLAUDE.md#mcp-model-context-protocol-server) - Configuration details
- [Model Context Protocol Specification](https://modelcontextprotocol.io) - Official MCP documentation
