/**
 * MCP (Model Context Protocol) types
 * Based on the MCP specification version 2024-11-05
 *
 * This file provides type definitions for the JSON-RPC 2.0 protocol
 * and MCP-specific request/response structures.
 */

/**
 * Represents a JSON-RPC 2.0 request.
 * @template T The type of the params object
 */
export interface JsonRpcRequest<T = unknown> {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: T
}

/**
 * Represents a JSON-RPC 2.0 response.
 * @template TResult The type of the result object
 * @template TError The type of the error data object
 */
export interface JsonRpcResponse<TResult = unknown, TError = unknown> {
  jsonrpc: '2.0'
  id: string | number
  result?: TResult
  error?: JsonRpcError<TError>
}

/**
 * Represents a JSON-RPC 2.0 error object.
 * @template T The type of the optional error data
 */
export interface JsonRpcError<T = unknown> {
  /** Numeric error code */
  code: number
  /** Human-readable error message */
  message: string
  /** Additional error data */
  data?: T
}

// MCP specific types

/**
 * Parameters for the 'initialize' MCP method.
 * Sent from the client to the server to negotiate capabilities.
 * @see https://modelcontextprotocol.io/specification
 */
export interface InitializeParams {
  /** The protocol version the client supports (e.g., '2024-11-05') */
  protocolVersion: string
  /** Capabilities the client supports */
  capabilities: {
    /** Prompt-related capabilities */
    prompts?: {
      /** Whether the client can list prompts */
      listPrompts?: boolean
      /** Whether the client can get individual prompts */
      getPrompt?: boolean
    }
  }
  /** Optional information about the client application */
  clientInfo?: {
    /** Name of the client application */
    name: string
    /** Version of the client application */
    version?: string
  }
}

/**
 * Result of the 'initialize' MCP method.
 * Sent from the server to the client with negotiated capabilities.
 */
export interface InitializeResult {
  /** The protocol version the server is using */
  protocolVersion: string
  /** Capabilities the server provides */
  capabilities: {
    /** Prompt-related capabilities */
    prompts?: {
      /** Whether the server can list prompts */
      listPrompts?: boolean
      /** Whether the server can get individual prompts */
      getPrompt?: boolean
    }
  }
  /** Information about the server */
  serverInfo: {
    /** Name of the server */
    name: string
    /** Version of the server */
    version: string
  }
}

/**
 * Parameters for the 'prompts/list' method.
 * Supports pagination through cursor-based navigation.
 */
export interface ListPromptsParams {
  /** Cursor for pagination (from previous response) */
  cursor?: string
}

/**
 * Represents a single prompt template.
 */
export interface Prompt {
  /** Unique identifier for the prompt */
  id: string
  /** Human-readable name of the prompt */
  name: string
  /** Optional description of what the prompt does */
  description?: string
  /** Arguments that can be passed to the prompt */
  arguments?: PromptArgument[]
}

/**
 * Represents an argument that can be passed to a prompt.
 */
export interface PromptArgument {
  /** Name of the argument */
  name: string
  /** Description of the argument's purpose */
  description?: string
  /** Whether this argument is required */
  required?: boolean
}

/**
 * Result of the 'prompts/list' method.
 */
export interface ListPromptsResult {
  /** Array of available prompts */
  prompts: Prompt[]
  /** Cursor for fetching the next page of results */
  nextCursor?: string
}

/**
 * Parameters for the 'prompts/get' method.
 */
export interface GetPromptParams {
  /** ID of the prompt to retrieve */
  promptId: string
  /** Arguments to pass to the prompt template */
  arguments?: Record<string, unknown>
}

/**
 * Content types for prompt messages.
 */
export type PromptContentType = 'text' | 'image' | 'tool_use' | 'tool_result'

/**
 * Message roles in prompt responses.
 */
export type PromptMessageRole = 'user' | 'assistant' | 'system'

/**
 * Result of the 'prompts/get' method.
 */
export interface GetPromptResult {
  /** Optional description of the prompt */
  description?: string
  /** Messages that make up the prompt */
  messages: Array<{
    /** Role of the message sender */
    role: PromptMessageRole
    /** Content of the message */
    content: {
      /** Type of content */
      type: PromptContentType
      /** Text content (when type is 'text') */
      text: string
    }
  }>
}

/**
 * Standard JSON-RPC 2.0 and MCP-specific error codes.
 */
export const MCP_ERRORS = {
  // Standard JSON-RPC 2.0 errors
  /** Parse error - Invalid JSON was received */
  PARSE_ERROR: -32700,
  /** Invalid Request - The JSON sent is not a valid Request object */
  INVALID_REQUEST: -32600,
  /** Method not found - The method does not exist / is not available */
  METHOD_NOT_FOUND: -32601,
  /** Invalid params - Invalid method parameter(s) */
  INVALID_PARAMS: -32602,
  /** Internal error - Internal JSON-RPC error */
  INTERNAL_ERROR: -32603,

  // MCP specific errors
  /** The requested prompt was not found */
  PROMPT_NOT_FOUND: -32001,
  /** The provided prompt ID is invalid */
  INVALID_PROMPT_ID: -32002,
  /** A required argument was not provided */
  MISSING_REQUIRED_ARGUMENT: -32003,
} as const

/**
 * Type representing all possible MCP error codes.
 */
export type McpErrorCode = (typeof MCP_ERRORS)[keyof typeof MCP_ERRORS]

// Type guards

/**
 * Type guard to check if a response is an error response.
 * @param response The JSON-RPC response to check
 * @returns True if the response contains an error
 */
export function isJsonRpcError<TResult, TError>(
  response: JsonRpcResponse<TResult, TError>
): response is JsonRpcResponse<never, TError> & { error: JsonRpcError<TError> } {
  return response.error !== undefined && response.result === undefined
}

/**
 * Type guard to check if a response is a success response.
 * @param response The JSON-RPC response to check
 * @returns True if the response contains a result
 */
export function isJsonRpcSuccess<TResult, TError>(
  response: JsonRpcResponse<TResult, TError>
): response is JsonRpcResponse<TResult, never> & { result: TResult } {
  return response.result !== undefined && response.error === undefined
}

// Utility types for MCP methods

/**
 * Map of MCP method names to their parameter and result types.
 */
export interface McpMethodMap {
  initialize: {
    params: InitializeParams
    result: InitializeResult
  }
  'prompts/list': {
    params: ListPromptsParams
    result: ListPromptsResult
  }
  'prompts/get': {
    params: GetPromptParams
    result: GetPromptResult
  }
}

/**
 * Utility type for a fully-typed MCP request.
 * @template M The MCP method name
 */
export type McpRequest<M extends keyof McpMethodMap> = JsonRpcRequest<McpMethodMap[M]['params']> & {
  method: M
}

/**
 * Utility type for a fully-typed MCP response.
 * @template M The MCP method name
 */
export type McpResponse<M extends keyof McpMethodMap> = JsonRpcResponse<
  McpMethodMap[M]['result'],
  unknown
>
