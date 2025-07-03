import { describe, it, expect, beforeEach } from 'bun:test'
import {
  ConversationLinker,
  type LinkingRequest,
  type TaskContext,
  type ParentRequest,
} from '../conversation-linker.js'

describe('ConversationLinker - Subtask Detection', () => {
  let linker: ConversationLinker

  // Mock query executor
  const mockQueryExecutor = async () => []

  // Mock request by ID executor
  const mockRequestByIdExecutor = async (requestId: string): Promise<ParentRequest | null> => {
    // Return mock parent task data
    if (requestId === 'parent-task-123') {
      return {
        request_id: 'parent-task-123',
        conversation_id: 'conv-abc-123',
        branch_id: 'main',
        current_message_hash: 'hash123',
        system_hash: null,
      }
    }
    return null
  }

  beforeEach(() => {
    linker = new ConversationLinker(
      mockQueryExecutor,
      undefined,
      mockRequestByIdExecutor,
      undefined,
      undefined
    )
  })

  describe('detectSubtask', () => {
    it('should detect subtask from matching Task invocation', async () => {
      const taskContext: TaskContext = {
        recentInvocations: [
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-456',
            prompt: 'Analyze this code for performance issues',
            timestamp: new Date(),
          },
        ],
      }

      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'user',
            content: 'Analyze this code for performance issues',
          },
        ],
        requestId: 'subtask-request-789',
        messageCount: 1,
        taskContext,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBe(true)
      expect(result.parentTaskRequestId).toBe('parent-task-123')
      expect(result.subtaskSequence).toBe(1)
      expect(result.conversationId).toBe('conv-abc-123')
      expect(result.branchId).toBe('subtask_1')
    })

    it('should not detect subtask for multi-message conversations', async () => {
      const taskContext: TaskContext = {
        recentInvocations: [
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-456',
            prompt: 'Test prompt',
            timestamp: new Date(),
          },
        ],
      }

      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'user',
            content: 'First message',
          },
          {
            role: 'assistant',
            content: 'Response',
          },
          {
            role: 'user',
            content: 'Test prompt',
          },
        ],
        requestId: 'request-789',
        messageCount: 3,
        taskContext,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBeUndefined()
      expect(result.parentTaskRequestId).toBeUndefined()
    })

    it('should not detect subtask when no task context provided', async () => {
      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'user',
            content: 'Some user message',
          },
        ],
        requestId: 'request-789',
        messageCount: 1,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBeUndefined()
      expect(result.parentTaskRequestId).toBeUndefined()
    })

    it('should handle multiple subtasks with correct sequence numbers', async () => {
      const taskContext: TaskContext = {
        recentInvocations: [
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-1',
            prompt: 'First subtask',
            timestamp: new Date(Date.now() - 3000),
          },
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-2',
            prompt: 'Second subtask',
            timestamp: new Date(Date.now() - 2000),
          },
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-3',
            prompt: 'Third subtask',
            timestamp: new Date(Date.now() - 1000),
          },
        ],
      }

      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'user',
            content: 'Second subtask',
          },
        ],
        requestId: 'subtask-request-789',
        messageCount: 1,
        taskContext,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBe(true)
      expect(result.parentTaskRequestId).toBe('parent-task-123')
      expect(result.subtaskSequence).toBe(2)
      expect(result.branchId).toBe('subtask_2')
    })

    it('should not detect subtask when message content does not match', async () => {
      const taskContext: TaskContext = {
        recentInvocations: [
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-456',
            prompt: 'Analyze this code',
            timestamp: new Date(),
          },
        ],
      }

      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'user',
            content: 'Different message content',
          },
        ],
        requestId: 'request-789',
        messageCount: 1,
        taskContext,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBeUndefined()
      expect(result.parentTaskRequestId).toBeUndefined()
    })

    it('should handle array content format in messages', async () => {
      const taskContext: TaskContext = {
        recentInvocations: [
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-456',
            prompt: 'Analyze this code',
            timestamp: new Date(),
          },
        ],
      }

      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this code',
              },
            ],
          },
        ],
        requestId: 'subtask-request-789',
        messageCount: 1,
        taskContext,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBe(true)
      expect(result.parentTaskRequestId).toBe('parent-task-123')
    })

    it('should not detect subtask for assistant messages', async () => {
      const taskContext: TaskContext = {
        recentInvocations: [
          {
            requestId: 'parent-task-123',
            toolUseId: 'tool-456',
            prompt: 'Test prompt',
            timestamp: new Date(),
          },
        ],
      }

      const request: LinkingRequest = {
        domain: 'example.com',
        messages: [
          {
            role: 'assistant',
            content: 'Test prompt',
          },
        ],
        requestId: 'request-789',
        messageCount: 1,
        taskContext,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBeUndefined()
      expect(result.parentTaskRequestId).toBeUndefined()
    })
  })
})
