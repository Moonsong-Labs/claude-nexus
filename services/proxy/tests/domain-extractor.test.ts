import { describe, it, expect, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { domainExtractorMiddleware } from '../src/middleware/domain-extractor'

describe('Domain Extractor Middleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.use('*', domainExtractorMiddleware())

    // Test endpoint that returns the extracted domain
    app.get('/test', c => {
      const domain = c.get('domain')
      return c.json({ domain })
    })
  })

  describe('Regular domains', () => {
    it('should keep domain without subdomain as is', async () => {
      const res = await app.request('/test', {
        headers: {
          host: 'example.com:8080',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('example.com')
    })

    it('should remove port from domains with subdomains', async () => {
      const res = await app.request('/test', {
        headers: {
          host: 'api.example.com:3000',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('api.example.com')
    })

    it('should keep full domain claude-reviews.msldev.io', async () => {
      const res = await app.request('/test', {
        headers: {
          host: 'claude-reviews.msldev.io',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('claude-reviews.msldev.io')
    })

    it('should remove port from team-review.msldev.io', async () => {
      const res = await app.request('/test', {
        headers: {
          host: 'team-review.msldev.io:443',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('team-review.msldev.io')
    })
  })

  describe('Localhost domains', () => {
    it('should preserve port for localhost', async () => {
      const res = await app.request('/test', {
        headers: {
          host: 'localhost:3000',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('localhost:3000')
    })

    it('should preserve port for 127.0.0.1', async () => {
      const res = await app.request('/test', {
        headers: {
          host: '127.0.0.1:8080',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('127.0.0.1:8080')
    })

    it('should handle localhost without port', async () => {
      const res = await app.request('/test', {
        headers: {
          host: 'localhost',
        },
      })

      const body = await res.json()
      expect(body.domain).toBe('localhost')
    })
  })

  describe('Error handling', () => {
    it('should return 400 when host header is missing', async () => {
      const res = await app.request('/test', {
        headers: {},
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('bad_request')
      expect(body.error.message).toBe('Host header is required')
    })
  })

  describe('IP addresses', () => {
    it('should preserve port for IP addresses', async () => {
      const testCases = [
        { host: '192.168.1.1:3000', expected: '192.168.1.1:3000' },
        { host: '10.0.0.1:8080', expected: '10.0.0.1:8080' },
        { host: '192.168.1.1', expected: '192.168.1.1' },
      ]

      for (const { host, expected } of testCases) {
        const res = await app.request('/test', {
          headers: { host },
        })

        const body = await res.json()
        expect(body.domain).toBe(expected)
      }
    })
  })

  describe('Various domain patterns', () => {
    it('should keep full domain without port', async () => {
      const testCases = [
        { host: 'claude-1.msldev.io', expected: 'claude-1.msldev.io' },
        { host: 'claude-prod.kaki.dev', expected: 'claude-prod.kaki.dev' },
        { host: 'team-review.example.org', expected: 'team-review.example.org' },
        { host: 'api.staging.example.com', expected: 'api.staging.example.com' },
        { host: 'www.example.com', expected: 'www.example.com' },
        {
          host: 'deep.nested.subdomain.example.com',
          expected: 'deep.nested.subdomain.example.com',
        },
        { host: 'single-char-x.domain.io:8080', expected: 'single-char-x.domain.io' },
      ]

      for (const { host, expected } of testCases) {
        const res = await app.request('/test', {
          headers: { host },
        })

        const body = await res.json()
        expect(body.domain).toBe(expected)
      }
    })
  })
})
