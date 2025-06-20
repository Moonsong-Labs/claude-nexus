#!/usr/bin/env bun

import { readFileSync } from 'fs'
import { join } from 'path'

// Load test data
const testDataPath = join(import.meta.dir, '../test/data/inference_streaming_with_tools_with_system_opus-1750420376296-im7ygz453.json')
const testData = JSON.parse(readFileSync(testDataPath, 'utf-8'))

// Extract the Task invocation prompt
let taskPrompt = ''
if (testData.response?.body?.content) {
  for (const content of testData.response.body.content) {
    if (content.type === 'tool_use' && content.name === 'Task') {
      taskPrompt = content.input.prompt
      console.log('Found Task invocation with prompt:')
      console.log(`"${taskPrompt.substring(0, 200)}..."`)
      break
    }
  }
}

if (!taskPrompt) {
  console.error('No Task invocation found in test data')
  process.exit(1)
}

// Send two requests to test sub-task linking
async function sendRequest(prompt: string, isFirst: boolean) {
  const url = 'http://localhost:3000/v1/messages'
  const body = {
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 50,
    // Add system messages so it's classified as "inference" and gets stored
    system: [
      { type: 'text', text: 'You are a helpful assistant.' },
      { type: 'text', text: 'Please be concise in your responses.' }
    ]
  }

  console.log(`\n${isFirst ? 'First' : 'Second'} request:`)
  console.log(`POST ${url}`)
  console.log('Body:', JSON.stringify(body, null, 2))

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-ant-PLACEHOLDER',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const responseText = await response.text()
    console.log(`Response status: ${response.status}`)
    console.log(`Response: ${responseText.substring(0, 200)}...`)

    return response.ok
  } catch (error) {
    console.error('Request failed:', error)
    return false
  }
}

// Main test
async function testSubtaskLinking() {
  console.log('Testing sub-task linking...')
  console.log('='.repeat(80))

  // First request - simulate a Task invocation
  console.log('\n1. Sending first request to simulate Task invocation...')
  const taskInvocationPrompt = 'Please help me analyze the test code'
  await sendRequest(taskInvocationPrompt, true)

  // Wait 5 seconds
  console.log('\n2. Waiting 5 seconds...')
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Second request - should be linked as sub-task
  console.log('\n3. Sending identical request (should be linked as sub-task)...')
  await sendRequest(taskInvocationPrompt, false)

  console.log('\n4. Check the database or logs to verify sub-task linking')
  console.log('   Look for:')
  console.log('   - "Extracted user content for sub-task matching" in logs')
  console.log('   - "Looking for matching Task invocation" in logs')
  console.log('   - "Found matching Task invocation for new conversation" in logs')
  console.log('   - parent_task_request_id and is_subtask fields in database')
}

// Run test
testSubtaskLinking().catch(console.error)