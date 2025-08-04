# MCP Agent Tools

This directory contains agent definitions that are exposed as MCP (Model Context Protocol) tools, allowing Claude Code agents to be accessible through the MCP protocol.

## Overview

The Claude Nexus Proxy now supports exposing Claude Code agents as MCP tools. This enables:

- Claude Desktop to discover and use agents via MCP
- Standardized agent invocation through the MCP protocol
- Dynamic loading of agent definitions from YAML files

## Configuration

Enable MCP tools support by setting these environment variables:

```bash
# Enable MCP server
MCP_ENABLED=true

# Enable tools/agents support
MCP_ENABLE_TOOLS=true

# Optional: Set custom agents directory (default: ./agents)
MCP_AGENTS_DIR=./agents
```

## Creating Agent Definitions

Agents are defined in YAML files in this directory. Each file should contain:

```yaml
name: agent-name
description: |
  Detailed description of what the agent does.
  Can be multi-line.
parameters:
  type: object
  properties:
    param1:
      type: string
      description: Description of parameter 1
    param2:
      type: number
      description: Description of parameter 2
  required:
    - param1
```

### Example: solution-challenger.yaml

```yaml
name: solution-challenger
description: |
  Critically review and challenge proposed solutions, implementations, or architectural decisions. 
  Identifies potential issues, edge cases, performance concerns, and suggests improvements.
parameters:
  type: object
  properties:
    solution:
      type: string
      description: The solution or implementation to review
    context:
      type: string
      description: Additional context about the problem being solved
  required:
    - solution
```

## Using Agents via MCP

Once configured, agents are exposed through the MCP protocol and can be:

1. **Listed** via the `tools/list` method
2. **Called** via the `tools/call` method

### In Claude Desktop

After configuring MCP in Claude Desktop to connect to the proxy, agents will appear as available tools that can be invoked directly.

## Architecture

The implementation consists of:

1. **AgentRegistryService** - Manages agent definitions and executions
2. **Extended MCP Protocol Types** - Added tool-related types to the protocol
3. **Updated McpServer** - Handles `tools/list` and `tools/call` methods
4. **YAML-based Configuration** - Simple agent definition format

## Integration Notes

Currently, the agent handlers return placeholder responses. Full integration with the Claude Code agent system requires:

1. Access to the Claude Code agent runtime
2. Proper sandboxing and security measures
3. Agent state management
4. Error handling and timeout controls

The current implementation provides the foundation for this integration.

## Adding New Agents

To add a new agent:

1. Create a new YAML file in this directory
2. Define the agent's name, description, and parameters
3. The agent will be automatically loaded on proxy startup
4. No restart required if file watching is enabled

## Security Considerations

### Implemented Security Measures

1. **Path Sanitization**: All file paths are validated to prevent directory traversal attacks
2. **Safe YAML Parsing**: Using standard YAML parser without custom type support
3. **Schema Validation**: Agent definitions are validated against a strict schema
4. **Parameter Validation**: All input parameters are validated against the agent's schema
5. **Name Validation**: Agent names must match pattern `[a-zA-Z0-9-_]+`
6. **Authentication**: MCP endpoints require client API key authentication
7. **Audit Logging**: All agent executions are logged with parameters

### Additional Recommendations

- Review all agent definitions before deployment
- Implement rate limiting per authenticated client
- Consider adding per-agent authorization rules
- Monitor agent execution metrics and anomalies
- Regularly audit agent access logs

### Agent Definition Requirements

- `name`: Required, must contain only alphanumeric characters, hyphens, and underscores
- `description`: Required, non-empty string
- `parameters`: Optional, must follow JSON Schema format
  - `type`: Must be 'object'
  - `properties`: Object defining parameter schemas
  - `required`: Array of required parameter names
