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
import { McpError } from './errors.js'
import { logger } from '../middleware/logger.js'

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
            ((request as Record<string, unknown>)?.id as string | number | null) || null,
            MCP_ERRORS.INVALID_REQUEST,
            'Invalid Request'
          )
        )
      }

      try {
        const result = await this.mcpServer.handleRequest(request)
        return c.json(result)
      } catch (error) {
        logger.error('MCP request handling error', {
          metadata: {
            method: request.method,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        })

        // If error is an McpError, convert to JSON-RPC format
        if (error instanceof McpError) {
          return c.json({
            jsonrpc: '2.0',
            id: request.id,
            error: error.toJsonRpcError(),
          })
        }

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
      logger.error('JSON-RPC handler error', {
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      return c.json(this.createErrorResponse(null, MCP_ERRORS.INTERNAL_ERROR, 'Internal error'))
    }
  }

  private isValidJsonRpcRequest(request: unknown): request is JsonRpcRequest {
    return (
      request !== null &&
      typeof request === 'object' &&
      'jsonrpc' in request &&
      request.jsonrpc === '2.0' &&
      'id' in request &&
      (typeof request.id === 'string' || typeof request.id === 'number') &&
      'method' in request &&
      typeof request.method === 'string'
    )
  }

  private isJsonRpcError(error: unknown): error is JsonRpcError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'number' &&
      'message' in error &&
      typeof error.message === 'string'
    )
  }

  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse<never, unknown> {
    return {
      jsonrpc: '2.0',
      id: id || 0,
      error: {
        code,
        message,
        ...(data !== undefined && { data }),
      },
    }
  }
}
