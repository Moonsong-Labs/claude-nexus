import { Pool } from 'pg'
import type { Context } from 'hono'

interface StorageConfig {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  ssl?: boolean
}

export interface StorageServiceInterface {
  storeRequest(c: Context, requestId: string, body: any, requestType: string, forceImmediate?: boolean): Promise<void>
  storeResponse(requestId: string, status: number, headers: Record<string, string>, body: any, streaming: boolean, duration: number, inputTokens?: number, outputTokens?: number, toolCalls?: number, error?: string): Promise<void>
  storeStreamingChunk(requestId: string, chunkIndex: number, chunkData: any): Promise<void>
  close(): Promise<void>
  getRequestsByDomain(domain: string, limit?: number): Promise<any[]>
  getRequestDetails(requestId: string): Promise<{ request: any, chunks: any[] }>
  getTokenStats(domain?: string): Promise<any[]>
}

interface ApiRequest {
  request_id: string
  timestamp: Date
  domain: string
  method: string
  path: string
  headers: Record<string, string>
  body: any
  request_type: string
  api_key_id?: string
  model?: string
  ip_address?: string
}

interface ApiResponse {
  request_id: string
  status_code: number
  headers: Record<string, string>
  body?: any
  streaming: boolean
  duration_ms: number
  input_tokens?: number
  output_tokens?: number
  tool_calls?: number
  error?: string
  completed_at: Date
}

interface StreamingChunk {
  request_id: string
  chunk_index: number
  chunk_data: any
  timestamp: Date
}

export class StorageService implements StorageServiceInterface {
  private pool: Pool
  private batchQueue: Map<string, any[]> = new Map()
  private batchTimer?: NodeJS.Timeout
  private readonly batchSize = 100
  private readonly batchInterval = 5000 // 5 seconds

  constructor(config: StorageConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      host: config.host || 'localhost',
      port: config.port || 5432,
      database: config.database || 'claude_proxy',
      user: config.user || 'postgres',
      password: config.password,
      ssl: config.ssl === undefined ? process.env.NODE_ENV === 'production' : config.ssl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    // Initialize batch processing
    this.startBatchProcessing()
  }

  private startBatchProcessing() {
    this.batchTimer = setInterval(() => {
      this.flushBatches()
    }, this.batchInterval)
  }

  private async flushBatches() {
    for (const [table, items] of this.batchQueue.entries()) {
      if (items.length === 0) continue
      
      try {
        if (table === 'api_requests') {
          await this.batchInsertRequests(items)
        } else if (table === 'streaming_chunks') {
          await this.batchInsertChunks(items)
        }
        this.batchQueue.set(table, [])
      } catch (error) {
        console.error(`Failed to flush batch for ${table}:`, error)
      }
    }
  }

  private async batchInsertRequests(requests: ApiRequest[]) {
    const values = requests.map((r, i) => {
      const offset = i * 11  // Changed from 10 to 11 to match the number of fields
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
    }).join(', ')

    const params = requests.flatMap(r => [
      r.request_id,
      r.timestamp,
      r.domain,
      r.method,
      r.path,
      JSON.stringify(r.headers),
      JSON.stringify(r.body),
      r.request_type,
      r.api_key_id,
      r.model,
      r.ip_address
    ])

    await this.pool.query(
      `INSERT INTO api_requests (request_id, timestamp, domain, method, path, headers, body, request_type, api_key_id, model, ip_address) 
       VALUES ${values}
       ON CONFLICT (request_id) DO NOTHING`,
      params
    )
  }

  private async batchInsertChunks(chunks: StreamingChunk[]) {
    const values = chunks.map((c, i) => {
      const offset = i * 4
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
    }).join(', ')

    const params = chunks.flatMap(c => [
      c.request_id,
      c.chunk_index,
      JSON.stringify(c.chunk_data),
      c.timestamp
    ])

    await this.pool.query(
      `INSERT INTO streaming_chunks (request_id, chunk_index, chunk_data, timestamp) 
       VALUES ${values}`,
      params
    )
  }

  async storeRequest(c: Context, requestId: string, body: any, requestType: string, forceImmediate = false) {
    // Extract headers from Hono context
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value
    })
    
    const request: ApiRequest = {
      request_id: requestId,
      timestamp: new Date(),
      domain: new URL(c.req.url).hostname,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      headers: headers,
      body: body,
      request_type: requestType,
      api_key_id: c.req.header('x-api-key')?.substring(0, 20), // Store partial key for identification
      model: body.model,
      ip_address: c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
    }

    // Remove sensitive headers
    delete request.headers['authorization']
    delete request.headers['x-api-key']

    // If streaming or force immediate, insert directly
    if (body.stream || forceImmediate) {
      try {
        await this.pool.query(
          `INSERT INTO api_requests (request_id, timestamp, domain, method, path, headers, body, request_type, api_key_id, model, ip_address) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (request_id) DO NOTHING`,
          [
            request.request_id,
            request.timestamp,
            request.domain,
            request.method,
            request.path,
            JSON.stringify(request.headers),
            JSON.stringify(request.body),
            request.request_type,
            request.api_key_id,
            request.model,
            request.ip_address
          ]
        )
      } catch (error) {
        console.error('Failed to store request immediately:', error)
      }
    } else {
      // Add to batch queue for non-streaming requests
      if (!this.batchQueue.has('api_requests')) {
        this.batchQueue.set('api_requests', [])
      }
      this.batchQueue.get('api_requests')!.push(request)

      // Flush if batch is full
      if (this.batchQueue.get('api_requests')!.length >= this.batchSize) {
        await this.flushBatches()
      }
    }
  }

  async storeResponse(
    requestId: string, 
    status: number, 
    headers: Record<string, string>, 
    body: any, 
    streaming: boolean,
    duration: number,
    inputTokens?: number,
    outputTokens?: number,
    toolCalls?: number,
    error?: string
  ) {
    try {
      // Update the existing request record with response data
      const result = await this.pool.query(
        `UPDATE api_requests 
         SET response_status = $2,
             response_headers = $3,
             response_body = $4,
             response_streaming = $5,
             duration_ms = $6,
             input_tokens = $7,
             output_tokens = $8,
             tool_calls = $9,
             error = $10,
             completed_at = NOW()
         WHERE request_id = $1`,
        [
          requestId,
          status,
          JSON.stringify(headers),
          JSON.stringify(body),
          streaming,
          duration,
          inputTokens,
          outputTokens,
          toolCalls,
          error
        ]
      )
      
      // If no rows were updated, log a warning
      if (result.rowCount === 0) {
        console.warn(`No request found with ID ${requestId} when storing response`)
      }
    } catch (error) {
      console.error('Failed to store response:', error)
    }
  }

  async storeStreamingChunk(requestId: string, chunkIndex: number, chunkData: any) {
    // For streaming chunks, store immediately to maintain order
    try {
      await this.pool.query(
        `INSERT INTO streaming_chunks (request_id, chunk_index, chunk_data, timestamp) 
         VALUES ($1, $2, $3, $4)`,
        [requestId, chunkIndex, JSON.stringify(chunkData), new Date()]
      )
    } catch (error) {
      // If foreign key constraint fails, it means the request hasn't been stored yet
      // This shouldn't happen with our immediate storage for streaming requests
      console.error(`Failed to store streaming chunk ${chunkIndex} for request ${requestId}:`, error)
    }
  }

  async close() {
    // Flush any remaining batches
    await this.flushBatches()
    
    // Clear the batch timer
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
    }
    
    // Close the pool
    await this.pool.end()
  }

  // Query methods for analysis
  async getRequestsByDomain(domain: string, limit = 100) {
    const query = domain 
      ? `SELECT * FROM api_requests 
         WHERE domain = $1 
         ORDER BY timestamp DESC 
         LIMIT $2`
      : `SELECT * FROM api_requests 
         ORDER BY timestamp DESC 
         LIMIT $1`
    
    const params = domain ? [domain, limit] : [limit]
    const result = await this.pool.query(query, params)
    return result.rows
  }

  async getRequestsByTimeRange(startTime: Date, endTime: Date) {
    const result = await this.pool.query(
      `SELECT * FROM api_requests 
       WHERE timestamp BETWEEN $1 AND $2 
       ORDER BY timestamp DESC`,
      [startTime, endTime]
    )
    return result.rows
  }

  async getRequestDetails(requestId: string) {
    const requestResult = await this.pool.query(
      'SELECT * FROM api_requests WHERE request_id = $1',
      [requestId]
    )
    
    const chunksResult = await this.pool.query(
      'SELECT * FROM streaming_chunks WHERE request_id = $1 ORDER BY chunk_index',
      [requestId]
    )

    return {
      request: requestResult.rows[0],
      chunks: chunksResult.rows
    }
  }

  async getTokenStats(domain?: string) {
    const query = domain
      ? `SELECT 
           request_type,
           COUNT(*) as request_count,
           SUM(input_tokens) as total_input_tokens,
           SUM(output_tokens) as total_output_tokens,
           SUM(tool_calls) as total_tool_calls,
           AVG(duration_ms) as avg_duration_ms
         FROM api_requests 
         WHERE domain = $1 AND completed_at IS NOT NULL
         GROUP BY request_type`
      : `SELECT 
           domain,
           request_type,
           COUNT(*) as request_count,
           SUM(input_tokens) as total_input_tokens,
           SUM(output_tokens) as total_output_tokens,
           SUM(tool_calls) as total_tool_calls,
           AVG(duration_ms) as avg_duration_ms
         FROM api_requests 
         WHERE completed_at IS NOT NULL
         GROUP BY domain, request_type`
    
    const params = domain ? [domain] : []
    const result = await this.pool.query(query, params)
    return result.rows
  }
}

// Initialize database schema
export async function initializeDatabase(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_requests (
      request_id UUID PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL,
      domain VARCHAR(255) NOT NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(1024) NOT NULL,
      headers JSONB NOT NULL,
      body JSONB,
      request_type VARCHAR(50),
      api_key_id VARCHAR(50),
      model VARCHAR(100),
      ip_address VARCHAR(45),
      response_status INTEGER,
      response_headers JSONB,
      response_body JSONB,
      response_streaming BOOLEAN DEFAULT false,
      duration_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      tool_calls INTEGER,
      error TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS streaming_chunks (
      id BIGSERIAL PRIMARY KEY,
      request_id UUID NOT NULL REFERENCES api_requests(request_id),
      chunk_index INTEGER NOT NULL,
      chunk_data JSONB NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp ON api_requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_api_requests_domain ON api_requests(domain);
    CREATE INDEX IF NOT EXISTS idx_api_requests_request_type ON api_requests(request_type);
    CREATE INDEX IF NOT EXISTS idx_api_requests_model ON api_requests(model);
    CREATE INDEX IF NOT EXISTS idx_streaming_chunks_request_id ON streaming_chunks(request_id);
  `)
}