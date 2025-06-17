#!/usr/bin/env bun

/**
 * Test script to verify token storage is working correctly
 */

const API_KEY = process.env.CLAUDE_API_KEY || 'your-api-key-here'
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3001'

async function testTokenStorage() {
  console.log('Testing token storage...')

  // Test request
  const requestBody = {
    model: 'claude-3-haiku-20240307',
    messages: [{ role: 'user', content: 'What is 2+2? Answer in one word.' }],
    max_tokens: 10,
    stream: false,
  }

  try {
    // Make request through proxy
    console.log('\nMaking request to proxy...')
    const response = await fetch(`${PROXY_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    console.log('\nResponse received:')
    console.log('- Model:', data.model)
    console.log('- Input tokens:', data.usage?.input_tokens)
    console.log('- Output tokens:', data.usage?.output_tokens)
    console.log('- Content:', data.content?.[0]?.text)

    // Wait a bit for storage to complete
    console.log('\nWaiting 2 seconds for storage to complete...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Check storage stats
    console.log('\nChecking storage stats...')
    const statsResponse = await fetch(`${DASHBOARD_URL}/api/storage-stats`)

    if (statsResponse.ok) {
      const stats = await statsResponse.json()
      console.log('Storage stats:', JSON.stringify(stats, null, 2))

      // Check if tokens were stored
      const hasTokens = stats.stats?.some(
        stat => stat.total_input_tokens > 0 || stat.total_output_tokens > 0
      )

      if (hasTokens) {
        console.log('\n✅ SUCCESS: Tokens are being stored correctly!')
      } else {
        console.log('\n❌ FAILURE: Tokens are still 0 in storage')
      }
    } else {
      console.log('Could not fetch storage stats (storage might be disabled)')
    }

    // Also check token tracker stats
    console.log('\nChecking token tracker stats...')
    const trackerResponse = await fetch(`${PROXY_URL}/token-stats`)

    if (trackerResponse.ok) {
      const trackerStats = await trackerResponse.json()
      console.log('Token tracker stats:', JSON.stringify(trackerStats, null, 2))
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Run the test
testTokenStorage()
