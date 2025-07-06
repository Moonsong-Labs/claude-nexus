import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { PromptService } from '../PromptService.js'
import type { Pool, QueryResult } from 'pg'

// Mock Pool
const createMockPool = () => {
  const queryHistory: Array<{ query: string; params: any[] }> = []

  const mockPool = {
    query: mock(async (query: string, params?: any[]) => {
      queryHistory.push({ query, params: params || [] })

      // Mock response based on query type
      if (query.includes('SELECT') && query.includes('FROM mcp_prompts')) {
        // List prompts query
        if (query.includes('LIMIT')) {
          return {
            rows: [
              {
                id: 1,
                prompt_id: 'test-prompt',
                name: 'Test Prompt',
                description: 'Test description',
                content: 'Test content',
                arguments: [],
                metadata: {},
                github_path: 'test.yaml',
                github_sha: 'abc123',
                github_url: 'https://github.com/test',
                version: 1,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
                synced_at: new Date(),
              },
            ],
          } as QueryResult
        }
      }

      if (query.includes('WITH stats AS')) {
        // Usage stats query
        return {
          rows: [
            {
              total_uses: '10',
              unique_domains: '3',
              unique_accounts: '5',
              daily_usage: [
                { date: '2024-01-01', count: 5 },
                { date: '2024-01-02', count: 5 },
              ],
            },
          ],
        } as QueryResult
      }

      return { rows: [] } as QueryResult
    }),
  } as unknown as Pool

  return { mockPool, queryHistory }
}

describe('PromptService SQL Injection Prevention', () => {
  let promptService: PromptService
  let queryHistory: Array<{ query: string; params: any[] }>

  beforeEach(() => {
    const { mockPool, queryHistory: history } = createMockPool()
    queryHistory = history
    promptService = new PromptService(mockPool)
  })

  describe('listPrompts SQL safety', () => {
    it('should use parameterized queries for basic filtering', async () => {
      await promptService.listPrompts({
        active: true,
        limit: 10,
        offset: 0,
      })

      expect(queryHistory).toHaveLength(1)
      const { query, params } = queryHistory[0]

      // Check that query uses placeholders
      expect(query).toContain('$1')
      expect(query).toContain('$2')
      expect(query).toContain('$3')

      // Check parameters
      expect(params).toEqual([true, 10, 0])
    })

    it('should sanitize LIKE wildcards in search parameter', async () => {
      await promptService.listPrompts({
        search: 'test%_\\search',
        limit: 10,
        offset: 0,
      })

      expect(queryHistory).toHaveLength(1)
      const { params } = queryHistory[0]

      // The % and _ wildcards should be escaped
      // The search parameter is the second param after active
      expect(params[0]).toBe(true) // active param
      expect(params[1]).toBe('%test\\%\\_\\\\search%') // search param
    })

    it('should validate and constrain limit parameter', async () => {
      // Test upper bound
      await promptService.listPrompts({
        limit: 9999,
        offset: 0,
      })

      expect(queryHistory).toHaveLength(1)
      // Limit should be capped at 1000
      expect(queryHistory[0].params).toContain(1000)

      queryHistory.length = 0

      // Test lower bound
      await promptService.listPrompts({
        limit: -5,
        offset: 0,
      })

      expect(queryHistory).toHaveLength(1)
      // Limit should be at least 1
      expect(queryHistory[0].params).toContain(1)
    })

    it('should validate offset parameter', async () => {
      await promptService.listPrompts({
        limit: 10,
        offset: -100,
      })

      expect(queryHistory).toHaveLength(1)
      const { params } = queryHistory[0]

      // Offset should be at least 0
      expect(params[params.length - 1]).toBe(0)
    })

    it('should handle SQL injection attempts in search', async () => {
      const maliciousSearch = "'; DROP TABLE mcp_prompts; --"

      await promptService.listPrompts({
        search: maliciousSearch,
        limit: 10,
        offset: 0,
      })

      expect(queryHistory).toHaveLength(1)
      const { query, params } = queryHistory[0]

      // The malicious input should be in parameters, not in query
      expect(query).not.toContain('DROP TABLE')
      // The search parameter is the second param after active
      expect(params[0]).toBe(true) // active param
      // The underscore in "mcp_prompts" is escaped as expected
      expect(params[1]).toBe(`%'; DROP TABLE mcp\\_prompts; --%`) // search param with escaped _
    })

    it('should build WHERE clause safely', async () => {
      await promptService.listPrompts({
        search: 'test',
        active: false,
        limit: 20,
        offset: 10,
      })

      expect(queryHistory).toHaveLength(1)
      const { query } = queryHistory[0]

      // Check query structure
      expect(query).toContain('WHERE is_active = $1')
      expect(query).toContain('AND (name ILIKE $2 OR description ILIKE $2)')
      expect(query).toContain('LIMIT $3')
      expect(query).toContain('OFFSET $4')
    })
  })

  describe('getUsageStats SQL safety', () => {
    it('should use parameterized queries for interval calculation', async () => {
      await promptService.getUsageStats('test-prompt', 30)

      expect(queryHistory).toHaveLength(1)
      const { query, params } = queryHistory[0]

      // Should use parameterized interval multiplication
      expect(query).toContain("INTERVAL '1 day' * $2")
      expect(query).not.toContain("INTERVAL '30 days'")

      expect(params).toEqual(['test-prompt', 30])
    })

    it('should validate days parameter range', async () => {
      // Test upper bound
      await promptService.getUsageStats('test-prompt', 9999)

      expect(queryHistory).toHaveLength(1)
      // Days should be capped at 365
      expect(queryHistory[0].params[1]).toBe(365)

      queryHistory.length = 0

      // Test lower bound
      await promptService.getUsageStats('test-prompt', -10)

      expect(queryHistory).toHaveLength(1)
      // Days should be at least 1
      expect(queryHistory[0].params[1]).toBe(1)
    })

    it('should handle non-numeric days parameter', async () => {
      await promptService.getUsageStats('test-prompt', 'abc' as any)

      expect(queryHistory).toHaveLength(1)
      // Should default to 30 days
      expect(queryHistory[0].params[1]).toBe(30)
    })

    it('should prevent SQL injection in days parameter', async () => {
      const maliciousDays = '30; DROP TABLE mcp_prompt_usage; --' as any

      await promptService.getUsageStats('test-prompt', maliciousDays)

      expect(queryHistory).toHaveLength(1)
      const { query, params } = queryHistory[0]

      // The malicious input should not appear in the query
      expect(query).not.toContain('DROP TABLE')
      // Should default to 30 since the input is not a valid number
      expect(params[1]).toBe(30)
    })
  })

  describe('Query structure validation', () => {
    it('should use consistent parameter indexing', async () => {
      await promptService.listPrompts({
        search: 'test',
        active: true,
        limit: 50,
        offset: 100,
      })

      const { query } = queryHistory[0]

      // Count parameter placeholders
      const placeholders = query.match(/\$\d+/g) || []
      const uniquePlaceholders = new Set(placeholders)

      // Should have sequential placeholders
      expect(uniquePlaceholders.size).toBe(4) // $1, $2, $3, $4
    })

    it('should construct safe queries without string concatenation of user input', async () => {
      await promptService.listPrompts({
        search: "test' OR '1'='1",
        active: true,
      })

      const { query } = queryHistory[0]

      // The query structure should be static
      expect(query).toContain('SELECT')
      expect(query).toContain('FROM mcp_prompts')
      expect(query).toContain('WHERE')
      expect(query).toContain('ORDER BY name ASC')

      // User input should not be in the query string
      expect(query).not.toContain("test' OR '1'='1")
    })
  })
})
