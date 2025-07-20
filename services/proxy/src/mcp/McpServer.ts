/**
 * MCP (Model Context Protocol) Server implementation
 */

import { z } from 'zod'
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type InitializeResult,
  type ListPromptsResult,
  type GetPromptResult,
} from './types/protocol.js'
import type { PromptRegistryService } from './PromptRegistryService.js'
import { McpError } from './errors.js'
import { logger } from '../middleware/logger.js'

// Method name constants
const RPC_METHODS = {
  INITIALIZE: 'initialize',
  LIST_PROMPTS: 'prompts/list',
  GET_PROMPT: 'prompts/get',
} as const

// Validation schemas
const GetPromptParamsSchema = z
  .object({
    // Support multiple parameter names for backward compatibility
    // Claude Code sends different parameter names depending on context
    promptId: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    arguments: z.record(z.unknown()).optional(),
  })
  .transform(data => {
    // Normalize to use 'promptId' internally
    const promptId = data.promptId || data.id || data.name
    return {
      promptId,
      arguments: data.arguments || {},
    }
  })
  .pipe(
    z.object({
      promptId: z.string({
        required_error: "Missing required parameter: promptId (or 'id' or 'name')",
      }),
      arguments: z.record(z.unknown()),
    })
  )

export class McpServer {
  private readonly serverInfo = {
    name: 'claude-nexus-mcp-server',
    version: '1.0.0',
  }

  private readonly protocolVersion = '2024-11-05'

  constructor(private promptRegistry: PromptRegistryService) {}

  async handleRequest(
    request: JsonRpcRequest<unknown>
  ): Promise<JsonRpcResponse<unknown, unknown>> {
    switch (request.method) {
      case RPC_METHODS.INITIALIZE:
        return this.handleInitialize(request)

      case RPC_METHODS.LIST_PROMPTS:
        return this.handleListPrompts(request)

      case RPC_METHODS.GET_PROMPT:
        return this.handleGetPrompt(request)

      default:
        throw McpError.methodNotFound(request.method)
    }
  }

  private async handleInitialize(
    request: JsonRpcRequest<InitializeParams>
  ): Promise<JsonRpcResponse<InitializeResult, unknown>> {
    // InitializeParams are optional and currently not used
    // Future implementations may use client capabilities from params

    const result: InitializeResult = {
      protocolVersion: this.protocolVersion,
      capabilities: {
        prompts: {
          listPrompts: true,
          getPrompt: true,
        },
      },
      serverInfo: this.serverInfo,
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    }
  }

  private async handleListPrompts(
    request: JsonRpcRequest<ListPromptsParams>
  ): Promise<JsonRpcResponse<ListPromptsResult, unknown>> {
    // ListPromptsParams supports cursor for pagination, but not implemented yet
    // TODO: Implement pagination when prompt count grows

    try {
      const prompts = this.promptRegistry.listPrompts()

      const result: ListPromptsResult = {
        prompts: prompts.map(p => ({
          id: p.promptId,
          name: p.name,
          description: p.description,
          // No arguments in the new system
        })),
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      }
    } catch (error) {
      logger.error('Error listing prompts', {
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw McpError.internalError('Failed to list prompts')
    }
  }

  private async handleGetPrompt(
    request: JsonRpcRequest<GetPromptParams>
  ): Promise<JsonRpcResponse<GetPromptResult, unknown>> {
    // Validate and normalize parameters
    const parseResult = GetPromptParamsSchema.safeParse(request.params)

    if (!parseResult.success) {
      logger.warn('Invalid parameters for prompts/get', {
        metadata: {
          params: request.params,
          errors: parseResult.error.flatten(),
        },
      })
      throw McpError.invalidParams(
        'Invalid parameters for prompts/get',
        parseResult.error.flatten()
      )
    }

    const { promptId, arguments: promptArgs } = parseResult.data

    logger.debug('Handling get prompt request', {
      metadata: { promptId, hasArguments: Object.keys(promptArgs).length > 0 },
    })

    try {
      // Render the prompt with Handlebars
      const content = this.promptRegistry.renderPrompt(promptId, promptArgs)

      if (!content) {
        throw McpError.promptNotFound(promptId)
      }

      // Get the prompt info for description
      const promptInfo = this.promptRegistry.getPrompt(promptId)

      const result: GetPromptResult = {
        description: promptInfo?.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: content,
            },
          },
        ],
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      }
    } catch (error) {
      // Re-throw if it's already an McpError
      if (error instanceof McpError) {
        throw error
      }

      logger.error('Error getting prompt', {
        metadata: {
          promptId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw McpError.internalError('Failed to get prompt')
    }
  }
}
