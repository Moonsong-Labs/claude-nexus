# MCP Prompts Library

This directory contains prompt templates for the Model Context Protocol (MCP) server.

## Prompt Format

Prompts can be defined in YAML, JSON, or Markdown (with frontmatter) format.

### YAML Format

```yaml
id: unique-prompt-id
name: Human Readable Name
description: Brief description of what the prompt does
arguments:
  - name: arg1
    type: string
    required: true
    description: Description of the argument
content: |
  The prompt template with {arg1} placeholders
```

### JSON Format

```json
{
  "id": "unique-prompt-id",
  "name": "Human Readable Name",
  "description": "Brief description",
  "arguments": [
    {
      "name": "arg1",
      "type": "string",
      "required": true,
      "description": "Description of the argument"
    }
  ],
  "content": "The prompt template with {arg1} placeholders"
}
```

### Markdown Format

```markdown
---
id: unique-prompt-id
name: Human Readable Name
description: Brief description
arguments:
  - name: arg1
    type: string
    required: true
    description: Description of the argument
---

The prompt template with {arg1} placeholders
```

## Available Prompts

- `code-review.yaml` - Code review assistant for various programming languages
- `test-generator.yaml` - Generates test cases for your code

## Contributing

When adding new prompts:

1. Use a unique, descriptive ID
2. Provide clear descriptions for the prompt and all arguments
3. Use meaningful placeholder names in the content
4. Test the prompt before committing
