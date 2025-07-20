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
  type SubtaskQueryExecutor,
  type SubtaskSequenceQueryExecutor,
  type ClaudeMessage,
  type ClaudeMessagesResponse,
  type ParentQueryCriteria,
  type TaskInvocation,
} from '@claude-nexus/shared'
import {
  STORAGE_TIME_WINDOWS,
  STORAGE_QUERY_LIMITS,
  REQUEST_ID_CLEANUP,
  STORAGE_ENV_VARS,
  UUID_REGEX,
} from './constants.js'
import type {
  IStorageAdapter,
  StorageRequestData,
  StorageResponseData,
  ConversationLinkResult,
} from '../types/IStorageAdapter.js'

/**
 * Storage adapter that provides a unified interface for persisting API requests and responses.
 *
 * This adapter serves as the primary abstraction layer between the proxy service and the storage system,
 * handling:
 * - Request/response data persistence via StorageWriter
 * - Request ID mapping (nanoid to UUID conversion) with automatic cleanup
 * - Conversation tracking and linking via ConversationLinker
 * - Task tool invocation detection for sub-task relationships
 *
 * The adapter implements a cleanup mechanism to prevent memory leaks from the request ID mapping cache.
 *
 * @example
 * ```typescript
 * const adapter = new StorageAdapter(pgPool);
 * await adapter.storeRequest(requestData);
 * await adapter.storeResponse(responseData);
 * await adapter.close(); // Always close when done
 * ```
 */
export class StorageAdapter implements IStorageAdapter {
  private writer: StorageWriter
  private conversationLinker: ConversationLinker
  private requestIdMap: Map<string, { uuid: string; timestamp: number }> = new Map() // Map nanoid to UUID with timestamp
  private cleanupTimer: NodeJS.Timeout | null = null
  private isClosed: boolean = false
  private readonly cleanupIntervalMs =
    Number(process.env[STORAGE_ENV_VARS.CLEANUP_INTERVAL]) || REQUEST_ID_CLEANUP.DEFAULT_INTERVAL_MS
  private readonly retentionTimeMs =
    Number(process.env[STORAGE_ENV_VARS.RETENTION_TIME]) || REQUEST_ID_CLEANUP.DEFAULT_RETENTION_MS

  constructor(private pool: Pool) {
    // Enable SQL logging on the pool if DEBUG or DEBUG_SQL is set
    const loggingPool = enableSqlLogging(pool, {
      logQueries: process.env.DEBUG === 'true' || process.env.DEBUG_SQL === 'true',
      logSlowQueries: true,
      slowQueryThreshold: Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 5000,
      logStackTrace: process.env.DEBUG === 'true',
    })

    this.writer = new StorageWriter(loggingPool)

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

    // Create subtask query executor that uses the provided timestamp and optional prompt
    const subtaskQueryExecutor: SubtaskQueryExecutor = async (
      domain: string,
      timestamp: Date,
      debugMode?: boolean,
      subtaskPrompt?: string
    ) => {
      return this.loadTaskInvocations(domain, timestamp, debugMode, subtaskPrompt)
    }

    // Create subtask sequence query executor
    const subtaskSequenceQueryExecutor: SubtaskSequenceQueryExecutor = async (
      conversationId: string,
      beforeTimestamp: Date
    ) => {
      return await this.writer.getMaxSubtaskSequence(conversationId, beforeTimestamp)
    }

    // Create a logger adapter that converts proxy logger to shared logger interface
    const loggerAdapter = {
      debug: (message: string, context?: any) => {
        logger.debug(message, context)
      },
      info: (message: string, context?: any) => {
        logger.info(message, context)
      },
      warn: (message: string, context?: any) => {
        logger.warn(message, context)
      },
      error: (message: string, context?: any) => {
        logger.error(message, context)
      },
    }

    this.conversationLinker = new ConversationLinker(
      queryExecutor,
      loggerAdapter,
      compactSearchExecutor,
      requestByIdExecutor,
      subtaskQueryExecutor,
      subtaskSequenceQueryExecutor
    )

    this.scheduleNextCleanup()
  }

  /**
   * Stores API request data in the database.
   *
   * This method generates a UUID for the request, maintains the nanoid-to-UUID mapping,
   * and delegates to StorageWriter for persistence. It handles conversation metadata
   * including message hashes, conversation IDs, and sub-task relationships.
   *
   * @param data - The request data to store
   * @param data.id - The original request ID (typically a nanoid)
   * @param data.domain - The domain making the request
   * @param data.accountId - Optional account identifier from credentials
   * @param data.conversationId - Optional conversation ID for linking related requests
   * @param data.isSubtask - Whether this request is a sub-task spawned by Task tool
   * @throws {Error} If storage operation fails
   */
  async storeRequest(data: StorageRequestData): Promise<void> {
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
   * Stores API response data in the database.
   *
   * This method looks up the UUID for the request ID and updates the existing request record
   * with response data including status, headers, body, and token usage metrics.
   *
   * @param data - The response data to store
   * @param data.request_id - The original request ID to match with stored request
   * @param data.status_code - HTTP status code of the response
   * @param data.body - The response body (full response including metadata)
   * @param data.input_tokens - Number of input tokens consumed
   * @param data.output_tokens - Number of output tokens generated
   * @throws {Error} If storage operation fails
   */
  async storeResponse(data: StorageResponseData): Promise<void> {
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
   * Stores a streaming response chunk for later reconstruction.
   *
   * Used for streaming responses to capture individual chunks as they arrive.
   * Chunks are stored with their index to maintain proper ordering.
   *
   * @param requestId - The original request ID
   * @param chunkIndex - Sequential index of this chunk in the stream
   * @param data - The chunk data to store
   */
  async storeStreamingChunk(requestId: string, chunkIndex: number, data: unknown): Promise<void> {
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
   * Finds a conversation ID by searching for a parent message hash.
   *
   * Used for conversation linking when determining if a new request continues
   * an existing conversation thread.
   *
   * @param parentHash - The parent message hash to search for
   * @param beforeTimestamp - Only consider conversations before this timestamp
   * @returns The conversation ID if found, null otherwise
   */
  async findConversationByParentHash(
    parentHash: string,
    beforeTimestamp: Date
  ): Promise<string | null> {
    return await this.writer.findConversationByParentHash(parentHash, beforeTimestamp)
  }

  /**
   * Links a request to its conversation thread using message content hashing.
   *
   * This method uses the ConversationLinker to determine conversation relationships,
   * detect branches, and identify sub-tasks spawned by the Task tool. It handles
   * nanoid-to-UUID conversion and passes the request to ConversationLinker for analysis.
   *
   * @param domain - The domain for the request
   * @param messages - The conversation messages to analyze
   * @param systemPrompt - The system prompt (string or structured format)
   * @param requestId - The request ID (nanoid or UUID)
   * @param referenceTime - The timestamp of the request being processed
   * @returns Conversation linking results including IDs, hashes, and sub-task info
   */
  async linkConversation(
    domain: string,
    messages: ClaudeMessage[],
    systemPrompt:
      | string
      | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
      | undefined,
    requestId: string,
    referenceTime: Date
  ): Promise<ConversationLinkResult> {
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

    // ConversationLinker will now handle loading task invocations internally
    // Use the provided referenceTime for task context
    const result = await this.conversationLinker.linkConversation({
      domain,
      messages,
      systemPrompt,
      requestId: uuid,
      messageCount,
      timestamp: referenceTime, // Always use the request's timestamp
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
   * Processes and stores Task tool invocations found in a response.
   *
   * This method scans the response body for Task tool usage, extracts the invocations,
   * and marks the request as having task invocations in the database. This data is later
   * used for sub-task detection and linking.
   *
   * @param requestId - The request ID containing the Task invocations
   * @param responseBody - The response body to scan for Task tool usage
   * @param _domain - The domain (currently unused but kept for API compatibility)
   */
  async processTaskToolInvocations(
    requestId: string,
    responseBody: ClaudeMessagesResponse | Record<string, unknown>,
    _domain: string
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

      // Mark the request as having task invocations in the database
      await this.writer.storeTaskToolInvocations(uuid, taskInvocations)

      // Task invocations are now tracked in the database
      // Linking will happen when new conversations are stored via SQL query
    }
  }

  /**
   * Validates whether a string is a properly formatted UUID v4.
   *
   * @param str - The string to validate
   * @returns true if the string is a valid UUID, false otherwise
   */
  private isValidUUID(str: string): boolean {
    return UUID_REGEX.test(str)
  }

  /**
   * Schedules the next cleanup cycle for the request ID map.
   *
   * Uses recursive setTimeout to avoid issues with long-running timers.
   * Cleanup runs at intervals defined by STORAGE_ADAPTER_CLEANUP_MS environment variable.
   *
   * @private
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
    }, this.cleanupIntervalMs)
  }

  /**
   * Removes expired entries from the request ID mapping cache.
   *
   * Entries older than the retention time (default 1 hour) are removed to prevent
   * unbounded memory growth. Logs performance metrics and warnings if cleanup
   * takes longer than expected.
   *
   * @private
   */
  private cleanupOrphanedEntries(): void {
    const startTime = Date.now()
    const now = startTime
    let cleanedCount = 0
    const initialSize = this.requestIdMap.size

    try {
      for (const [requestId, mapping] of this.requestIdMap.entries()) {
        if (now - mapping.timestamp > this.retentionTimeMs) {
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
          retentionTimeMs: this.retentionTimeMs,
          cleanupIntervalMs: this.cleanupIntervalMs,
        },
      })

      // Warn if cleanup is taking too long
      if (durationMs > REQUEST_ID_CLEANUP.PERFORMANCE_WARNING_THRESHOLD_MS) {
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
   * Loads recent Task tool invocations from the database for sub-task detection.
   *
   * This method is called by ConversationLinker via the subtaskQueryExecutor to find
   * Task invocations that might have spawned the current request as a sub-task.
   * Uses optimized queries when a specific prompt is provided.
   *
   * @param domain - The domain to search in
   * @param timestamp - The reference timestamp for the search window
   * @param debugMode - Whether to log debug information
   * @param subtaskPrompt - Optional prompt to filter by (enables optimized query)
   * @returns Array of task invocations or undefined if none found
   * @private
   */
  private async loadTaskInvocations(
    domain: string,
    timestamp: Date,
    debugMode?: boolean,
    subtaskPrompt?: string
  ): Promise<TaskInvocation[] | undefined> {
    // Query for Task tool invocations within the query window before this timestamp
    const timeWindowStart = new Date(
      timestamp.getTime() - STORAGE_TIME_WINDOWS.QUERY_WINDOW_HOURS * 60 * 60 * 1000
    )

    // Use optimized query with @> operator when prompt is provided
    let query: string
    let params: (string | Date)[]

    if (subtaskPrompt) {
      // Optimized query using @> containment operator for exact prompt matching
      query = `
        SELECT 
          r.request_id,
          r.response_body,
          r.timestamp
        FROM api_requests r
        WHERE r.domain = $1
          AND r.timestamp >= $2
          AND r.timestamp <= $3
          AND r.response_body IS NOT NULL
          AND r.response_body->'content' @> jsonb_build_array(
            jsonb_build_object(
              'type', 'tool_use',
              'name', 'Task',
              'input', jsonb_build_object('prompt', $4::text)
            )
          )
        ORDER BY r.timestamp DESC
        LIMIT ${STORAGE_QUERY_LIMITS.TASK_INVOCATIONS_WITH_PROMPT}
      `
      params = [domain, timeWindowStart, timestamp, subtaskPrompt.replace(/\\n/g, '\n')]

      if (debugMode) {
        logger.debug('Using optimized subtask query with prompt filter', {
          metadata: { prompt: subtaskPrompt.substring(0, 50) + '...' },
        })
      }
    } else {
      // Fallback to original query when no prompt is provided
      query = `
        SELECT 
          r.request_id,
          r.response_body,
          r.timestamp
        FROM api_requests r
        WHERE r.domain = $1
          AND r.timestamp >= $2
          AND r.timestamp <= $3
          AND r.response_body IS NOT NULL
          AND jsonb_path_exists(r.response_body, '$.content[*] ? (@.type == "tool_use" && @.name == "Task")')
        ORDER BY r.timestamp DESC
        LIMIT ${STORAGE_QUERY_LIMITS.TASK_INVOCATIONS_WITHOUT_PROMPT}
      `
      params = [domain, timeWindowStart, timestamp]
    }

    try {
      const result = await this.pool.query(query, params)
      const recentInvocations: TaskInvocation[] = []

      if (debugMode && result.rows.length > 0) {
        logger.debug(
          `Found ${result.rows.length} requests with Task invocations in ${STORAGE_TIME_WINDOWS.QUERY_WINDOW_HOURS}-hour window`
        )
      }

      // Extract Task tool invocations from each response
      for (const row of result.rows) {
        if (row.response_body?.content) {
          for (const content of row.response_body.content) {
            if (content.type === 'tool_use' && content.name === 'Task' && content.input?.prompt) {
              // If we're filtering by prompt, the database already ensured it matches
              // Otherwise, include all Task invocations
              recentInvocations.push({
                requestId: row.request_id,
                toolUseId: content.id,
                prompt: content.input.prompt,
                timestamp: new Date(row.timestamp),
              })
            }
          }
        }
      }

      // Filter to only recent invocations within the match window
      const recentCutoff = new Date(
        timestamp.getTime() - STORAGE_TIME_WINDOWS.MATCH_WINDOW_HOURS * 60 * 60 * 1000
      )
      const filteredInvocations = recentInvocations.filter(
        inv => inv.timestamp >= recentCutoff && inv.timestamp <= timestamp
      )

      if (debugMode && filteredInvocations.length > 0) {
        logger.debug(
          `Found ${filteredInvocations.length} Task invocations within ${STORAGE_TIME_WINDOWS.MATCH_WINDOW_HOURS}h window`
        )
      }

      return filteredInvocations.length > 0 ? filteredInvocations : undefined
    } catch (error) {
      logger.warn(`Failed to load task invocations for domain ${domain}:`, {
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      return undefined
    }
  }

  /**
   * Gracefully closes the storage adapter and releases resources.
   *
   * This method stops the cleanup timer, clears the request ID map,
   * and closes the underlying writer connection. Always call this method
   * when shutting down to prevent resource leaks.
   *
   * @example
   * ```typescript
   * // In shutdown handler
   * await storageAdapter.close();
   * ```
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

    // Close the writer
    await this.writer.cleanup()
  }
}
