import { describe, test, expect } from 'bun:test'
import { ProxyResponse } from '../../services/proxy/src/domain/entities/ProxyResponse'
import { ClaudeStreamEvent } from '../../services/proxy/src/types/claude'

describe('Streaming Tool Input Capture', () => {
  test('should capture tool inputs from streaming response with input_json_delta', () => {
    const response = new ProxyResponse('test-123', true)
    
    // Event 1: content_block_start with tool_use
    const event1: ClaudeStreamEvent = {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'tool-1',
        name: 'TodoWrite',
        input: {} // Initial empty input
      }
    }
    response.processStreamEvent(event1)
    
    // Event 2: content_block_delta with partial JSON
    const event2: ClaudeStreamEvent = {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"todos": [{"content": "Task 1", "status": "pending"'
      }
    }
    response.processStreamEvent(event2)
    
    // Event 3: content_block_delta with more partial JSON
    const event3: ClaudeStreamEvent = {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: ', "priority": "high", "id": "1"}]}'
      }
    }
    response.processStreamEvent(event3)
    
    // Event 4: content_block_stop
    const event4: ClaudeStreamEvent = {
      type: 'content_block_stop',
      index: 0
    }
    response.processStreamEvent(event4)
    
    // Verify tool call was captured with input
    const toolCalls = response.toolCalls
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toEqual({
      name: 'TodoWrite',
      id: 'tool-1',
      input: {
        todos: [{
          content: 'Task 1',
          status: 'pending',
          priority: 'high',
          id: '1'
        }]
      }
    })
  })
  
  test('should handle multiple tools in streaming response', () => {
    const response = new ProxyResponse('test-456', true)
    
    // First tool: Read
    response.processStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'tool-1',
        name: 'Read',
        input: {}
      }
    })
    
    response.processStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"file_path": "/home/user/project/src/index.ts"}'
      }
    })
    
    response.processStreamEvent({
      type: 'content_block_stop',
      index: 0
    })
    
    // Second tool: Bash
    response.processStreamEvent({
      type: 'content_block_start',
      index: 1,
      content_block: {
        type: 'tool_use',
        id: 'tool-2',
        name: 'Bash',
        input: {}
      }
    })
    
    response.processStreamEvent({
      type: 'content_block_delta',
      index: 1,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"command": "npm run test"}'
      }
    })
    
    response.processStreamEvent({
      type: 'content_block_stop',
      index: 1
    })
    
    // Verify both tools were captured
    const toolCalls = response.toolCalls
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls[0]).toEqual({
      name: 'Read',
      id: 'tool-1',
      input: {
        file_path: '/home/user/project/src/index.ts'
      }
    })
    expect(toolCalls[1]).toEqual({
      name: 'Bash',
      id: 'tool-2',
      input: {
        command: 'npm run test'
      }
    })
  })
  
  test('should handle malformed JSON gracefully', () => {
    const response = new ProxyResponse('test-789', true)
    
    response.processStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'tool-1',
        name: 'TodoWrite',
        input: {}
      }
    })
    
    // Send malformed JSON
    response.processStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"todos": [{"content": "Task 1"'  // Missing closing brackets
      }
    })
    
    response.processStreamEvent({
      type: 'content_block_stop',
      index: 0
    })
    
    // Tool should still be captured but with original empty input
    const toolCalls = response.toolCalls
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toEqual({
      name: 'TodoWrite',
      id: 'tool-1',
      input: {}  // Falls back to original empty input
    })
  })
})