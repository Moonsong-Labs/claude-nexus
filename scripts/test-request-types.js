#!/usr/bin/env bun

// Test script to verify request type detection
// Usage: DEBUG=true node test-request-types.js

const API_KEY = process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_PROXY_API_KEY;
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000';

if (!API_KEY) {
  console.error('Please set CLAUDE_API_KEY or CLAUDE_CODE_PROXY_API_KEY environment variable');
  process.exit(1);
}

async function testQueryEvaluation() {
  console.log('=== Testing Query Evaluation (1 system message) ===\n');
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      system: 'You are a helpful assistant that responds concisely.',
      messages: [
        {
          role: 'user',
          content: 'What is 2+2?'
        }
      ],
      max_tokens: 20,
      stream: false
    })
  });
  
  const data = await response.json();
  console.log('Response:', data.content?.[0]?.text || 'No response');
}

async function testInferenceMultipleSystemArray() {
  console.log('\n\n=== Testing Inference (multiple system messages in array) ===\n');
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      system: [
        { type: 'text', text: 'You are a helpful assistant.' },
        { type: 'text', text: 'Always respond in a friendly tone.' },
        { type: 'text', text: 'Keep your responses brief.' }
      ],
      messages: [
        {
          role: 'user',
          content: 'Hello!'
        }
      ],
      max_tokens: 50,
      stream: false
    })
  });
  
  const data = await response.json();
  console.log('Response:', data.content?.[0]?.text || 'No response');
}

async function testInferenceSystemInMessages() {
  console.log('\n\n=== Testing Inference (system messages in messages array) ===\n');
  
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
          role: 'system',
          content: 'You are a calculator assistant.'
        },
        {
          role: 'system',
          content: 'Show your work step by step.'
        },
        {
          role: 'user',
          content: 'Calculate 15 * 8'
        }
      ],
      max_tokens: 100,
      stream: false
    })
  });
  
  const data = await response.json();
  console.log('Response:', data.content?.[0]?.text || 'No response');
}

async function testToolCalls() {
  console.log('\n\n=== Testing Tool Calls ===\n');
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      system: 'You have access to tools. Use them when appropriate.',
      messages: [
        {
          role: 'user',
          content: 'What is the weather in San Francisco and New York?'
        }
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          input_schema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA'
              }
            },
            required: ['location']
          }
        }
      ],
      max_tokens: 200,
      stream: false
    })
  });
  
  const data = await response.json();
  const toolCalls = data.content?.filter(item => item.type === 'tool_use') || [];
  console.log('Tool calls made:', toolCalls.length);
  toolCalls.forEach((tool, i) => {
    console.log(`  ${i + 1}. ${tool.name} - ${JSON.stringify(tool.input)}`);
  });
}

async function checkStats() {
  console.log('\n\n=== Final Token Stats ===\n');
  
  const response = await fetch(`${PROXY_URL}/token-stats`);
  const stats = await response.json();
  
  if (stats.stats && Object.keys(stats.stats).length > 0) {
    for (const [domain, data] of Object.entries(stats.stats)) {
      console.log(`Domain: ${domain}`);
      console.log(`  Total Requests: ${data.requestCount}`);
      console.log(`  Query Evaluations: ${data.queryEvaluationCount || 0}`);
      console.log(`  Inference Requests: ${data.inferenceCount || 0}`);
      console.log(`  Tool Calls: ${data.toolCallCount || 0}`);
      console.log(`  Input Tokens: ${data.inputTokens}`);
      console.log(`  Output Tokens: ${data.outputTokens}`);
      console.log('');
    }
  }
}

async function main() {
  try {
    await testQueryEvaluation();
    await testInferenceMultipleSystemArray();
    await testInferenceSystemInMessages();
    await testToolCalls();
    
    // Wait a bit for stats to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await checkStats();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main();