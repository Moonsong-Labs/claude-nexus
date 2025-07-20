import { describe, it, expect, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { domainExtractorMiddleware } from '../src/middleware/domain-extractor'

// Type definitions for response bodies
type SuccessResponse = {
  domain: string
}

type ErrorResponse = {
  error: {
    code: string
    message: string
  }
}

type DomainExtractorResponse = SuccessResponse | ErrorResponse

// Test data constants
const INVALID_HOST_HEADERS = [
  'example.com/path',
  'example.com;injection',
  'example.com<script>',
  'example.com>redirect',
  'example.com@attacker.com',
  'example.com#fragment',
]

const IPV4_TEST_CASES = [
  { host: '192.168.1.1:3000', expected: '192.168.1.1:3000' },
  { host: '10.0.0.1:8080', expected: '10.0.0.1:8080' },
  { host: '192.168.1.1', expected: '192.168.1.1' },
]

const IPV6_TEST_CASES = [
  { host: '[::1]:3000', expected: '[::1]:3000', description: 'localhost IPv6 with port' },
  { host: '[::1]', expected: '[::1]', description: 'localhost IPv6 without port' },
  {
    host: '[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:8080',
    expected: '[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:8080',
    description: 'full IPv6 with port',
  },
  { host: '[2001:db8::1]', expected: '[2001:db8::1]', description: 'compressed IPv6 without port' },
  { host: '::1', expected: '::1', description: 'compressed localhost IPv6' },
  {
    host: '2001:db8::1:8080',
    expected: '2001:db8::1:8080',
    description: 'IPv6 without brackets with port',
  },
]

const DOMAIN_PATTERNS_TEST_CASES = [
  { host: 'claude-1.msldev.io', expected: 'claude-1.msldev.io' },
  { host: 'claude-prod.kaki.dev', expected: 'claude-prod.kaki.dev' },
  { host: 'team-review.example.org', expected: 'team-review.example.org' },
  { host: 'api.staging.example.com', expected: 'api.staging.example.com' },
  { host: 'www.example.com', expected: 'www.example.com' },
  { host: 'deep.nested.subdomain.example.com', expected: 'deep.nested.subdomain.example.com' },
  { host: 'single-char-x.domain.io:8080', expected: 'single-char-x.domain.io' },
]

// Helper function to make requests and parse responses
async function makeRequest(
  app: Hono,
  hostHeader: string | undefined
): Promise<{ res: Response; body: DomainExtractorResponse }> {
  const res = await app.request('/test', {
    headers: hostHeader ? { host: hostHeader } : {},
  })
  const body = (await res.json()) as DomainExtractorResponse
  return { res, body }
}

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
    it('should strip port from domain without subdomain', async () => {
      const { body } = await makeRequest(app, 'example.com:8080')
      expect((body as SuccessResponse).domain).toBe('example.com')
    })

    it('should strip port from domains with subdomains', async () => {
      const { body } = await makeRequest(app, 'api.example.com:3000')
      expect((body as SuccessResponse).domain).toBe('api.example.com')
    })

    it('should preserve full domain without port', async () => {
      const { body } = await makeRequest(app, 'claude-reviews.msldev.io')
      expect((body as SuccessResponse).domain).toBe('claude-reviews.msldev.io')
    })

    it('should strip port from multi-level subdomain', async () => {
      const { body } = await makeRequest(app, 'team-review.msldev.io:443')
      expect((body as SuccessResponse).domain).toBe('team-review.msldev.io')
    })
  })

  describe('Localhost domains', () => {
    it('should preserve port for localhost', async () => {
      const { body } = await makeRequest(app, 'localhost:3000')
      expect((body as SuccessResponse).domain).toBe('localhost:3000')
    })

    it('should preserve port for 127.0.0.1', async () => {
      const { body } = await makeRequest(app, '127.0.0.1:8080')
      expect((body as SuccessResponse).domain).toBe('127.0.0.1:8080')
    })

    it('should handle localhost without port', async () => {
      const { body } = await makeRequest(app, 'localhost')
      expect((body as SuccessResponse).domain).toBe('localhost')
    })
  })

  describe('Error handling', () => {
    it('should return 400 when host header is missing', async () => {
      const { res, body } = await makeRequest(app, undefined)
      expect(res.status).toBe(400)
      expect((body as ErrorResponse).error.code).toBe('bad_request')
      expect((body as ErrorResponse).error.message).toBe('Host header is required')
    })

    it.each(INVALID_HOST_HEADERS)('should return 400 for invalid host header: %s', async host => {
      const { res, body } = await makeRequest(app, host)
      expect(res.status).toBe(400)
      expect((body as ErrorResponse).error.code).toBe('bad_request')
      expect((body as ErrorResponse).error.message).toBe('Invalid host header format')
    })
  })

  describe('IPv4 addresses', () => {
    it.each(IPV4_TEST_CASES)(
      'should preserve port for IPv4 address: $host',
      async ({ host, expected }) => {
        const { body } = await makeRequest(app, host)
        expect((body as SuccessResponse).domain).toBe(expected)
      }
    )
  })

  describe('IPv6 addresses', () => {
    it.each(IPV6_TEST_CASES)(
      'should preserve port for $description',
      async ({ host, expected }) => {
        const { body } = await makeRequest(app, host)
        expect((body as SuccessResponse).domain).toBe(expected)
      }
    )
  })

  describe('Various domain patterns', () => {
    it.each(DOMAIN_PATTERNS_TEST_CASES)(
      'should handle domain pattern: $host',
      async ({ host, expected }) => {
        const { body } = await makeRequest(app, host)
        expect((body as SuccessResponse).domain).toBe(expected)
      }
    )
  })
})
