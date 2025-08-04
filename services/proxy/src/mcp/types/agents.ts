/**
 * Agent types for MCP integration
 */

export interface AgentDefinition {
  name: string
  description: string
  parameters?: {
    type: 'object'
    properties: Record<
      string,
      {
        type: string
        description?: string
        default?: any
        enum?: any[]
      }
    >
    required?: string[]
  }
  handler: (params: Record<string, any>) => Promise<string>
}

export interface AgentInfo {
  name: string
  description: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, any>
    required?: string[]
  }
}
