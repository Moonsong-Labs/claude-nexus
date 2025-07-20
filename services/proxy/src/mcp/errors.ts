/**
 * MCP-specific error handling
 */

import { MCP_ERRORS } from './types/protocol.js'

export class McpError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'McpError'
  }

  /**
   * Convert to JSON-RPC error format
   */
  toJsonRpcError() {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    }
  }

  static invalidParams(message: string, data?: unknown): McpError {
    return new McpError(MCP_ERRORS.INVALID_PARAMS, message, data)
  }

  static methodNotFound(method: string): McpError {
    return new McpError(MCP_ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`)
  }

  static promptNotFound(promptId: string): McpError {
    return new McpError(MCP_ERRORS.PROMPT_NOT_FOUND, `Prompt not found: ${promptId}`)
  }

  static internalError(message = 'Internal error', data?: unknown): McpError {
    return new McpError(MCP_ERRORS.INTERNAL_ERROR, message, data)
  }
}
