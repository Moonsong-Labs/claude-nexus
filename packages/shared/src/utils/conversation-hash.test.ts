import { describe, it, expect } from 'bun:test'
import { hashMessage, extractMessageHashes } from './conversation-hash'
import type { ClaudeMessage } from '../types/claude'

describe('conversation-hash', () => {
  describe('hashMessage with duplicate handling', () => {
    it('should deduplicate tool_use items with the same ID', () => {
      const messageWithDuplicates: ClaudeMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01ABC',
            name: 'Task',
            input: { prompt: 'Do something' }
          },
          {
            type: 'tool_use',
            id: 'toolu_01ABC', // Duplicate ID
            name: 'Task',
            input: { prompt: 'Do something' }
          },
          {
            type: 'tool_use',
            id: 'toolu_02XYZ',
            name: 'Another',
            input: { data: 'test' }
          }
        ]
      }

      const messageWithoutDuplicates: ClaudeMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01ABC',
            name: 'Task',
            input: { prompt: 'Do something' }
          },
          {
            type: 'tool_use',
            id: 'toolu_02XYZ',
            name: 'Another',
            input: { data: 'test' }
          }
        ]
      }

      // Both should produce the same hash
      const hash1 = hashMessage(messageWithDuplicates)
      const hash2 = hashMessage(messageWithoutDuplicates)
      
      expect(hash1).toBe(hash2)
    })

    it('should deduplicate tool_result items with the same tool_use_id', () => {
      const messageWithDuplicates: ClaudeMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01ABC',
            content: 'Result 1'
          },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01ABC', // Duplicate tool_use_id
            content: 'Result 2'
          },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_02XYZ',
            content: 'Another result'
          }
        ]
      }

      const messageWithoutDuplicates: ClaudeMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01ABC',
            content: 'Result 1'
          },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_02XYZ',
            content: 'Another result'
          }
        ]
      }

      // Both should produce the same hash
      const hash1 = hashMessage(messageWithDuplicates)
      const hash2 = hashMessage(messageWithoutDuplicates)
      
      expect(hash1).toBe(hash2)
    })

    it('should handle mixed content with duplicates correctly', () => {
      const messageWithDuplicates: ClaudeMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'tool_use',
            id: 'toolu_01UEqF2pLX6enA7LDCaXr8No',
            name: 'Task',
            input: { prompt: 'Search for something' }
          },
          {
            type: 'tool_use',
            id: 'toolu_01UEqF2pLX6enA7LDCaXr8No', // Duplicate
            name: 'Task',
            input: { prompt: 'Search for something' }
          },
          { type: 'text', text: 'More text' },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01UEqF2pLX6enA7LDCaXr8No',
            content: 'Found it'
          },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01UEqF2pLX6enA7LDCaXr8No', // Duplicate
            content: 'Found it again'
          }
        ]
      }

      const messageWithoutDuplicates: ClaudeMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'tool_use',
            id: 'toolu_01UEqF2pLX6enA7LDCaXr8No',
            name: 'Task',
            input: { prompt: 'Search for something' }
          },
          { type: 'text', text: 'More text' },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01UEqF2pLX6enA7LDCaXr8No',
            content: 'Found it'
          }
        ]
      }
      
      // Both should produce the same hash
      const hash1 = hashMessage(messageWithDuplicates)
      const hash2 = hashMessage(messageWithoutDuplicates)
      
      expect(hash1).toBe(hash2)
    })

    it('should produce same hash for messages with and without duplicates when duplicates are removed', () => {
      const messageWithDuplicates: ClaudeMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01ABC',
            name: 'Task',
            input: { prompt: 'Do something' }
          },
          {
            type: 'tool_use',
            id: 'toolu_01ABC', // Duplicate
            name: 'Task',
            input: { prompt: 'Do something' }
          }
        ]
      }

      const messageWithoutDuplicates: ClaudeMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01ABC',
            name: 'Task',
            input: { prompt: 'Do something' }
          }
        ]
      }

      const hash1 = hashMessage(messageWithDuplicates)
      const hash2 = hashMessage(messageWithoutDuplicates)

      expect(hash1).toBe(hash2)
    })
  })

  describe('extractMessageHashes with duplicate handling', () => {
    it('should handle conversation with duplicate tool messages correctly', () => {
      const messages: ClaudeMessage[] = [
        {
          role: 'user',
          content: 'Hello'
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01UEqF2pLX6enA7LDCaXr8No',
              name: 'Task',
              input: { prompt: 'Search' }
            },
            {
              type: 'tool_use',
              id: 'toolu_01UEqF2pLX6enA7LDCaXr8No', // Duplicate
              name: 'Task',
              input: { prompt: 'Search' }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_01UEqF2pLX6enA7LDCaXr8No',
              content: 'Result'
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_01UEqF2pLX6enA7LDCaXr8No', // Duplicate
              content: 'Result'
            },
            { type: 'text', text: 'Continue' }
          ]
        }
      ]

      const { currentMessageHash, parentMessageHash } = extractMessageHashes(messages)

      // Should produce valid hashes
      expect(currentMessageHash).toBeTruthy()
      expect(currentMessageHash).toHaveLength(64) // SHA-256 hex length
      expect(parentMessageHash).toBeTruthy()
      expect(parentMessageHash).toHaveLength(64)
    })
  })
})