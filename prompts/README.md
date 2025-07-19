# MCP Prompts Library

This directory contains prompt templates for the Model Context Protocol (MCP) server.

## Prompt Format

Prompts are defined in YAML files using Handlebars templating syntax.

### YAML Format

```yaml
name: Human Readable Name # Optional - ignored, filename is used as prompt name
description: Brief description of what the prompt does
template: |
  The prompt template with {{arg1}} placeholders.

  {{#if conditionalArg}}
  Conditional content here
  {{else}}
  Default content
  {{/if}}
```

### Example

```yaml
description: Generates comprehensive test cases for your code
template: |
  You are an expert test engineer. Generate comprehensive test cases using {{framework}} for the provided code.

  Focus on {{#if coverage_type}}{{coverage_type}}{{else}}unit{{/if}} testing.
```

### Notes

- The prompt name is derived from the filename (e.g., `test-generator.yaml` becomes `/test-generator`)
- Templates use Handlebars syntax with `{{variable}}` placeholders
- Conditional logic is supported using Handlebars helpers like `{{#if}}`
- Missing variables are allowed and will be rendered as empty strings
- The `name` field is optional and ignored by the implementation

## Available Prompts

- `code-review.yaml` - Provides structured, actionable code reviews with severity levels and concrete suggestions
- `test-generator.yaml` - Generates comprehensive test cases for your code

## Contributing

When adding new prompts:

1. Use a unique, descriptive ID
2. Provide clear descriptions for the prompt and all arguments
3. Use meaningful placeholder names in the content
4. Test the prompt before committing
