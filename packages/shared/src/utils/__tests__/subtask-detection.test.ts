import { describe, it, expect, beforeEach } from 'bun:test'
import {
  ConversationLinker,
  type LinkingRequest,
  type TaskInvocation,
  type ParentRequest,
} from '../conversation-linker.js'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

// Mock data types
type MockLogger = {
  debug: () => void
  info: () => void
  warn: () => void
  error: () => void
}

// Factory functions for mock creation
const createMockLogger = (): MockLogger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

const createMockQueryExecutor = () => async () => []

const createMockRequestByIdExecutor =
  (parentRequests: Record<string, ParentRequest>) =>
  async (requestId: string): Promise<ParentRequest | null> =>
    parentRequests[requestId] || null

const createMockSubtaskQueryExecutor =
  (invocations: TaskInvocation[]) =>
  async (
    domain: string,
    timestamp: Date,
    debugMode?: boolean,
    subtaskPrompt?: string
  ): Promise<TaskInvocation[] | undefined> => {
    const timeWindowStart = new Date(timestamp.getTime() - 30000) // 30 seconds
    const invocationsInWindow = invocations.filter(
      inv => inv.timestamp >= timeWindowStart && inv.timestamp <= timestamp
    )

    if (subtaskPrompt && !invocationsInWindow.some(inv => inv.prompt === subtaskPrompt)) {
      return []
    }

    return invocationsInWindow
  }

const createMockSubtaskSequenceQueryExecutor = () => async () => 0

// Default parent request data
const DEFAULT_PARENT_REQUEST: ParentRequest = {
  request_id: 'parent-task-123',
  conversation_id: 'conv-abc-123',
  branch_id: 'main',
  current_message_hash: 'hash123',
  system_hash: null,
}

describe('ConversationLinker - Subtask Detection', () => {
  let mockSubtaskInvocations: TaskInvocation[] = []
  let mockParentRequests: Record<string, ParentRequest> = {}

  const createLinker = () => {
    const mockLogger = createMockLogger()
    const mockQueryExecutor = createMockQueryExecutor()
    const mockRequestByIdExecutor = createMockRequestByIdExecutor(mockParentRequests)
    const mockSubtaskQueryExecutor = createMockSubtaskQueryExecutor(mockSubtaskInvocations)
    const mockSubtaskSequenceQueryExecutor = createMockSubtaskSequenceQueryExecutor()

    return new ConversationLinker(
      mockQueryExecutor,
      mockLogger,
      undefined,
      mockRequestByIdExecutor,
      mockSubtaskQueryExecutor,
      mockSubtaskSequenceQueryExecutor
    )
  }

  beforeEach(() => {
    mockSubtaskInvocations = []
    mockParentRequests = {
      'parent-task-123': DEFAULT_PARENT_REQUEST,
    }
  })

  describe('Unit Tests', () => {
    describe('Basic Subtask Detection', () => {
      it('should detect subtask from matching Task invocation', async () => {
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

        const linker = createLinker()
        const result = await linker.linkConversation(request)

        expect(result.isSubtask).toBe(true)
        expect(result.parentTaskRequestId).toBe('parent-task-123')
        expect(result.subtaskSequence).toBe(1)
        expect(result.conversationId).toBe('conv-abc-123')
        expect(result.branchId).toBe('subtask_1')
      })

      it('should not detect subtask for multi-message conversations', async () => {
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

        const linker = createLinker()
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

        const linker = createLinker()
        const result = await linker.linkConversation(request)

        expect(result.isSubtask).toBeUndefined()
        expect(result.parentTaskRequestId).toBeUndefined()
      })

      it('should handle multiple subtasks with correct sequence numbers', async () => {
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

        const linker = createLinker()
        const result = await linker.linkConversation(request)

        expect(result.isSubtask).toBe(true)
        expect(result.parentTaskRequestId).toBe('parent-task-123')
        expect(result.subtaskSequence).toBe(2)
        expect(result.branchId).toBe('subtask_2')
      })

      it('should not detect subtask when message content does not match', async () => {
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

        const linker = createLinker()
        const result = await linker.linkConversation(request)

        expect(result.isSubtask).toBeUndefined()
        expect(result.parentTaskRequestId).toBeUndefined()
      })

      it('should handle array content format in messages', async () => {
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

        const linker = createLinker()
        const result = await linker.linkConversation(request)

        expect(result.isSubtask).toBe(true)
        expect(result.parentTaskRequestId).toBe('parent-task-123')
      })

      it('should not detect subtask for assistant messages', async () => {
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

        const linker = createLinker()
        const result = await linker.linkConversation(request)

        expect(result.isSubtask).toBeUndefined()
        expect(result.parentTaskRequestId).toBeUndefined()
      })
    })

    describe('JSON Fixture Tests', () => {
      const fixturesDir = join(__dirname, 'fixtures', 'subtask-linking')

      it('should correctly handle all subtask fixture scenarios', async () => {
        let files: string[] = []
        try {
          files = await readdir(fixturesDir)
        } catch (_error) {
          // No fixtures directory found, skipping JSON file tests
          return
        }

        const jsonFiles = files.filter(f => f.endsWith('.json'))

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

          // Prepare test-specific mocks
          mockSubtaskInvocations = []
          mockParentRequests = {}

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

            mockParentRequests[testCase.parent.request_id] = {
              request_id: testCase.parent.request_id,
              conversation_id: testCase.parent.conversation_id || 'conv-test',
              branch_id: testCase.parent.branch_id || 'main',
              current_message_hash: testCase.parent.current_message_hash || 'hash-test',
              system_hash: testCase.parent.system_hash || null,
            }
          }

          // Create linker for this test case
          const linker = createLinker()

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
        }
      })
    })
  })
})
