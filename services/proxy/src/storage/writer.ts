import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'

interface StorageRequest {
  requestId: string
  domain: string
  timestamp: Date
  method: string
  path: string
  headers: Record<string, string>
  body: any
  apiKey: string
  model: string
  requestType?: string
  currentMessageHash?: string
  parentMessageHash?: string | null
  conversationId?: string
  branchId?: string
}

interface StorageResponse {
  requestId: string
  statusCode: number
  headers: Record<string, string>
  body?: any
  streaming: boolean
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  usageData?: any
  firstTokenMs?: number
  durationMs: number
  error?: string
  toolCallCount?: number
}

interface StreamingChunk {
  requestId: string
  chunkIndex: number
  timestamp: Date
  data: string
  tokenCount?: number
}

/**
 * Storage writer service for persisting requests to the database
 * Write-only operations for the proxy service
 */
export class StorageWriter {
  private batchQueue: any[] = []
  private batchTimer?: NodeJS.Timeout
  private readonly BATCH_SIZE = 100
  private readonly BATCH_INTERVAL = 1000 // 1 second

  constructor(private pool: Pool) {
    this.startBatchProcessor()
  }

  /**
   * Store a request (write-only)
   */
  async storeRequest(request: StorageRequest): Promise<void> {
    try {
      // Remove sensitive headers
      const sanitizedHeaders = { ...request.headers }
      delete sanitizedHeaders['authorization']
      delete sanitizedHeaders['x-api-key']

      // Detect if this is a branch in the conversation
      let branchId = request.branchId || 'main'
      if (request.conversationId && request.parentMessageHash) {
        const detectedBranch = await this.detectBranch(
          request.conversationId,
          request.parentMessageHash
        )
        if (detectedBranch) {
          branchId = detectedBranch
        }
      }

      const query = `
        INSERT INTO api_requests (
          request_id, domain, timestamp, method, path, headers, body, 
          api_key_hash, model, request_type, current_message_hash, 
          parent_message_hash, conversation_id, branch_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (request_id) DO NOTHING
      `

      const values = [
        request.requestId,
        request.domain,
        request.timestamp,
        request.method,
        request.path,
        JSON.stringify(sanitizedHeaders),
        JSON.stringify(request.body),
        this.hashApiKey(request.apiKey),
        request.model,
        request.requestType,
        request.currentMessageHash || null,
        request.parentMessageHash || null,
        request.conversationId || null,
        branchId,
      ]

      await this.pool.query(query, values)
    } catch (error) {
      logger.error('Failed to store request', {
        requestId: request.requestId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Store a response (write-only)
   */
  async storeResponse(response: StorageResponse): Promise<void> {
    try {
      const query = `
        UPDATE api_requests SET
          response_status = $2,
          response_headers = $3,
          response_body = $4,
          response_streaming = $5,
          input_tokens = $6,
          output_tokens = $7,
          total_tokens = $8,
          first_token_ms = $9,
          duration_ms = $10,
          error = $11,
          tool_call_count = $12,
          cache_creation_input_tokens = $13,
          cache_read_input_tokens = $14,
          usage_data = $15
        WHERE request_id = $1
      `

      const values = [
        response.requestId,
        response.statusCode,
        JSON.stringify(response.headers),
        response.body ? JSON.stringify(response.body) : null,
        response.streaming,
        response.inputTokens || 0,
        response.outputTokens || 0,
        response.totalTokens || 0,
        response.firstTokenMs,
        response.durationMs,
        response.error,
        response.toolCallCount || 0,
        response.cacheCreationInputTokens || 0,
        response.cacheReadInputTokens || 0,
        response.usageData ? JSON.stringify(response.usageData) : null,
      ]

      await this.pool.query(query, values)
    } catch (error) {
      logger.error('Failed to store response', {
        requestId: response.requestId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Store streaming chunks (batch operation)
   */
  async storeStreamingChunk(chunk: StreamingChunk): Promise<void> {
    this.batchQueue.push(chunk)

    if (this.batchQueue.length >= this.BATCH_SIZE) {
      await this.flushBatch()
    }
  }

  /**
   * Start batch processor for streaming chunks
   */
  private startBatchProcessor(): void {
    this.batchTimer = setInterval(async () => {
      if (this.batchQueue.length > 0) {
        await this.flushBatch()
      }
    }, this.BATCH_INTERVAL)
  }

  /**
   * Flush batch of streaming chunks
   */
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return
    }

    const chunks = [...this.batchQueue]
    this.batchQueue = []

    try {
      const values = chunks.map(chunk => [
        chunk.requestId,
        chunk.chunkIndex,
        chunk.timestamp,
        chunk.data,
        chunk.tokenCount || 0,
      ])

      // Use COPY for bulk insert
      const query = `
        INSERT INTO streaming_chunks (
          request_id, chunk_index, timestamp, data, token_count
        ) VALUES ${values
          .map(
            (_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
          )
          .join(', ')}
        ON CONFLICT DO NOTHING
      `

      await this.pool.query(query, values.flat())
    } catch (error) {
      logger.error('Failed to store streaming chunks batch', {
        metadata: {
          count: chunks.length,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Find conversation ID by parent message hash
   */
  async findConversationByParentHash(parentHash: string): Promise<string | null> {
    try {
      const query = `
        SELECT conversation_id 
        FROM api_requests 
        WHERE current_message_hash = $1 
        AND conversation_id IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      `

      const result = await this.pool.query(query, [parentHash])
      return result.rows[0]?.conversation_id || null
    } catch (error) {
      logger.error('Failed to find conversation by parent hash', {
        metadata: {
          parentHash,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      return null
    }
  }

  /**
   * Detect if this is a branch in an existing conversation
   * Returns the branch ID if this is a new branch, null otherwise
   */
  private async detectBranch(
    conversationId: string,
    parentMessageHash: string
  ): Promise<string | null> {
    try {
      // Check if there's already a request with this parent hash in this conversation
      const result = await this.pool.query(
        `SELECT COUNT(*) as count, MAX(branch_id) as latest_branch 
         FROM api_requests 
         WHERE conversation_id = $1 
         AND parent_message_hash = $2`,
        [conversationId, parentMessageHash]
      )

      const { count, latest_branch } = result.rows[0]

      // If there's already a message with this parent, we're creating a new branch
      if (parseInt(count) > 0) {
        // Generate new branch ID based on timestamp
        return `branch_${Date.now()}`
      }

      // If this is the first message with this parent, use the existing branch
      return latest_branch || 'main'
    } catch (error) {
      logger.error('Error detecting branch', {
        metadata: {
          conversationId,
          parentMessageHash,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      return 'main'
    }
  }

  /**
   * Hash API key for storage
   */
  private hashApiKey(apiKey: string): string {
    // Simple hash for privacy (in production, use proper crypto)
    return apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4)
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
    }
    await this.flushBatch()
  }
}

/**
 * Initialize database schema
 */
export async function initializeDatabase(pool: Pool): Promise<void> {
  try {
    // Check if tables exist
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'api_requests'
      )
    `)

    if (!result.rows[0].exists) {
      logger.info('Database tables not found, creating schema...')

      // Create tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_requests (
          request_id UUID PRIMARY KEY,
          domain VARCHAR(255) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          method VARCHAR(10) NOT NULL,
          path VARCHAR(255) NOT NULL,
          headers JSONB,
          body JSONB,
          api_key_hash VARCHAR(50),
          model VARCHAR(100),
          request_type VARCHAR(50),
          response_status INTEGER,
          response_headers JSONB,
          response_body JSONB,
          response_streaming BOOLEAN DEFAULT false,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cache_creation_input_tokens INTEGER DEFAULT 0,
          cache_read_input_tokens INTEGER DEFAULT 0,
          usage_data JSONB,
          first_token_ms INTEGER,
          duration_ms INTEGER,
          error TEXT,
          tool_call_count INTEGER DEFAULT 0,
          current_message_hash CHAR(64),
          parent_message_hash CHAR(64),
          conversation_id UUID,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `)

      await pool.query(`
        CREATE TABLE IF NOT EXISTS streaming_chunks (
          id SERIAL PRIMARY KEY,
          request_id UUID NOT NULL,
          chunk_index INTEGER NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          data TEXT NOT NULL,
          token_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          FOREIGN KEY (request_id) REFERENCES api_requests(request_id) ON DELETE CASCADE,
          UNIQUE(request_id, chunk_index)
        )
      `)

      // Create indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_requests_domain_timestamp 
        ON api_requests(domain, timestamp DESC)
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp 
        ON api_requests(timestamp DESC)
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_streaming_chunks_request_id 
        ON streaming_chunks(request_id, chunk_index)
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_current_message_hash 
        ON api_requests(current_message_hash)
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_parent_message_hash 
        ON api_requests(parent_message_hash)
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_conversation_id 
        ON api_requests(conversation_id)
      `)

      logger.info('Database schema created successfully')
    }
  } catch (error) {
    logger.error('Failed to initialize database', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }
}
