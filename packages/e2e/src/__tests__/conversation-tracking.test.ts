import { E2ETestRunner } from '../utils/test-runner.js'
import type { TestCase } from '../types/test-case.js'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

describe('E2E Proxy Tests - Conversation Tracking', () => {
  let runner: E2ETestRunner

  beforeAll(() => {
    const globals = (global as any).__E2E__
    if (!globals) {
      throw new Error('E2E globals not initialized. Did global setup run?')
    }

    runner = new E2ETestRunner(globals.dbPool, globals.proxyUrl)
  })

  describe('Basic conversation tracking', () => {
    test('should create new conversation for first message', async () => {
      const testCase: TestCase = {
        description: 'Single message creates new conversation',
        requests: [
          {
            domain: 'test.example.com',
            body: {
              model: 'claude-3-sonnet-20240229',
              messages: [{ role: 'user', content: 'Hello, Claude!' }],
              max_tokens: 10,
            },
            expectDatabase: {
              conversationId: '$new',
              branchId: '$main',
              parentRequestId: '$null',
              currentMessageHash: '$any',
              parentMessageHash: '$null',
              messageCount: 1,
            },
          },
        ],
      }

      await runner.runTestCase(testCase)
    })

    test('should link messages in same conversation', async () => {
      const testCase: TestCase = {
        description: 'Multiple messages form a conversation',
        requests: [
          {
            domain: 'test.example.com',
            body: {
              model: 'claude-3-sonnet-20240229',
              messages: [{ role: 'user', content: 'What is TypeScript?' }],
              max_tokens: 10,
            },
            expectDatabase: {
              conversationId: '$new',
              branchId: '$main',
              parentRequestId: '$null',
              messageCount: 1,
            },
          },
          {
            domain: 'test.example.com',
            body: {
              model: 'claude-3-sonnet-20240229',
              messages: [
                { role: 'user', content: 'What is TypeScript?' },
                { role: 'assistant', content: 'TypeScript is a programming language.' },
                { role: 'user', content: 'Tell me more' },
              ],
              max_tokens: 10,
            },
            expectDatabase: {
              conversationId: '$same',
              branchId: '$main',
              parentRequestId: '$previous',
              messageCount: 3,
            },
          },
        ],
      }

      await runner.runTestCase(testCase)
    })

    test('should create branch when resuming from earlier point', async () => {
      const testCase: TestCase = {
        description: 'Branching conversation',
        variables: {
          conv_id: 'uuid',
        },
        requests: [
          {
            domain: 'test.example.com',
            body: {
              model: 'claude-3-sonnet-20240229',
              messages: [{ role: 'user', content: 'What is the weather?' }],
              max_tokens: 10,
            },
            expectDatabase: {
              conversationId: '$conv_id',
              branchId: '$main',
            },
          },
          {
            domain: 'test.example.com',
            body: {
              model: 'claude-3-sonnet-20240229',
              messages: [
                { role: 'user', content: 'What is the weather?' },
                { role: 'assistant', content: 'I can help with weather information.' },
                { role: 'user', content: 'Show me forecast for NYC' },
              ],
              max_tokens: 10,
            },
            expectDatabase: {
              conversationId: '$same',
              branchId: '$main',
            },
          },
          {
            domain: 'test.example.com',
            body: {
              model: 'claude-3-sonnet-20240229',
              messages: [
                { role: 'user', content: 'What is the weather?' },
                { role: 'assistant', content: 'I can help with weather information.' },
                { role: 'user', content: 'Show me forecast for London' }, // Different continuation
              ],
              max_tokens: 10,
            },
            expectDatabase: {
              conversationId: '$same',
              branchId: '$branch_*', // Should create a branch
            },
          },
        ],
      }

      await runner.runTestCase(testCase)
    })
  })

  describe('JSON fixture tests', () => {
    test('should run all fixture test cases', async () => {
      const fixturesDir = join(process.cwd(), 'src', 'fixtures')

      let files: string[]
      try {
        files = await readdir(fixturesDir)
      } catch (_error) {
        console.log('No fixtures directory found, skipping fixture tests')
        return
      }

      const jsonFiles = files.filter(f => f.endsWith('.json'))

      for (const file of jsonFiles) {
        const filePath = join(fixturesDir, file)
        const content = await readFile(filePath, 'utf-8')
        const testCase = JSON.parse(content) as TestCase

        if (testCase.skipReason) {
          console.log(`Skipping ${file}: ${testCase.skipReason}`)
          continue
        }

        console.log(`Running fixture: ${file} - ${testCase.description}`)
        await runner.runTestCase(testCase)
      }
    })
  })
})
