import { describe, test, expect } from 'bun:test'
import { v4 as uuidv4 } from 'uuid'
import pg from 'pg'

const { Pool } = pg

// Simple test that assumes services are already running
describe('E2E Proxy Tests - Manual Setup', () => {
  const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://test_user:test_pass@localhost:5433/claude_nexus_test'
  })
  const proxyUrl = process.env.PROXY_URL || 'http://localhost:3100'

  test('should create new conversation for first message', async () => {
    const requestBody = {
      model: 'claude-3-sonnet-20240229',
      messages: [{ role: 'user', content: 'Hello, Claude!' }],
      max_tokens: 10,
    }

    // Send request to proxy
    const response = await fetch(`${proxyUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'test.example.com',
        'Authorization': 'Bearer cnp_test_e2e_key',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('Response status:', response.status)
    expect(response.status).toBe(200)
    
    const responseBody = await response.json()
    console.log('Response body:', responseBody)
    expect(responseBody).toHaveProperty('id')
    expect(responseBody).toHaveProperty('content')

    // Wait for storage
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Check database
    const result = await dbPool.query(
      `SELECT 
        request_id,
        conversation_id,
        branch_id,
        parent_request_id,
        message_count
      FROM api_requests
      WHERE domain = 'test.example.com'
      ORDER BY timestamp DESC
      LIMIT 1`
    )

    console.log('Database result:', result.rows[0])
    expect(result.rows.length).toBe(1)
    const dbRow = result.rows[0]
    expect(dbRow.conversation_id).toBeTruthy()
    expect(dbRow.branch_id).toBe('main')
    expect(dbRow.parent_request_id).toBeNull()
    expect(dbRow.message_count).toBe(1)
    
    // Cleanup
    await dbPool.end()
  })
})