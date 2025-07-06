/**
 * MCP (Model Context Protocol) Server implementation
 */

import {
  MCP_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type InitializeParams,
  type InitializeResult,
  type ListPromptsParams,
  type ListPromptsResult,
  type GetPromptParams,
  type GetPromptResult,
} from './types/protocol.js'
import type { PromptService } from './PromptService.js'

export class McpServer {
  private readonly serverInfo = {
    name: 'claude-nexus-mcp-server',
    version: '1.0.0',
  }

  private readonly protocolVersion = '1.0.0'

  constructor(private promptService: PromptService) {}

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request)

      case 'prompts/list':
        return this.handleListPrompts(request)

      case 'prompts/get':
        return this.handleGetPrompt(request)

      default:
        throw {
          code: MCP_ERRORS.METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
        }
    }
  }

  private async handleInitialize(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const _params = request.params as InitializeParams | undefined

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

  private async handleListPrompts(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as ListPromptsParams | undefined

    try {
      const prompts = await this.promptService.listPrompts({
        limit: 100, // Default limit
        offset: params?.cursor ? parseInt(params.cursor) : 0,
      })

      const result: ListPromptsResult = {
        prompts: prompts.map(p => ({
          id: p.promptId,
          name: p.name,
          description: p.description,
          arguments: p.arguments,
        })),
        // If we have 100 prompts, there might be more
        nextCursor: prompts.length === 100 ? String(prompts.length) : undefined,
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      }
    } catch (error) {
      console.error('Error listing prompts:', error)
      throw {
        code: MCP_ERRORS.INTERNAL_ERROR,
        message: 'Failed to list prompts',
      }
    }
  }

  private async handleGetPrompt(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as GetPromptParams | undefined

    if (!params?.promptId) {
      throw {
        code: MCP_ERRORS.INVALID_PARAMS,
        message: 'Missing required parameter: promptId',
      }
    }

    try {
      const prompt = await this.promptService.getPrompt(params.promptId)

      if (!prompt) {
        throw {
          code: MCP_ERRORS.PROMPT_NOT_FOUND,
          message: `Prompt not found: ${params.promptId}`,
        }
      }

      // Process the prompt content with provided arguments
      let content = prompt.content
      if (params.arguments) {
        // Replace template variables in the content
        content = this.processTemplate(content, params.arguments, prompt.arguments)
      }

      // Track usage
      await this.promptService.recordUsage({
        promptId: params.promptId,
        arguments: params.arguments,
        usedAt: new Date(),
      })

      const result: GetPromptResult = {
        prompt: {
          id: prompt.promptId,
          content,
        },
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      }
    } catch (error) {
      // Re-throw if it's already a JSON-RPC error
      if (error && typeof error === 'object' && 'code' in error) {
        throw error
      }

      console.error('Error getting prompt:', error)
      throw {
        code: MCP_ERRORS.INTERNAL_ERROR,
        message: 'Failed to get prompt',
      }
    }
  }

  private processTemplate(
    template: string,
    args: Record<string, any>,
    promptArgs?: Array<{ name: string; required?: boolean }>
  ): string {
    // Check for required arguments
    if (promptArgs) {
      for (const arg of promptArgs) {
        if (arg.required && !(arg.name in args)) {
          throw {
            code: MCP_ERRORS.MISSING_REQUIRED_ARGUMENT,
            message: `Missing required argument: ${arg.name}`,
          }
        }
      }
    }

    // Replace template variables safely
    let processed = template
    for (const [key, value] of Object.entries(args)) {
      // Validate key to prevent injection
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw {
          code: MCP_ERRORS.INVALID_PARAMS,
          message: `Invalid argument name: ${key}. Argument names must be valid identifiers.`,
        }
      }

      // Convert value to string and escape any special characters
      const safeValue = String(value)
        .replace(/\$/g, '$$$$') // Escape $ which has special meaning in replace()
        .replace(/\\/g, '\\\\') // Escape backslashes

      // Use split/join for safe replacement without regex
      const placeholder = `{${key}}`
      processed = processed.split(placeholder).join(safeValue)
    }

    return processed
  }
}
