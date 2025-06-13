#!/usr/bin/env node

// Test script to debug token tracking
// Usage: DEBUG=true node test-token-tracking.js

const API_KEY = process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_PROXY_API_KEY;
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000';

if (!API_KEY) {
  console.error('Please set CLAUDE_API_KEY or CLAUDE_CODE_PROXY_API_KEY environment variable');
  process.exit(1);
}

async function testNonStreaming() {
  console.log('=== Testing Non-Streaming Request ===\n');
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      messages: [
        {
          role: 'user',
          content: 'Say "Hello" in exactly 5 words.'
        }
      ],
      max_tokens: 20,
      stream: false
    })
  });
  
  const data = await response.json();
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(data, null, 2));
  
  if (data.usage) {
    console.log('\nToken usage found:');
    console.log('- Keys:', Object.keys(data.usage));
    console.log('- Values:', data.usage);
  } else {
    console.log('\nNo usage object found in response');
  }
}

async function testStreaming() {
  console.log('\n\n=== Testing Streaming Request ===\n');
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      messages: [
        {
          role: 'user',
          content: 'Count from 1 to 5.'
        }
      ],
      max_tokens: 50,
      stream: true
    })
  });
  
  console.log('Response status:', response.status);
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let foundUsage = false;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.usage) {
              console.log('\nFound usage in stream:');
              console.log('- Keys:', Object.keys(parsed.usage));
              console.log('- Values:', parsed.usage);
              console.log('- Full event:', JSON.stringify(parsed, null, 2));
              foundUsage = true;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }
  
  if (!foundUsage) {
    console.log('\nNo usage data found in stream');
  }
}

async function checkTokenStats() {
  console.log('\n\n=== Checking Token Stats ===\n');
  
  const response = await fetch(`${PROXY_URL}/token-stats`);
  const stats = await response.json();
  console.log('Token stats:', JSON.stringify(stats, null, 2));
}

async function main() {
  try {
    await testNonStreaming();
    await testStreaming();
    
    // Wait a bit for stats to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await checkTokenStats();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main();