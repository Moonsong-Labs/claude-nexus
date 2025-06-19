#!/usr/bin/env node

/**
 * Test script to verify error propagation from Claude API through the proxy
 */

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
const API_KEY = process.env.API_KEY || 'test-key'

async function testErrorCase(description, requestBody, expectedInResponse) {
  console.log(`\n🧪 Testing: ${description}`)

  try {
    const response = await fetch(`${PROXY_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    let responseJson

    try {
      responseJson = JSON.parse(responseText)
    } catch (e) {
      console.error('❌ Failed to parse response as JSON:', responseText)
      return false
    }

    console.log(`📊 Status: ${response.status}`)
    console.log(`📋 Response:`, JSON.stringify(responseJson, null, 2))

    // Check if expected content is in response
    const responseStr = JSON.stringify(responseJson)
    const hasExpected = expectedInResponse.every(expected =>
      responseStr.toLowerCase().includes(expected.toLowerCase())
    )

    if (hasExpected) {
      console.log('✅ Error properly propagated')
      return true
    } else {
      console.log('❌ Expected content not found in response')
      console.log('   Expected:', expectedInResponse)
      return false
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message)
    return false
  }
}

async function runTests() {
  console.log('🚀 Starting error propagation tests...')
  console.log(`📍 Proxy URL: ${PROXY_URL}`)

  const tests = [
    {
      description: 'Invalid request format - missing messages',
      request: {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 100,
      },
      expected: ['validation', 'messages'],
    },
    {
      description: 'Invalid model name',
      request: {
        model: 'invalid-model-xyz',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      },
      expected: ['invalid', 'model'],
    },
    {
      description: 'Empty messages array',
      request: {
        model: 'claude-3-sonnet-20240229',
        messages: [],
        max_tokens: 100,
      },
      expected: ['messages', 'empty'],
    },
    {
      description: 'Invalid message role',
      request: {
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'invalid', content: 'Hello' }],
        max_tokens: 100,
      },
      expected: ['role', 'invalid'],
    },
    {
      description: 'Max tokens too high',
      request: {
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1000000,
      },
      expected: ['max_tokens', 'too', 'high'],
    },
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    const result = await testErrorCase(test.description, test.request, test.expected)
    if (result) {
      passed++
    } else {
      failed++
    }

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n📊 Test Results:')
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📈 Total: ${tests.length}`)

  if (failed === 0) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log('\n⚠️  Some tests failed. Check the error propagation implementation.')
  }
}

// Run tests
runTests().catch(console.error)
