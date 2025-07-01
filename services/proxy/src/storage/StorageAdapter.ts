import { Pool } from 'pg'
import { StorageWriter } from './writer.js'
import { logger } from '../middleware/logger.js'
import { randomUUID } from 'crypto'
import { enableSqlLogging } from '../utils/sql-logger.js'
import {
  ConversationLinker,
  type QueryExecutor,
  type CompactSearchExecutor,
  type RequestByIdExecutor,
  type ClaudeMessage,
  type ParentQueryCriteria,
  type TaskInvocation,
} from '@claude-nexus/shared'
import { TaskInvocationCache } from './TaskInvocationCache.js'

/**
 * Storage adapter that provides a simplified interface for MetricsService
 * Wraps the StorageWriter to handle request/response storage
 */
export class StorageAdapter {
  private writer: StorageWriter
  private conversationLinker: ConversationLinker
  private taskInvocationCache: TaskInvocationCache
  private requestIdMap: Map<string, { uuid: string; timestamp: number }> = new Map() // Map nanoid to UUID with timestamp
  private cleanupTimer: NodeJS.Timeout | null = null
  private isClosed: boolean = false
  private readonly CLEANUP_INTERVAL_MS =
    Number(process.env.STORAGE_ADAPTER_CLEANUP_MS) || 5 * 60 * 1000 // 5 minutes
  private readonly RETENTION_TIME_MS =
    Number(process.env.STORAGE_ADAPTER_RETENTION_MS) || 60 * 60 * 1000 // 1 hour

  constructor(private pool: Pool) {
    // Enable SQL logging on the pool if DEBUG or DEBUG_SQL is set
    const loggingPool = enableSqlLogging(pool, {
      logQueries: process.env.DEBUG === 'true' || process.env.DEBUG_SQL === 'true',
      logSlowQueries: true,
      slowQueryThreshold: Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 5000,
      logStackTrace: process.env.DEBUG === 'true',
    })

    this.writer = new StorageWriter(loggingPool)
    this.taskInvocationCache = new TaskInvocationCache()

    // Create query executor for ConversationLinker
    const queryExecutor: QueryExecutor = async (criteria: ParentQueryCriteria) => {
      return await this.writer.findParentRequests(criteria)
    }

    // Create compact search executor
    const compactSearchExecutor: CompactSearchExecutor = async (
      domain: string,
      summaryContent: string,
      afterTimestamp: Date,
      beforeTimestamp?: Date
    ) => {
      return await this.writer.findParentByResponseContent(
        domain,
        summaryContent,
        afterTimestamp,
        beforeTimestamp
      )
    }

    // Create request by ID executor
    const requestByIdExecutor: RequestByIdExecutor = async (requestId: string) => {
      const details = await this.writer.getRequestDetails(requestId)
      if (!details) {
        return null
      }

      return {
        request_id: details.request_id,
        conversation_id: details.conversation_id,
        branch_id: details.branch_id || 'main',
        current_message_hash: details.current_message_hash || '',
        system_hash: details.system_hash || null,
      }
    }

    this.conversationLinker = new ConversationLinker(
      queryExecutor,
      compactSearchExecutor,
      requestByIdExecutor
    )
    this.scheduleNextCleanup()
  }

  /**
   * Store request data
   */
  async storeRequest(data: {
    id: string
    domain: string
    accountId?: string
    timestamp: Date
    method: string
    path: string
    headers: Record<string, string>
    body: any
    request_type: string
    model: string
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    usage_data?: any
    tool_call_count?: number
    processing_time?: number
    status_code?: number
    currentMessageHash?: string
    parentMessageHash?: string | null
    conversationId?: string
    branchId?: string
    systemHash?: string | null
    messageCount?: number
    parentTaskRequestId?: string
    isSubtask?: boolean
    taskToolInvocation?: any
    parentRequestId?: string
  }): Promise<void> {
    try {
      // Generate a UUID for this request and store the mapping with timestamp
      const uuid = randomUUID()
      this.requestIdMap.set(data.id, { uuid, timestamp: Date.now() })

      logger.debug('Stored request ID mapping', {
        metadata: {
          claudeId: data.id,
          uuid: uuid,
          mapSize: this.requestIdMap.size,
        },
      })

      await this.writer.storeRequest({
        requestId: uuid,
        domain: data.domain,
        accountId: data.accountId,
        timestamp: data.timestamp,
        method: data.method,
        path: data.path,
        headers: data.headers,
        body: data.body,
        apiKey: '', // Can be extracted from headers if needed
        model: data.model,
        requestType: data.request_type,
        currentMessageHash: data.currentMessageHash,
        parentMessageHash: data.parentMessageHash,
        conversationId: data.conversationId,
        branchId: data.branchId,
        systemHash: data.systemHash,
        messageCount: data.messageCount,
        parentTaskRequestId: data.parentTaskRequestId,
        isSubtask: data.isSubtask,
        taskToolInvocation: data.taskToolInvocation,
        parentRequestId: data.parentRequestId,
      })
    } catch (error) {
      logger.error('Failed to store request', {
        requestId: data.id,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Store response data
   */
  async storeResponse(data: {
    request_id: string
    status_code: number
    headers: Record<string, string>
    body: any
    timestamp: Date
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    usage_data?: any
    tool_call_count?: number
    processing_time?: number
  }): Promise<void> {
    try {
      // Get the UUID for this request ID
      const mapping = this.requestIdMap.get(data.request_id)
      if (!mapping) {
        // This can happen if the request was cleaned up due to age
        // Log at debug level instead of warn to reduce noise
        logger.debug('No UUID mapping found for request ID - may have been cleaned up', {
          requestId: data.request_id,
          metadata: {
            mapSize: this.requestIdMap.size,
            reason: 'likely_cleaned_up',
          },
        })
        return
      }
      const uuid = mapping.uuid

      // The writer's storeResponse method will update the existing request
      await this.writer.storeResponse({
        requestId: uuid,
        statusCode: data.status_code,
        headers: data.headers,
        body: data.body,
        streaming: false, // Will be determined from the request
        inputTokens: data.input_tokens, // Use provided values
        outputTokens: data.output_tokens,
        totalTokens: data.total_tokens,
        cacheCreationInputTokens: data.cache_creation_input_tokens,
        cacheReadInputTokens: data.cache_read_input_tokens,
        usageData: data.usage_data,
        firstTokenMs: undefined,
        durationMs: data.processing_time || 0,
        error: undefined,
        toolCallCount: data.tool_call_count,
      })

      // Clean up the requestIdMap entry to prevent memory leak
      this.requestIdMap.delete(data.request_id)
    } catch (error) {
      logger.error('Failed to store response', {
        requestId: data.request_id,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Store streaming chunk
   */
  async storeStreamingChunk(requestId: string, chunkIndex: number, data: any): Promise<void> {
    try {
      // Get the UUID for this request ID
      const mapping = this.requestIdMap.get(requestId)
      if (!mapping) {
        // This can happen if the request was cleaned up due to age
        logger.debug(
          'No UUID mapping found for request ID in storeStreamingChunk - may have been cleaned up',
          {
            requestId,
            metadata: {
              mapSize: this.requestIdMap.size,
              reason: 'likely_cleaned_up',
            },
          }
        )
        return
      }
      const uuid = mapping.uuid

      await this.writer.storeStreamingChunk({
        requestId: uuid,
        chunkIndex,
        timestamp: new Date(),
        data: JSON.stringify(data),
        tokenCount: data.usage?.output_tokens,
      })
    } catch (error) {
      logger.error('Failed to store streaming chunk', {
        requestId,
        metadata: {
          chunkIndex,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Find conversation ID by parent message hash
   */
  async findConversationByParentHash(parentHash: string): Promise<string | null> {
    return await this.writer.findConversationByParentHash(parentHash)
  }

  /**
   * Link a conversation using the new ConversationLinker
   */
  async linkConversation(
    domain: string,
    messages: ClaudeMessage[],
    systemPrompt:
      | string
      | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
      | undefined,
    requestId: string
  ) {
    const messageCount = messages?.length || 0

    // Convert nanoid to UUID before passing to ConversationLinker
    let uuid: string
    if (this.isValidUUID(requestId)) {
      uuid = requestId
    } else {
      const mapping = this.requestIdMap.get(requestId)
      if (!mapping) {
        logger.warn('No UUID mapping found for request in linkConversation', {
          requestId,
          metadata: {
            mapSize: this.requestIdMap.size,
          },
        })
        // Generate a new UUID as fallback
        uuid = randomUUID()
      } else {
        uuid = mapping.uuid
      }
    }

    // Get recent task invocations from cache
    const recentInvocations = this.taskInvocationCache.getRecent(domain, 30000) // 30 second window

    const result = await this.conversationLinker.linkConversation({
      domain,
      messages,
      systemPrompt,
      requestId: uuid,
      messageCount,
      taskContext: recentInvocations.length > 0 ? { recentInvocations } : undefined,
    })

    // Log if subtask was detected
    if (result.isSubtask) {
      logger.info('Linked sub-task to parent conversation', {
        requestId: uuid,
        metadata: {
          parentTaskRequestId: result.parentTaskRequestId,
          conversationId: result.conversationId,
          subtaskSequence: result.subtaskSequence,
          branchId: result.branchId,
        },
      })
    }

    return result
  }

  /**
   * Process Task tool invocations in a response
   */
  async processTaskToolInvocations(
    requestId: string,
    responseBody: any,
    domain: string
  ): Promise<void> {
    const taskInvocations = this.writer.findTaskToolInvocations(responseBody)

    if (taskInvocations.length > 0) {
      logger.info('Found Task tool invocations', {
        requestId,
        metadata: {
          taskCount: taskInvocations.length,
          tasks: taskInvocations.map(t => ({ id: t.id, name: t.name })),
        },
      })

      // Get the UUID for this request
      // First check if requestId is already a UUID
      let uuid: string
      if (this.isValidUUID(requestId)) {
        uuid = requestId
      } else {
        const mapping = this.requestIdMap.get(requestId)
        if (!mapping) {
          logger.warn('No UUID mapping found for request when processing task invocations', {
            requestId,
            metadata: {
              mapSize: this.requestIdMap.size,
              isUUID: this.isValidUUID(requestId),
            },
          })
          return
        }
        uuid = mapping.uuid
      }

      // Cache task invocations for quick lookup
      const timestamp = new Date()
      for (const invocation of taskInvocations) {
        // Extract prompt from input - the Task tool typically has a 'prompt' field in its input
        const prompt = invocation.input?.prompt || invocation.input?.description || ''

        const taskInvocation: TaskInvocation = {
          requestId: uuid,
          toolUseId: invocation.id,
          prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
          timestamp,
        }
        this.taskInvocationCache.add(domain, taskInvocation)
      }

      // Mark the request as having task invocations in the database
      await this.writer.markTaskToolInvocations(uuid, taskInvocations)

      // Task invocations are now tracked in both cache and database
      // Linking will happen when new conversations are stored
    }
  }

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }

  /**
   * Schedule the next cleanup using recursive setTimeout
   */
  private scheduleNextCleanup(): void {
    // Don't schedule if we're closed
    if (this.isClosed) {
      return
    }

    this.cleanupTimer = setTimeout(() => {
      try {
        this.cleanupOrphanedEntries()
      } catch (error) {
        logger.error('Error during cleanup of orphaned entries', {
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        })
        // Continue scheduling despite errors to prevent the cleanup from stopping
      }
      this.scheduleNextCleanup()
    }, this.CLEANUP_INTERVAL_MS)
  }

  /**
   * Clean up orphaned entries older than retention time
   */
  private cleanupOrphanedEntries(): void {
    const startTime = Date.now()
    const now = startTime
    let cleanedCount = 0
    const initialSize = this.requestIdMap.size

    try {
      for (const [requestId, mapping] of this.requestIdMap.entries()) {
        if (now - mapping.timestamp > this.RETENTION_TIME_MS) {
          this.requestIdMap.delete(requestId)
          cleanedCount++
        }
      }

      const durationMs = Date.now() - startTime

      // Always log metrics for observability
      logger.info('Storage adapter cleanup cycle completed', {
        metadata: {
          cleanedCount,
          initialSize,
          currentSize: this.requestIdMap.size,
          durationMs,
          retentionTimeMs: this.RETENTION_TIME_MS,
          cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
        },
      })

      // Warn if cleanup is taking too long
      if (durationMs > 100) {
        logger.warn('Storage adapter cleanup took longer than expected', {
          metadata: {
            durationMs,
            mapSize: initialSize,
            cleanedCount,
          },
        })
      }
    } catch (error) {
      logger.error('Failed to complete cleanup of orphaned entries', {
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          initialSize,
          cleanedCount,
        },
      })
      // Re-throw to ensure the error is handled by the caller
      throw error
    }
  }

  /**
   * Close the storage adapter
   */
  async close(): Promise<void> {
    // Mark as closed to prevent new cleanups from being scheduled
    this.isClosed = true

    // Clear the cleanup timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer)
      this.cleanupTimer = null
    }

    // Clear the request ID map
    this.requestIdMap.clear()

    // Destroy the task invocation cache
    this.taskInvocationCache.destroy()

    // Close the writer
    await this.writer.cleanup()
  }
}
