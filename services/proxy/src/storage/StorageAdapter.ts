import { Pool } from 'pg'
import { StorageWriter } from './writer.js'
import { logger } from '../middleware/logger.js'
import { randomUUID } from 'crypto'

/**
 * Storage adapter that provides a simplified interface for MetricsService
 * Wraps the StorageWriter to handle request/response storage
 */
export class StorageAdapter {
  private writer: StorageWriter
  private requestIdMap: Map<string, string> = new Map() // Map nanoid to UUID

  constructor(pool: Pool) {
    this.writer = new StorageWriter(pool)
  }

  /**
   * Store request data
   */
  async storeRequest(data: {
    id: string
    domain: string
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
  }): Promise<void> {
    try {
      // Generate a UUID for this request and store the mapping
      const uuid = randomUUID()
      this.requestIdMap.set(data.id, uuid)

      await this.writer.storeRequest({
        requestId: uuid,
        domain: data.domain,
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
      const uuid = this.requestIdMap.get(data.request_id)
      if (!uuid) {
        logger.warn('No UUID mapping found for request ID', {
          requestId: data.request_id,
        })
        return
      }

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
      const uuid = this.requestIdMap.get(requestId)
      if (!uuid) {
        logger.warn('No UUID mapping found for request ID in storeStreamingChunk', {
          requestId,
        })
        return
      }

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
   * Close the storage adapter
   */
  async close(): Promise<void> {
    await this.writer.cleanup()
  }
}
