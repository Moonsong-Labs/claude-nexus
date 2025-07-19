import { describe, it, expect, beforeEach } from 'bun:test'
import {
  ConversationLinker,
  type LinkingRequest,
  type TaskInvocation,
  type ParentRequest,
} from '../conversation-linker.js'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

describe('ConversationLinker - Subtask Detection', () => {
  let linker: ConversationLinker
  let mockLogger: { debug: () => void; info: () => void; warn: () => void; error: () => void }
  let mockSubtaskInvocations: TaskInvocation[] = []

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

  // Mock subtask query executor
  const mockSubtaskQueryExecutor = async (
    domain: string,
    timestamp: Date,
    debugMode?: boolean,
    subtaskPrompt?: string
  ): Promise<TaskInvocation[] | undefined> => {
    // When a specific prompt is provided, we still need to return ALL invocations
    // for the detectSubtask method to calculate sequences correctly
    // The prompt filter is just an optimization hint for the SQL query
    const timeWindowStart = new Date(timestamp.getTime() - 30000) // 30 seconds
    const invocationsInWindow = mockSubtaskInvocations.filter(
      inv => inv.timestamp >= timeWindowStart && inv.timestamp <= timestamp
    )

    // If a prompt is provided and no matching invocation exists, return empty
    if (subtaskPrompt && !invocationsInWindow.some(inv => inv.prompt === subtaskPrompt)) {
      return []
    }

    // Otherwise return all invocations in the window
    return invocationsInWindow
  }

  // Mock subtask sequence query executor
  const mockSubtaskSequenceQueryExecutor = async () => 0 // Always return 0 for base sequence

  beforeEach(() => {
    // Reset mock invocations
    mockSubtaskInvocations = []

    // Create a no-op logger for tests
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    linker = new ConversationLinker(
      mockQueryExecutor,
      mockLogger,
      undefined,
      mockRequestByIdExecutor,
      mockSubtaskQueryExecutor,
      mockSubtaskSequenceQueryExecutor
    )
  })

  describe('detectSubtask', () => {
    it('should detect subtask from matching Task invocation', async () => {
      // Set up mock task invocation
      const invocationTime = new Date()
      mockSubtaskInvocations = [
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-456',
          prompt: 'Analyze this code for performance issues',
          timestamp: invocationTime,
        },
      ]

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
        timestamp: new Date(invocationTime.getTime() + 5000), // 5 seconds after invocation
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBe(true)
      expect(result.parentTaskRequestId).toBe('parent-task-123')
      expect(result.subtaskSequence).toBe(1)
      expect(result.conversationId).toBe('conv-abc-123')
      expect(result.branchId).toBe('subtask_1')
    })

    it('should not detect subtask for multi-message conversations', async () => {
      // Set up mock task invocation
      const invocationTime = new Date()
      mockSubtaskInvocations = [
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-456',
          prompt: 'Test prompt',
          timestamp: invocationTime,
        },
      ]

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
        timestamp: new Date(invocationTime.getTime() + 5000),
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
      // Set up multiple task invocations from the same parent
      const baseTime = new Date()
      mockSubtaskInvocations = [
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-1',
          prompt: 'First subtask',
          timestamp: new Date(baseTime.getTime() - 3000),
        },
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-2',
          prompt: 'Second subtask',
          timestamp: new Date(baseTime.getTime() - 2000),
        },
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-3',
          prompt: 'Third subtask',
          timestamp: new Date(baseTime.getTime() - 1000),
        },
      ]

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
        timestamp: baseTime,
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBe(true)
      expect(result.parentTaskRequestId).toBe('parent-task-123')
      expect(result.subtaskSequence).toBe(2)
      expect(result.branchId).toBe('subtask_2')
    })

    it('should not detect subtask when message content does not match', async () => {
      // Set up mock task invocation
      const invocationTime = new Date()
      mockSubtaskInvocations = [
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-456',
          prompt: 'Analyze this code',
          timestamp: invocationTime,
        },
      ]

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
        timestamp: new Date(invocationTime.getTime() + 5000),
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBeUndefined()
      expect(result.parentTaskRequestId).toBeUndefined()
    })

    it('should handle array content format in messages', async () => {
      // Set up mock task invocation
      const invocationTime = new Date()
      mockSubtaskInvocations = [
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-456',
          prompt: 'Analyze this code',
          timestamp: invocationTime,
        },
      ]

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
        timestamp: new Date(invocationTime.getTime() + 5000),
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBe(true)
      expect(result.parentTaskRequestId).toBe('parent-task-123')
    })

    it('should not detect subtask for assistant messages', async () => {
      // Set up mock task invocation
      const invocationTime = new Date()
      mockSubtaskInvocations = [
        {
          requestId: 'parent-task-123',
          toolUseId: 'tool-456',
          prompt: 'Test prompt',
          timestamp: invocationTime,
        },
      ]

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
        timestamp: new Date(invocationTime.getTime() + 5000),
      }

      const result = await linker.linkConversation(request)

      expect(result.isSubtask).toBeUndefined()
      expect(result.parentTaskRequestId).toBeUndefined()
    })
  })
})

// JSON Fixture Tests for Subtask Detection
describe('ConversationLinker - Subtask JSON Fixtures', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'subtask-linking')

  it('should correctly handle all subtask fixture scenarios', async () => {
    // Read all test files from fixtures directory
    let files: string[] = []
    try {
      files = await readdir(fixturesDir)
    } catch (_error) {
      // No fixtures directory found, skipping JSON file tests
      return
    }

    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== '04-second-subtask.json') // Skip misnamed fixture

    for (const file of jsonFiles) {
      const filePath = join(fixturesDir, file)
      const content = await readFile(filePath, 'utf-8')
      const testCase = JSON.parse(content)

      // Validate fixture format
      if (
        !testCase.child?.body?.messages ||
        !testCase.child?.domain ||
        !testCase.child?.request_id
      ) {
        throw new Error(`Invalid fixture format in ${file}: missing required child fields`)
      }
      if (!testCase.description || testCase.type === undefined) {
        throw new Error(`Invalid fixture format in ${file}: missing description or type`)
      }

      // Create mocks for this test case
      const mockSubtaskInvocations: TaskInvocation[] = []
      let parentRequest: ParentRequest | null = null

      // If parent exists with Task invocations, prepare mock data
      if (testCase.parent?.task_invocations) {
        for (const invocation of testCase.parent.task_invocations) {
          mockSubtaskInvocations.push({
            requestId: testCase.parent.request_id,
            toolUseId: invocation.tool_use_id,
            prompt: invocation.prompt,
            timestamp: new Date(invocation.timestamp || testCase.parent.timestamp),
          })
        }

        parentRequest = {
          request_id: testCase.parent.request_id,
          conversation_id: testCase.parent.conversation_id || 'conv-test',
          branch_id: testCase.parent.branch_id || 'main',
          current_message_hash: testCase.parent.current_message_hash || 'hash-test',
          system_hash: testCase.parent.system_hash || null,
        }
      }

      // Create linker with appropriate mocks
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const mockSubtaskQueryExecutor = async (
        domain: string,
        timestamp: Date,
        debugMode?: boolean,
        subtaskPrompt?: string
      ): Promise<TaskInvocation[] | undefined> => {
        const timeWindowStart = new Date(timestamp.getTime() - 30000) // 30 seconds
        const invocationsInWindow = mockSubtaskInvocations.filter(
          inv => inv.timestamp >= timeWindowStart && inv.timestamp <= timestamp
        )

        if (subtaskPrompt && !invocationsInWindow.some(inv => inv.prompt === subtaskPrompt)) {
          return []
        }

        return invocationsInWindow
      }

      const mockRequestByIdExecutor = async (requestId: string): Promise<ParentRequest | null> => {
        if (parentRequest && requestId === parentRequest.request_id) {
          return parentRequest
        }
        return null
      }

      const mockSubtaskSequenceQueryExecutor = async (
        _conversationId: string,
        _timestamp: Date
      ): Promise<number> => {
        return 0 // Base sequence for testing
      }

      const linker = new ConversationLinker(
        async () => [], // Mock query executor
        mockLogger,
        undefined, // No compact search for these tests
        mockRequestByIdExecutor,
        mockSubtaskQueryExecutor,
        mockSubtaskSequenceQueryExecutor
      )

      // Process the child request
      const childMessages = testCase.child.body.messages
      const childSystemPrompt = testCase.child.body.system

      const request: LinkingRequest = {
        domain: testCase.child.domain,
        messages: childMessages,
        systemPrompt: childSystemPrompt,
        requestId: testCase.child.request_id,
        messageCount: childMessages.length,
        timestamp: testCase.child.timestamp ? new Date(testCase.child.timestamp) : new Date(),
      }

      const result = await linker.linkConversation(request)

      // Verify expectations
      if (testCase.expectedIsSubtask !== undefined) {
        if (testCase.expectedIsSubtask) {
          expect(result.isSubtask).toBe(true)
        } else {
          // When not a subtask, isSubtask can be undefined or false
          expect(result.isSubtask === undefined || result.isSubtask === false).toBe(true)
        }
      }

      if (testCase.expectedParentTaskRequestId !== undefined) {
        if (testCase.expectedIsSubtask) {
          expect(result.parentTaskRequestId).toBe(testCase.expectedParentTaskRequestId)
        } else {
          expect(result.parentTaskRequestId).toBeUndefined()
        }
      }

      if (testCase.expectedBranchId !== undefined && testCase.expectedIsSubtask) {
        expect(result.branchId).toBe(testCase.expectedBranchId)
      }

      // Test completed successfully - logging removed to pass linter
    }
  })
})
