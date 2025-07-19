import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'
import { StorageWriter } from '../../services/proxy/src/storage/writer.js'

/**
 * Integration test for subtask linking functionality
 * 
 * Prerequisites:
 * - PostgreSQL database must be running
 * - DATABASE_URL must be set
 * - Database schema must be up to date (run all migrations)
 * - Note: If tests fail with "value too long for type character varying(50)", 
 *   the database schema may be outdated. The domain column should be VARCHAR(255).
 */

describe('Subtask Linking Integration', () => {
  let pool: Pool
  let writer: StorageWriter
  let testRequestIds: string[] = []

  beforeAll(() => {
    // Create a new pool for integration tests
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
    writer = new StorageWriter(pool)
  })

  afterAll(async () => {
    // Clean up any remaining test data
    if (testRequestIds.length > 0) {
      await pool.query(
        'DELETE FROM api_requests WHERE request_id = ANY($1::uuid[])',
        [testRequestIds]
      )
    }
    await pool.end()
  })

  beforeEach(() => {
    // Reset test request IDs for each test
    testRequestIds = []
  })

  describe('Subtask Creation and Linking', () => {
    it('should link a subtask to its parent task when matching prompt is found', async () => {
      // First, create a parent task with a Task tool invocation
      const parentRequestId = randomUUID()
      const parentTimestamp = new Date()
      testRequestIds.push(parentRequestId)

      const taskPrompt = 'Count the total lines of code in the claude-nexus-proxy repository. \n\nPlease:\n1. Use tools like `find`, `wc`, and `rg` to get accurate counts'

      // Store the parent request with a Task tool invocation
      await writer.storeRequest({
        requestId: parentRequestId,
        domain: 'test.local',
        timestamp: parentTimestamp,
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        body: {
          messages: [
            { role: 'user', content: 'Please analyze the codebase' }
          ],
        },
        apiKey: 'test-key',
        model: 'claude-3-opus',
        requestType: 'inference',
        conversationId: randomUUID(),
        currentMessageHash: 'parent-hash',
        parentMessageHash: null,
      })

      // Store the response with Task tool invocation
      await writer.storeResponse({
        requestId: parentRequestId,
        statusCode: 200,
        headers: {},
        body: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'Task',
              input: {
                prompt: taskPrompt,
                description: 'Count lines of code'
              }
            }
          ]
        },
        streamingChunks: [],
        timestamp: new Date(parentTimestamp.getTime() + 1000),
        processingTime: 1000,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      })

      // Extract and mark the task tool invocations
      const taskInvocations = writer.findTaskToolInvocations({
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'Task',
            input: {
              prompt: taskPrompt,
              description: 'Count lines of code'
            }
          }
        ]
      })
      await writer.markTaskToolInvocations(parentRequestId, taskInvocations)

      // Create a subtask that should match the Task invocation
      const subtaskRequestId = randomUUID()
      const subtaskTimestamp = new Date(parentTimestamp.getTime() + 5000) // 5 seconds later
      testRequestIds.push(subtaskRequestId)

      await writer.storeRequest({
        requestId: subtaskRequestId,
        domain: 'test.local',
        timestamp: subtaskTimestamp,
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        body: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '<system-reminder>System context</system-reminder>' },
                { type: 'text', text: taskPrompt },
              ],
            },
          ],
        },
        apiKey: 'test-key',
        model: 'claude-3-opus',
        requestType: 'inference',
        conversationId: randomUUID(),
        currentMessageHash: 'subtask-hash',
        parentMessageHash: null, // New conversation = potential sub-task
      })

      // Verify the subtask was linked
      const result = await pool.query(
        'SELECT parent_task_request_id, is_subtask, conversation_id FROM api_requests WHERE request_id = $1',
        [subtaskRequestId]
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].parent_task_request_id).toBe(parentRequestId)
      expect(result.rows[0].is_subtask).toBe(true)
    })

    it('should not link a subtask when no matching parent task exists', async () => {
      const subtaskRequestId = randomUUID()
      testRequestIds.push(subtaskRequestId)

      await writer.storeRequest({
        requestId: subtaskRequestId,
        domain: 'test.local',
        timestamp: new Date(),
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        body: {
          messages: [
            {
              role: 'user',
              content: 'This is a unique prompt that has no matching parent task',
            },
          ],
        },
        apiKey: 'test-key',
        model: 'claude-3-opus',
        requestType: 'inference',
        conversationId: randomUUID(),
        currentMessageHash: 'unique-hash',
        parentMessageHash: null,
      })

      // Verify the subtask was not linked
      const result = await pool.query(
        'SELECT parent_task_request_id, is_subtask FROM api_requests WHERE request_id = $1',
        [subtaskRequestId]
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].parent_task_request_id).toBeNull()
      expect(result.rows[0].is_subtask).toBe(false)
    })

    it('should not link a subtask when the timing window has expired', async () => {
      // Create a parent task
      const parentRequestId = randomUUID()
      const parentTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      testRequestIds.push(parentRequestId)

      const taskPrompt = 'Analyze the old data'

      await writer.storeRequest({
        requestId: parentRequestId,
        domain: 'test.local',
        timestamp: parentTimestamp,
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        body: {
          messages: [{ role: 'user', content: 'Please analyze' }],
        },
        apiKey: 'test-key',
        model: 'claude-3-opus',
        requestType: 'inference',
        conversationId: randomUUID(),
        currentMessageHash: 'old-parent-hash',
        parentMessageHash: null,
      })

      await writer.storeResponse({
        requestId: parentRequestId,
        statusCode: 200,
        headers: {},
        body: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_456',
              name: 'Task',
              input: { prompt: taskPrompt }
            }
          ]
        },
        streamingChunks: [],
        timestamp: new Date(parentTimestamp.getTime() + 1000),
        processingTime: 1000,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      })

      const taskInvocations = writer.findTaskToolInvocations({
        content: [
          {
            type: 'tool_use',
            id: 'tool_456',
            name: 'Task',
            input: { prompt: taskPrompt }
          }
        ]
      })
      await writer.markTaskToolInvocations(parentRequestId, taskInvocations)

      // Create a subtask now (outside the 30-second window)
      const subtaskRequestId = randomUUID()
      testRequestIds.push(subtaskRequestId)

      await writer.storeRequest({
        requestId: subtaskRequestId,
        domain: 'test.local',
        timestamp: new Date(),
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        body: {
          messages: [
            {
              role: 'user',
              content: taskPrompt,
            },
          ],
        },
        apiKey: 'test-key',
        model: 'claude-3-opus',
        requestType: 'inference',
        conversationId: randomUUID(),
        currentMessageHash: 'new-subtask-hash',
        parentMessageHash: null,
      })

      // Verify the subtask was not linked due to timing
      const result = await pool.query(
        'SELECT parent_task_request_id, is_subtask FROM api_requests WHERE request_id = $1',
        [subtaskRequestId]
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].parent_task_request_id).toBeNull()
      expect(result.rows[0].is_subtask).toBe(false)
    })
  })
})