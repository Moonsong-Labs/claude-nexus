# MCP Prompts Directory

This directory contains YAML files that define prompts for the MCP (Model Context Protocol) server.

## Naming Convention

**Important**: The prompt name in Claude will be derived from the file name, not from the `name` field in the YAML file.

- File: `my-feature.yaml` → Prompt: `/my-feature`
- File: `code-review.yaml` → Prompt: `/code-review`
- File: `debug-helper.yaml` → Prompt: `/debug-helper`

## Prompt Format

Each YAML file should have the following structure:

```yaml
name: Display Name # This field is currently ignored - file name is used instead
description: A brief description of what this prompt does
template: |
  Your prompt template here.
  Supports Handlebars variables like {{variable}}.
  {{#if condition}}
  Conditional content
  {{/if}}
```

## Example

File: `feature-development.yaml`

```yaml
name: Feature Development # Ignored - prompt will be named 'feature-development'
description: Helps with developing new features using best practices
template: |
  You are tasked with developing a new feature: {{feature_name}}.

  {{#if requirements}}
  Requirements: {{requirements}}
  {{/if}}

  Please follow these best practices:
  1. Write clean, maintainable code
  2. Include appropriate tests
  3. Update documentation
```

This will be available in Claude as `/feature-development`.

## GitHub Sync

When GitHub sync is enabled, prompts from the configured repository will be synchronized to this directory. The sync process:

1. Fetches YAML files from the GitHub repository
2. Validates file names for security (no path traversal)
3. Writes files to this directory
4. Preserves local-only prompts (files not in the repository)

## Hot Reloading

The MCP server watches this directory for changes. When you add, modify, or delete a YAML file, the changes are automatically loaded without restarting the server.
