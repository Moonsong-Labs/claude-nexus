import { Client } from 'pg'
import type { ApiRequest } from '../../packages/shared/src/types'

export class DatabaseClient {
  private client: Client

  constructor(connectionString: string) {
    this.client = new Client({ connectionString })
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async connectWithRetry(maxRetries: number = 30, delay: number = 1000): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.client.connect()
        // Test the connection
        await this.client.query('SELECT 1')
        console.log('Successfully connected to PostgreSQL')
        return
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(`Failed to connect to PostgreSQL after ${maxRetries} attempts: ${error}`)
        }
        console.log(`PostgreSQL connection attempt ${i + 1} failed, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.client.end()
  }

  async cleanDatabase(): Promise<void> {
    // Truncate all relevant tables with cascade to handle foreign keys
    await this.client.query(`
      TRUNCATE TABLE 
        api_requests,
        streaming_chunks
      RESTART IDENTITY CASCADE;
    `)
  }

  async getRequestById(requestId: string): Promise<ApiRequest | null> {
    const result = await this.client.query(
      'SELECT * FROM api_requests WHERE request_id = $1',
      [requestId]
    )
    return result.rows[0] || null
  }

  async getRequestsByConversationId(conversationId: string): Promise<ApiRequest[]> {
    const result = await this.client.query(
      'SELECT * FROM api_requests WHERE conversation_id = $1 ORDER BY created_at',
      [conversationId]
    )
    return result.rows
  }

  async getStreamingChunks(requestId: string): Promise<any[]> {
    const result = await this.client.query(
      'SELECT * FROM streaming_chunks WHERE api_request_id = $1 ORDER BY chunk_index',
      [requestId]
    )
    return result.rows
  }

  async countRequestsInTable(): Promise<number> {
    const result = await this.client.query('SELECT COUNT(*) FROM api_requests')
    return parseInt(result.rows[0].count, 10)
  }

  async waitForRequest(
    requestId: string,
    timeout: number = 5000
  ): Promise<ApiRequest | null> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const request = await this.getRequestById(requestId)
      if (request) {
        return request
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return null
  }

  async executeQuery(query: string, params?: any[]): Promise<any> {
    const result = await this.client.query(query, params)
    return result
  }
}