import { describe, it, expect, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { requestIdMiddleware } from '../request-id.js'

describe('requestIdMiddleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
  })

  describe('Basic functionality', () => {
    it('should generate a new request ID when no header is present', async () => {
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const res = await app.request('/')
      const body = await res.json()

      expect(res.headers.get('X-Request-ID')).toBeTruthy()
      expect(body.requestId).toBeTruthy()
      expect(body.requestId).toMatch(
        /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/
      )
      expect(res.headers.get('X-Request-ID')).toBe(body.requestId)
    })

    it('should use existing request ID from header', async () => {
      const existingId = 'existing-request-id'
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const res = await app.request('/', {
        headers: { 'X-Request-ID': existingId },
      })
      const body = await res.json()

      expect(res.headers.get('X-Request-ID')).toBe(existingId)
      expect(body.requestId).toBe(existingId)
    })

    it('should trim whitespace from existing request ID', async () => {
      const existingId = '  existing-request-id  '
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const res = await app.request('/', {
        headers: { 'X-Request-ID': existingId },
      })
      const body = await res.json()

      expect(res.headers.get('X-Request-ID')).toBe('existing-request-id')
      expect(body.requestId).toBe('existing-request-id')
    })

    it('should generate new ID when header contains only whitespace', async () => {
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const res = await app.request('/', {
        headers: { 'X-Request-ID': '   ' },
      })
      const body = await res.json()

      expect(res.headers.get('X-Request-ID')).toBeTruthy()
      expect(body.requestId).toBeTruthy()
      expect(body.requestId).not.toBe('   ')
      expect(body.requestId).toMatch(
        /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/
      )
    })
  })

  describe('Custom configuration', () => {
    it('should use custom header name', async () => {
      app.use('*', requestIdMiddleware({ headerName: 'X-Trace-ID' }))
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const existingId = 'custom-trace-id'
      const res = await app.request('/', {
        headers: { 'X-Trace-ID': existingId },
      })
      const body = await res.json()

      expect(res.headers.get('X-Trace-ID')).toBe(existingId)
      expect(body.requestId).toBe(existingId)
      // Should not set the default header
      expect(res.headers.get('X-Request-ID')).toBeNull()
    })

    it('should use custom generator', async () => {
      const customId = 'custom-generated-id'
      app.use(
        '*',
        requestIdMiddleware({
          generator: () => customId,
        })
      )
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const res = await app.request('/')
      const body = await res.json()

      expect(res.headers.get('X-Request-ID')).toBe(customId)
      expect(body.requestId).toBe(customId)
    })

    it('should use custom context key', async () => {
      app.use('*', requestIdMiddleware({ contextKey: 'traceId' }))
      app.get('/', c =>
        c.json({
          traceId: c.get('traceId'),
          requestId: c.get('requestId'), // Should be undefined
        })
      )

      const res = await app.request('/')
      const body = await res.json()

      expect(body.traceId).toBeTruthy()
      expect(body.requestId).toBeUndefined()
    })
  })

  describe('Validation', () => {
    it('should reject invalid request ID and generate new one', async () => {
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const invalidId = 'invalid@id#with$special%chars'
      const res = await app.request('/', {
        headers: { 'X-Request-ID': invalidId },
      })
      const body = await res.json()

      expect(body.requestId).not.toBe(invalidId)
      expect(body.requestId).toMatch(
        /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/
      )
    })

    it('should accept valid request ID matching default pattern', async () => {
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const validId = 'valid-request-123'
      const res = await app.request('/', {
        headers: { 'X-Request-ID': validId },
      })
      const body = await res.json()

      expect(body.requestId).toBe(validId)
    })

    it('should use custom validation regex', async () => {
      // Only accept UUIDs
      app.use(
        '*',
        requestIdMiddleware({
          validate: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        })
      )
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      // Valid UUID should be accepted
      const validUuid = '550e8400-e29b-41d4-a716-446655440000'
      const res1 = await app.request('/', {
        headers: { 'X-Request-ID': validUuid },
      })
      const body1 = await res1.json()
      expect(body1.requestId).toBe(validUuid)

      // Non-UUID should be rejected
      const nonUuid = 'not-a-uuid'
      const res2 = await app.request('/', {
        headers: { 'X-Request-ID': nonUuid },
      })
      const body2 = await res2.json()
      expect(body2.requestId).not.toBe(nonUuid)
    })

    it('should use custom validation function', async () => {
      // Only accept IDs starting with 'REQ-'
      app.use(
        '*',
        requestIdMiddleware({
          validate: id => id.startsWith('REQ-'),
        })
      )
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      // Valid ID should be accepted
      const validId = 'REQ-12345'
      const res1 = await app.request('/', {
        headers: { 'X-Request-ID': validId },
      })
      const body1 = await res1.json()
      expect(body1.requestId).toBe(validId)

      // Invalid ID should be rejected
      const invalidId = 'INVALID-12345'
      const res2 = await app.request('/', {
        headers: { 'X-Request-ID': invalidId },
      })
      const body2 = await res2.json()
      expect(body2.requestId).not.toBe(invalidId)
    })

    it('should reject request IDs that are too long', async () => {
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      // Create an ID that's 101 characters long (exceeds default 100 char limit)
      const tooLongId = 'a'.repeat(101)
      const res = await app.request('/', {
        headers: { 'X-Request-ID': tooLongId },
      })
      const body = await res.json()

      expect(body.requestId).not.toBe(tooLongId)
      expect(body.requestId).toMatch(
        /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/
      )
    })
  })

  describe('Edge cases', () => {
    it('should handle empty string header', async () => {
      app.use('*', requestIdMiddleware())
      app.get('/', c => c.json({ requestId: c.get('requestId') }))

      const res = await app.request('/', {
        headers: { 'X-Request-ID': '' },
      })
      const body = await res.json()

      expect(body.requestId).toBeTruthy()
      expect(body.requestId).not.toBe('')
    })

    it('should handle multiple middleware instances with different configs', async () => {
      // First middleware sets requestId
      app.use('*', requestIdMiddleware({ contextKey: 'requestId' }))
      // Second middleware sets traceId with different header
      app.use(
        '*',
        requestIdMiddleware({
          contextKey: 'traceId',
          headerName: 'X-Trace-ID',
        })
      )

      app.get('/', c =>
        c.json({
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        })
      )

      const res = await app.request('/', {
        headers: {
          'X-Request-ID': 'req-123',
          'X-Trace-ID': 'trace-456',
        },
      })
      const body = await res.json()

      expect(body.requestId).toBe('req-123')
      expect(body.traceId).toBe('trace-456')
      expect(res.headers.get('X-Request-ID')).toBe('req-123')
      expect(res.headers.get('X-Trace-ID')).toBe('trace-456')
    })
  })
})
