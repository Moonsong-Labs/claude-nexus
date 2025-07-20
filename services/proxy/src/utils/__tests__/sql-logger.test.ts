import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { Pool } from 'pg'
import { enableSqlLogging } from '../sql-logger.js'

// Create mock logger
const mockLogger = {
  debug: mock(),
  info: mock(),
  warn: mock(),
  error: mock(),
}

// Mock the logger module
import { logger } from '../../middleware/logger.js'
Object.assign(logger, mockLogger)

describe('SQL Logger', () => {
  let mockPool: Pool
  let mockQuery: ReturnType<typeof mock>

  beforeEach(() => {
    // Reset mocks
    mockLogger.debug.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()

    // Create a mock pool with a query method
    mockQuery = mock()
    mockPool = {
      query: mockQuery,
    } as unknown as Pool
  })

  describe('enableSqlLogging', () => {
    test('returns original pool when logging is disabled', () => {
      process.env.DEBUG = 'false'
      process.env.DEBUG_SQL = 'false'

      const wrappedPool = enableSqlLogging(mockPool, { logQueries: false })
      expect(wrappedPool).toBe(mockPool)
    })

    test('returns wrapped pool when DEBUG is enabled', () => {
      process.env.DEBUG = 'true'

      const wrappedPool = enableSqlLogging(mockPool)
      expect(wrappedPool).not.toBe(mockPool)
      expect(wrappedPool.query).toBeDefined()
      expect(wrappedPool.query).not.toBe(mockPool.query)
    })

    test('returns wrapped pool when DEBUG_SQL is enabled', () => {
      process.env.DEBUG = 'false'
      process.env.DEBUG_SQL = 'true'

      const wrappedPool = enableSqlLogging(mockPool)
      expect(wrappedPool).not.toBe(mockPool)
    })
  })

  describe('query logging', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true'
    })

    test('logs simple query with text and values', async () => {
      const mockResult = { rows: [], rowCount: 0 }
      mockQuery.mockResolvedValue(mockResult)

      const wrappedPool = enableSqlLogging(mockPool)
      const result = await wrappedPool.query('SELECT * FROM users WHERE id = $1', [123])

      expect(result).toBe(mockResult)
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123])

      // Check debug logs
      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          query: 'SELECT * FROM users WHERE id = $1',
          values: [123],
        }),
      })

      expect(logger.debug).toHaveBeenCalledWith('SQL Query completed', {
        metadata: expect.objectContaining({
          query: 'SELECT * FROM users WHERE id = $1',
          rowCount: 0,
        }),
      })
    })

    test('logs query with config object', async () => {
      const mockResult = { rows: [], rowCount: 1 }
      mockQuery.mockResolvedValue(mockResult)

      const wrappedPool = enableSqlLogging(mockPool)
      const result = await wrappedPool.query({
        text: 'INSERT INTO users (name) VALUES ($1)',
        values: ['John'],
      })

      expect(result).toBe(mockResult)
      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          query: 'INSERT INTO users (name) VALUES ($1)',
          values: ['John'],
        }),
      })
    })

    test('logs slow queries', async () => {
      const mockResult = { rows: [], rowCount: 0 }

      // Mock a slow query by delaying the promise
      mockQuery.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(mockResult), 100)
        })
      })

      const wrappedPool = enableSqlLogging(mockPool, {
        slowQueryThreshold: 50,
      })

      await wrappedPool.query('SELECT * FROM large_table')

      expect(logger.warn).toHaveBeenCalledWith('Slow SQL query detected', {
        metadata: expect.objectContaining({
          query: 'SELECT * FROM large_table',
          duration: expect.any(Number),
        }),
      })
    })

    test('logs query errors', async () => {
      const error = new Error('Connection failed')
      mockQuery.mockRejectedValue(error)

      const wrappedPool = enableSqlLogging(mockPool)

      await expect(wrappedPool.query('SELECT * FROM users')).rejects.toThrow('Connection failed')

      expect(logger.error).toHaveBeenCalledWith('SQL Query failed', {
        metadata: expect.objectContaining({
          query: 'SELECT * FROM users',
          error: 'Connection failed',
        }),
      })
    })
  })

  describe('value redaction', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true'
    })

    test('redacts API keys', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const wrappedPool = enableSqlLogging(mockPool)
      await wrappedPool.query('INSERT INTO keys (key) VALUES ($1)', ['sk-ant-api123'])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<REDACTED>'],
        }),
      })
    })

    test('redacts Bearer tokens', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const wrappedPool = enableSqlLogging(mockPool)
      await wrappedPool.query('SELECT * FROM auth WHERE token = $1', ['Bearer abc123'])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<REDACTED>'],
        }),
      })
    })

    test('redacts cnp_live_ keys', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const wrappedPool = enableSqlLogging(mockPool)
      await wrappedPool.query('INSERT INTO keys (key) VALUES ($1)', ['cnp_live_12345'])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<REDACTED>'],
        }),
      })
    })

    test('redacts database URLs', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const wrappedPool = enableSqlLogging(mockPool)
      await wrappedPool.query('UPDATE config SET url = $1', ['postgresql://user:pass@localhost/db'])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<DATABASE_URL>'],
        }),
      })
    })

    test('redacts emails when enabled', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const wrappedPool = enableSqlLogging(mockPool, {
        redaction: { redactEmail: true },
      })
      await wrappedPool.query('SELECT * FROM users WHERE email = $1', ['user@example.com'])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<EMAIL>'],
        }),
      })
    })

    test('does not redact emails when disabled', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const wrappedPool = enableSqlLogging(mockPool, {
        redaction: { redactEmail: false },
      })
      await wrappedPool.query('SELECT * FROM users WHERE email = $1', ['user@example.com'])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['user@example.com'],
        }),
      })
    })

    test('converts dates to ISO strings', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const date = new Date('2024-01-01T00:00:00Z')
      const wrappedPool = enableSqlLogging(mockPool)
      await wrappedPool.query('SELECT * FROM events WHERE date = $1', [date])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['2024-01-01T00:00:00.000Z'],
        }),
      })
    })

    test('truncates long strings', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const longString = 'a'.repeat(250)
      const wrappedPool = enableSqlLogging(mockPool)
      await wrappedPool.query('INSERT INTO data (content) VALUES ($1)', [longString])

      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<String[250]>'],
        }),
      })
    })

    test('uses custom redaction function', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const customRedact = mock().mockReturnValue('<CUSTOM>')
      const wrappedPool = enableSqlLogging(mockPool, {
        redactValue: customRedact,
      })

      await wrappedPool.query('SELECT * FROM users WHERE id = $1', [123])

      expect(customRedact).toHaveBeenCalledWith(123)
      expect(logger.debug).toHaveBeenCalledWith('SQL Query', {
        metadata: expect.objectContaining({
          values: ['<CUSTOM>'],
        }),
      })
    })
  })

  describe('proxy behavior', () => {
    test('delegates non-query properties to original pool', () => {
      process.env.DEBUG = 'true'

      const mockConnect = mock()
      const mockEnd = mock()
      const extendedPool = {
        ...mockPool,
        connect: mockConnect,
        end: mockEnd,
      }

      const wrappedPool = enableSqlLogging(extendedPool as unknown as Pool)

      // Access non-query methods
      expect(wrappedPool.connect).toBe(mockConnect)
      expect(wrappedPool.end).toBe(mockEnd)
    })
  })
})
