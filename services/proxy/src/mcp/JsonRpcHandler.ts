/**
 * JSON-RPC 2.0 handler for MCP server
 */

import type { Context } from 'hono'
import type { McpServer } from './McpServer.js'
import {
  MCP_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
} from './types/protocol.js'

export class JsonRpcHandler {
  constructor(private mcpServer: McpServer) {}

  async handle(c: Context): Promise<Response> {
    try {
      let request: JsonRpcRequest

      try {
        request = await c.req.json()
      } catch (_error) {
        return c.json(this.createErrorResponse(null, MCP_ERRORS.PARSE_ERROR, 'Parse error'))
      }

      // Validate JSON-RPC request
      if (!this.isValidJsonRpcRequest(request)) {
        return c.json(
          this.createErrorResponse(
            (request as any)?.id || null,
            MCP_ERRORS.INVALID_REQUEST,
            'Invalid Request'
          )
        )
      }

      try {
        const result = await this.mcpServer.handleRequest(request)
        return c.json(result)
      } catch (error) {
        console.error('MCP request handling error:', error)

        // If error is already a JsonRpcError, use it
        if (this.isJsonRpcError(error)) {
          return c.json({
            jsonrpc: '2.0',
            id: request.id,
            error: error as JsonRpcError,
          })
        }

        // Otherwise, return internal error
        return c.json(
          this.createErrorResponse(
            request.id,
            MCP_ERRORS.INTERNAL_ERROR,
            error instanceof Error ? error.message : 'Internal error'
          )
        )
      }
    } catch (error) {
      console.error('JSON-RPC handler error:', error)
      return c.json(this.createErrorResponse(null, MCP_ERRORS.INTERNAL_ERROR, 'Internal error'))
    }
  }

  private isValidJsonRpcRequest(request: any): request is JsonRpcRequest {
    return (
      request &&
      typeof request === 'object' &&
      request.jsonrpc === '2.0' &&
      (typeof request.id === 'string' || typeof request.id === 'number') &&
      typeof request.method === 'string'
    )
  }

  private isJsonRpcError(error: any): error is JsonRpcError {
    return (
      error &&
      typeof error === 'object' &&
      typeof error.code === 'number' &&
      typeof error.message === 'string'
    )
  }

  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: any
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: id || 0,
      error: {
        code,
        message,
        ...(data && { data }),
      },
    }
  }
}
