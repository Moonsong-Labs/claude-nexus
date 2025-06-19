import { describe, it, expect } from 'bun:test'
import { ProxyResponse } from '../../services/proxy/src/domain/entities/ProxyResponse'

describe('Tool Notification Formatting', () => {
  describe('Tool call extraction with input data', () => {
    it('should extract tool calls with input data from non-streaming response', () => {
      const response = new ProxyResponse('resp-123', false)
      response.processResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me help you with that.' },
          {
            type: 'tool_use',
            id: 'tool_read',
            name: 'Read',
            input: { file_path: '/home/user/projects/myapp/src/index.ts' },
          },
          {
            type: 'tool_use',
            id: 'tool_edit',
            name: 'Edit',
            input: {
              file_path: '/home/user/projects/myapp/src/utils/helper.ts',
              old_string: 'foo',
              new_string: 'bar',
            },
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 15 },
      })

      const toolCalls = response.toolCalls
      expect(toolCalls).toHaveLength(2)
      expect(toolCalls[0]).toEqual({
        name: 'Read',
        id: 'tool_read',
        input: { file_path: '/home/user/projects/myapp/src/index.ts' },
      })
      expect(toolCalls[1]).toEqual({
        name: 'Edit',
        id: 'tool_edit',
        input: {
          file_path: '/home/user/projects/myapp/src/utils/helper.ts',
          old_string: 'foo',
          new_string: 'bar',
        },
      })
    })

    it('should extract tool calls from streaming response', () => {
      const response = new ProxyResponse('resp-stream', true)

      // Start message
      response.processStreamEvent({
        type: 'message_start',
        message: {
          id: 'msg_stream',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-haiku-20240307',
          usage: { input_tokens: 8, output_tokens: 0 },
        },
      })

      // Tool use blocks
      response.processStreamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_bash',
          name: 'Bash',
          input: { command: 'npm install express', description: 'Install Express package' },
        },
      })

      response.processStreamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'tool_grep',
          name: 'Grep',
          input: { pattern: 'TODO.*fix', include: '*.ts' },
        },
      })

      const toolCalls = response.toolCalls
      expect(toolCalls).toHaveLength(2)
      expect(toolCalls[0]).toEqual({
        name: 'Bash',
        id: 'tool_bash',
        input: { command: 'npm install express', description: 'Install Express package' },
      })
      expect(toolCalls[1]).toEqual({
        name: 'Grep',
        id: 'tool_grep',
        input: { pattern: 'TODO.*fix', include: '*.ts' },
      })
    })

    it('should handle tool calls without input', () => {
      const response = new ProxyResponse('resp-456', false)
      response.processResponse({
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_todo',
            name: 'TodoRead',
            // No input field
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      })

      const toolCalls = response.toolCalls
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0]).toEqual({
        name: 'TodoRead',
        id: 'tool_todo',
        input: undefined,
      })
    })
  })

  describe('Tool notification formatting examples', () => {
    it('should format file operations with folder/filename', () => {
      const testCases = [
        {
          tool: { name: 'Read', input: { file_path: '/home/user/projects/app/src/index.ts' } },
          expected: 'Reading file: src/index.ts',
        },
        {
          tool: {
            name: 'Write',
            input: { file_path: '/home/user/projects/app/config/settings.json' },
          },
          expected: 'Writing file: config/settings.json',
        },
        {
          tool: { name: 'Edit', input: { file_path: '/home/user/projects/app/lib/utils.ts' } },
          expected: 'Editing file: lib/utils.ts',
        },
        {
          tool: { name: 'MultiEdit', input: { file_path: '/home/user/docs/README.md' } },
          expected: 'Editing file: docs/README.md',
        },
      ]

      testCases.forEach(({ tool, expected }) => {
        const pathParts = tool.input.file_path.split('/')
        const fileName = pathParts.slice(-2).join('/')
        expect(fileName).toBe(expected.split(': ')[1])
      })
    })

    it('should format Bash commands with truncation', () => {
      const longCommand = 'git log --pretty=format:"%h %ad | %s%d [%an]" --date=short --graph --all'
      
      const truncated = longCommand.length > 50 ? longCommand.substring(0, 50) + '...' : longCommand
      expect(truncated).toBe('git log --pretty=format:"%h %ad | %s%d [%an]" --da...')
    })

    it('should format TodoWrite with status counts', () => {
      const todos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'pending', priority: 'medium' },
        { id: '3', content: 'Task 3', status: 'in_progress', priority: 'high' },
        { id: '4', content: 'Task 4', status: 'completed', priority: 'low' },
        { id: '5', content: 'Task 5', status: 'completed', priority: 'medium' },
        { id: '6', content: 'Task 6', status: 'completed', priority: 'low' },
      ]

      const pending = todos.filter(t => t.status === 'pending').length
      const inProgress = todos.filter(t => t.status === 'in_progress').length
      const completed = todos.filter(t => t.status === 'completed').length

      expect(pending).toBe(2)
      expect(inProgress).toBe(1)
      expect(completed).toBe(3)

      const statusParts = []
      if (pending > 0) {statusParts.push(`${pending} pending`)}
      if (inProgress > 0) {statusParts.push(`${inProgress} in progress`)}
      if (completed > 0) {statusParts.push(`${completed} completed`)}

      const expectedMessage = `Tasks: ${statusParts.join(', ')}`
      expect(expectedMessage).toBe('Tasks: 2 pending, 1 in progress, 3 completed')
    })

    it('should format LS with folder path', () => {
      const tool = {
        name: 'LS',
        input: { path: '/home/user/projects/myapp/src/components' },
      }

      const pathParts = tool.input.path.split('/')
      const dirName = pathParts.slice(-2).join('/')
      expect(dirName).toBe('src/components')
    })

    it('should handle WebSearch query truncation', () => {
      const longQuery =
        'How to implement authentication with JWT tokens in Node.js Express application with TypeScript'
      
      const truncated = longQuery.length > 40 ? longQuery.substring(0, 40) + '...' : longQuery
      expect(truncated).toBe('How to implement authentication with JWT...')
    })

    it('should extract hostname from WebFetch URL', () => {
      const tool = {
        name: 'WebFetch',
        input: { url: 'https://docs.anthropic.com/en/docs/claude-code/overview' },
      }

      const url = new URL(tool.input.url)
      expect(url.hostname).toBe('docs.anthropic.com')
    })

    it('should handle tools with prompt field', () => {
      const tool = {
        name: 'mcp__zen__debug',
        input: {
          prompt:
            'Debug why the authentication middleware is not working correctly in the Express app',
          files: ['/path/to/auth.ts'],
        },
      }

      const truncated =
        tool.input.prompt.length > 40
          ? tool.input.prompt.substring(0, 40) + '...'
          : tool.input.prompt
      expect(truncated).toBe('Debug why the authentication middleware ...')
    })
  })
})
