import { describe, it, expect, beforeEach } from 'bun:test'
import { McpServer } from '../McpServer.js'
import { MCP_ERRORS } from '../types/protocol.js'
import type { PromptService } from '../PromptService.js'

// Mock PromptService
class MockPromptService implements Partial<PromptService> {
  async listPrompts() {
    return [
      {
        id: 'test-prompt-id',
        promptId: 'test-prompt',
        name: 'Test Prompt',
        description: 'A test prompt',
        content: 'Hello {name}, you are {age} years old',
        arguments: [
          { name: 'name', required: true },
          { name: 'age', required: true },
        ],
        metadata: {},
        githubPath: 'test.yaml',
        githubUrl: 'https://github.com/test',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncedAt: new Date(),
      },
    ]
  }

  async getPrompt(promptId: string) {
    if (promptId === 'test-prompt') {
      return {
        id: 'test-prompt-id',
        promptId: 'test-prompt',
        name: 'Test Prompt',
        description: 'A test prompt',
        content: 'Hello {name}, you are {age} years old',
        arguments: [
          { name: 'name', required: true },
          { name: 'age', required: true },
        ],
        metadata: {},
        githubPath: 'test.yaml',
        githubUrl: 'https://github.com/test',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncedAt: new Date(),
      }
    }
    return null
  }

  async recordUsage() {
    // Mock implementation
  }
}

describe('McpServer Security Tests', () => {
  let mcpServer: McpServer
  let mockPromptService: MockPromptService

  beforeEach(() => {
    mockPromptService = new MockPromptService()
    mcpServer = new McpServer(mockPromptService as any)
  })

  describe('Template Injection Prevention', () => {
    it('should safely handle template variables without regex injection', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: 'Alice',
            age: '25',
          },
        },
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      expect((response as any).result.prompt.content).toBe('Hello Alice, you are 25 years old')
    })

    it('should handle special regex characters in template values', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: '$pecial.*+?[]{()}\\^|',
            age: '$(25)',
          },
        },
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      // Dollar signs are escaped as $$ in the implementation
      expect((response as any).result.prompt.content).toBe(
        'Hello $$pecial.*+?[]{()}\\\\^|, you are $$(25) years old'
      )
    })

    it('should escape dollar signs properly', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: '$$$$',
            age: '$1$2$3',
          },
        },
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      // Each $ is escaped as $$
      expect((response as any).result.prompt.content).toBe(
        'Hello $$$$$$$$, you are $$1$$2$$3 years old'
      )
    })

    it('should escape backslashes properly', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: '\\\\test\\\\',
            age: '\\n\\r\\t',
          },
        },
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      // Each \ is escaped as \\
      expect((response as any).result.prompt.content).toBe(
        'Hello \\\\\\\\test\\\\\\\\, you are \\\\n\\\\r\\\\t years old'
      )
    })

    it('should reject invalid argument names', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: 'valid', // Provide required argument
            'invalid-name': 'test',
            age: '25',
          },
        },
      }

      try {
        await mcpServer.handleRequest(request)
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe(MCP_ERRORS.INVALID_PARAMS)
        expect(error.message).toContain('Invalid argument name')
      }
    })

    it('should reject argument names with special characters', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: 'valid', // Provide required argument
            'name!@#': 'test',
            age: '25',
          },
        },
      }

      try {
        await mcpServer.handleRequest(request)
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe(MCP_ERRORS.INVALID_PARAMS)
        expect(error.message).toContain('Invalid argument name')
      }
    })

    it('should handle missing required arguments', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: 'Alice',
            // age is missing
          },
        },
      }

      try {
        await mcpServer.handleRequest(request)
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe(MCP_ERRORS.MISSING_REQUIRED_ARGUMENT)
        expect(error.message).toContain('Missing required argument: age')
      }
    })

    it('should not replace partial matches', async () => {
      // Update mock to return a different prompt
      mockPromptService.getPrompt = async () => ({
        id: 'test-prompt-id',
        promptId: 'test-prompt',
        name: 'Test Prompt',
        description: 'A test prompt',
        content: 'Hello {name}, not {named} or {namespace}',
        arguments: [{ name: 'name', required: true }],
        metadata: {},
        githubPath: 'test.yaml',
        githubUrl: 'https://github.com/test',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncedAt: new Date(),
      })

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/get',
        params: {
          promptId: 'test-prompt',
          arguments: {
            name: 'Bob',
          },
        },
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      expect((response as any).result.prompt.content).toBe('Hello Bob, not {named} or {namespace}')
    })
  })

  describe('Protocol Implementation', () => {
    it('should handle initialize request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '1.0.0',
        },
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      expect((response as any).result.protocolVersion).toBe('1.0.0')
      expect((response as any).result.capabilities.prompts).toBeTruthy()
    })

    it('should handle prompts/list request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'prompts/list',
      }

      const response = await mcpServer.handleRequest(request)
      expect(response.result).toBeTruthy()
      expect((response as any).result.prompts).toBeArray()
      expect((response as any).result.prompts).toHaveLength(1)
    })

    it('should handle unknown methods', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'unknown/method',
      }

      try {
        await mcpServer.handleRequest(request)
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe(MCP_ERRORS.METHOD_NOT_FOUND)
      }
    })
  })
})
