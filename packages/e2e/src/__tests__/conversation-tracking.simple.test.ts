import { describe, test, expect, afterAll } from 'bun:test'
import { v4 as uuidv4 } from 'uuid'
import pg from 'pg'

const { Pool } = pg

describe('E2E Proxy Tests - Simple', () => {
  const dbPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://test_user:test_pass@localhost:5433/claude_nexus_test',
  })
  const proxyUrl = process.env.PROXY_URL || 'http://localhost:3100'

  afterAll(async () => {
    await dbPool.end()
  })

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
        Host: 'test.example.com',
        Authorization: 'Bearer cnp_test_e2e_key',
      },
      body: JSON.stringify(requestBody),
    })

    expect(response.status).toBe(200)
    const responseBody = await response.json()
    expect(responseBody).toHaveProperty('id')
    expect(responseBody).toHaveProperty('content')

    // Wait for storage
    await new Promise(resolve => setTimeout(resolve, 500))

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

    expect(result.rows.length).toBe(1)
    const dbRow = result.rows[0]
    expect(dbRow.conversation_id).toBeTruthy()
    expect(dbRow.branch_id).toBe('main')
    expect(dbRow.parent_request_id).toBeNull()
    expect(dbRow.message_count).toBe(1)
  })

  test('should link messages in same conversation', async () => {
    const conversationId = uuidv4()

    // First message
    const firstRequest = {
      model: 'claude-3-sonnet-20240229',
      messages: [{ role: 'user', content: `Test conversation ${conversationId}` }],
      max_tokens: 10,
    }

    const firstResponse = await fetch(`${proxyUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'test.example.com',
        Authorization: 'Bearer cnp_test_e2e_key',
      },
      body: JSON.stringify(firstRequest),
    })

    expect(firstResponse.status).toBe(200)

    // Wait for storage
    await new Promise(resolve => setTimeout(resolve, 500))

    // Get first request details
    const firstResult = await dbPool.query(
      `SELECT request_id, conversation_id
      FROM api_requests
      WHERE domain = 'test.example.com'
      AND body->>'messages' LIKE $1
      ORDER BY timestamp DESC
      LIMIT 1`,
      [`%${conversationId}%`]
    )

    const firstDbRow = firstResult.rows[0]
    const storedConversationId = firstDbRow.conversation_id

    // Second message in conversation
    const secondRequest = {
      model: 'claude-3-sonnet-20240229',
      messages: [
        { role: 'user', content: `Test conversation ${conversationId}` },
        { role: 'assistant', content: 'This is a mock response for E2E testing.' },
        { role: 'user', content: 'Tell me more' },
      ],
      max_tokens: 10,
    }

    const secondResponse = await fetch(`${proxyUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'test.example.com',
        Authorization: 'Bearer cnp_test_e2e_key',
      },
      body: JSON.stringify(secondRequest),
    })

    expect(secondResponse.status).toBe(200)

    // Wait for storage
    await new Promise(resolve => setTimeout(resolve, 500))

    // Check second request
    const secondResult = await dbPool.query(
      `SELECT 
        request_id,
        conversation_id,
        branch_id,
        parent_request_id,
        message_count
      FROM api_requests
      WHERE domain = 'test.example.com'
      AND conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT 1`,
      [storedConversationId]
    )

    const secondDbRow = secondResult.rows[0]
    expect(secondDbRow.conversation_id).toBe(storedConversationId)
    expect(secondDbRow.branch_id).toBe('main')
    expect(secondDbRow.parent_request_id).toBe(firstDbRow.request_id)
    expect(secondDbRow.message_count).toBe(3)
  })
})
