/**
 * MCP (Model Context Protocol) types
 * Based on the MCP specification
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: any
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: any
  error?: JsonRpcError
}

export interface JsonRpcError {
  code: number
  message: string
  data?: any
}

// MCP specific types
export interface InitializeParams {
  protocolVersion: string
  capabilities: {
    prompts?: {
      listPrompts?: boolean
      getPrompt?: boolean
    }
  }
  clientInfo?: {
    name: string
    version?: string
  }
}

export interface InitializeResult {
  protocolVersion: string
  capabilities: {
    prompts?: {
      listPrompts?: boolean
      getPrompt?: boolean
    }
  }
  serverInfo: {
    name: string
    version: string
  }
}

export interface ListPromptsParams {
  cursor?: string
}

export interface Prompt {
  id: string
  name: string
  description?: string
  arguments?: PromptArgument[]
}

export interface PromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface ListPromptsResult {
  prompts: Prompt[]
  nextCursor?: string
}

export interface GetPromptParams {
  promptId: string
  arguments?: Record<string, any>
}

export interface GetPromptResult {
  description?: string
  messages: Array<{
    role: string
    content: {
      type: string
      text: string
    }
  }>
}

// Error codes
export const MCP_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP specific errors
  PROMPT_NOT_FOUND: -32001,
  INVALID_PROMPT_ID: -32002,
  MISSING_REQUIRED_ARGUMENT: -32003,
} as const
