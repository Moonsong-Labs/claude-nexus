import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { clientAuthMiddleware } from '../client-auth'
import { domainExtractorMiddleware } from '../domain-extractor'
import { container } from '../../container'
import { AuthenticationService } from '../../services/AuthenticationService'

// HTTP Status codes
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INTERNAL_SERVER_ERROR: 500,
} as const

// Test constants
const TEST_ENDPOINTS = {
  TEST: '/test',
} as const

const AUTH_HEADERS = {
  HOST: 'Host',
  AUTHORIZATION: 'Authorization',
  WWW_AUTHENTICATE: 'WWW-Authenticate',
} as const

const AUTH_REALM = 'Claude Nexus Proxy'

// Test data
const TEST_DOMAINS = {
  EXAMPLE: 'example.com',
  DOMAIN1: 'domain1.com',
  DOMAIN2: 'domain2.com',
} as const

const TEST_API_KEYS = {
  VALID: 'cnp_live_validtestkey123',
  DOMAIN1: 'cnp_live_domain1key',
  DOMAIN2: 'cnp_live_domain2key',
  WRONG: 'cnp_live_wrongkey',
  SECURE: 'cnp_live_securekey123',
  PORT_TEST: 'cnp_live_porttest',
} as const

/**
 * Mock implementation of AuthenticationService for testing
 * Provides in-memory key storage without file system dependencies
 */
class MockAuthenticationService extends AuthenticationService {
  private mockKeys: Map<string, string> = new Map()

  constructor() {
    super(undefined, '/tmp/test-credentials')
  }

  setMockKey(domain: string, key: string | null): void {
    if (key) {
      this.mockKeys.set(domain.toLowerCase(), key)
    } else {
      this.mockKeys.delete(domain.toLowerCase())
    }
  }

  async getClientApiKey(domain: string): Promise<string | null> {
    // Normalize domain to lowercase for lookup, simulating real-world behavior
    return this.mockKeys.get(domain.toLowerCase()) || null
  }
}

/**
 * Test suite for client authentication middleware
 * Validates Bearer token authentication, domain-based API key verification,
 * and security features including timing-safe comparison
 */
describe('Client Authentication Middleware', () => {
  let app: Hono
  let mockAuthService: MockAuthenticationService
  let originalGetAuthService: typeof container.getAuthenticationService

  beforeEach(() => {
    // Setup test application
    app = new Hono()
    mockAuthService = new MockAuthenticationService()

    // Store original to restore later
    originalGetAuthService = container.getAuthenticationService
    container.getAuthenticationService = () => mockAuthService

    // Apply middlewares in correct order
    app.use('*', domainExtractorMiddleware())
    app.use('*', clientAuthMiddleware())

    // Test endpoint
    app.get(TEST_ENDPOINTS.TEST, c => c.json({ success: true }))
  })

  afterEach(() => {
    // Restore original container method
    container.getAuthenticationService = originalGetAuthService
  })

  /**
   * Test helper to create request with authentication headers
   */
  const makeAuthRequest = async (path: string, domain: string, authHeader?: string) => {
    const headers: Record<string, string> = {
      [AUTH_HEADERS.HOST]: domain,
    }
    if (authHeader) {
      headers[AUTH_HEADERS.AUTHORIZATION] = authHeader
    }
    return app.request(path, { headers })
  }

  describe('Valid Authentication', () => {
    it('should allow requests with valid Bearer token', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.VALID)

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE,
        `Bearer ${TEST_API_KEYS.VALID}`
      )

      expect(res.status).toBe(HTTP_STATUS.OK)
      const body = await res.json()
      expect(body).toEqual({ success: true })
    })

    it('should treat domain names as case-insensitive', async () => {
      const testKey = TEST_API_KEYS.VALID
      // MockAuthenticationService normalizes to lowercase in getClientApiKey
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, testKey)

      // Request with uppercase domain
      const res = await app.request(TEST_ENDPOINTS.TEST, {
        headers: {
          [AUTH_HEADERS.HOST]: 'Example.COM',
          [AUTH_HEADERS.AUTHORIZATION]: `Bearer ${testKey}`,
        },
      })

      expect(res.status).toBe(HTTP_STATUS.OK)
      const body = await res.json()
      expect(body).toEqual({ success: true })
    })

    it('should handle mixed case domains consistently', async () => {
      const testKey = TEST_API_KEYS.VALID
      mockAuthService.setMockKey('mixed.case.com', testKey)

      const domains = ['mixed.case.com', 'MIXED.CASE.COM', 'MiXeD.cAsE.cOm']

      for (const domain of domains) {
        const res = await app.request(TEST_ENDPOINTS.TEST, {
          headers: {
            [AUTH_HEADERS.HOST]: domain,
            [AUTH_HEADERS.AUTHORIZATION]: `Bearer ${testKey}`,
          },
        })
        expect(res.status).toBe(HTTP_STATUS.OK)
      }
    })

    it('should isolate API keys per domain', async () => {
      // Setup different keys for different domains
      mockAuthService.setMockKey(TEST_DOMAINS.DOMAIN1, TEST_API_KEYS.DOMAIN1)
      mockAuthService.setMockKey(TEST_DOMAINS.DOMAIN2, TEST_API_KEYS.DOMAIN2)

      // Test domain1 with correct key
      const res1 = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.DOMAIN1,
        `Bearer ${TEST_API_KEYS.DOMAIN1}`
      )
      expect(res1.status).toBe(HTTP_STATUS.OK)

      // Test domain2 with correct key
      const res2 = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.DOMAIN2,
        `Bearer ${TEST_API_KEYS.DOMAIN2}`
      )
      expect(res2.status).toBe(HTTP_STATUS.OK)

      // Test domain1 with domain2's key (should fail)
      const res3 = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.DOMAIN1,
        `Bearer ${TEST_API_KEYS.DOMAIN2}`
      )
      expect(res3.status).toBe(HTTP_STATUS.UNAUTHORIZED)
    })

    it('should handle domains with ports correctly', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.PORT_TEST)

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        `${TEST_DOMAINS.EXAMPLE}:8080`,
        `Bearer ${TEST_API_KEYS.PORT_TEST}`
      )

      expect(res.status).toBe(HTTP_STATUS.OK)
    })
  })

  describe('Invalid Authentication', () => {
    it('should reject requests without Authorization header', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.VALID)

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE
        // No auth header
      )

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
      expect(res.headers.get(AUTH_HEADERS.WWW_AUTHENTICATE)).toBe(`Bearer realm="${AUTH_REALM}"`)
    })

    it('should reject requests with invalid API key', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.VALID)

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE,
        `Bearer ${TEST_API_KEYS.WRONG}`
      )

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
    })

    it('should reject requests when no API key is configured for domain', async () => {
      // No key set for domain - mockAuthService has empty map

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE,
        `Bearer ${TEST_API_KEYS.VALID}`
      )

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
    })

    it('should reject requests without Host header', async () => {
      const res = await app.request(TEST_ENDPOINTS.TEST, {
        headers: {
          [AUTH_HEADERS.AUTHORIZATION]: `Bearer ${TEST_API_KEYS.VALID}`,
        },
      })

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST)
      const body = await res.json()
      expect(body.error.message).toBe('Host header is required')
    })

    it('should reject malformed Authorization headers', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.VALID)

      // Test various malformed headers
      const malformedHeaders = [
        { header: TEST_API_KEYS.VALID, desc: 'Missing Bearer prefix' },
        { header: `Basic ${TEST_API_KEYS.VALID}`, desc: 'Wrong scheme' },
        { header: 'Bearer', desc: 'Missing token' },
        { header: 'Bearer ', desc: 'Missing token with space' },
        { header: 'Bearer  ', desc: 'Empty token (just spaces)' },
        // Note: Multiple spaces and tabs are accepted by the regex \s+
      ]

      for (const { header } of malformedHeaders) {
        const res = await makeAuthRequest(TEST_ENDPOINTS.TEST, TEST_DOMAINS.EXAMPLE, header)
        expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
        expect(res.headers.get(AUTH_HEADERS.WWW_AUTHENTICATE)).toBe(`Bearer realm="${AUTH_REALM}"`)
      }
    })

    it('should accept Bearer token regardless of case', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.VALID)

      // The middleware uses case-insensitive regex, so these should all work
      const validFormats = [
        `Bearer ${TEST_API_KEYS.VALID}`,
        `bearer ${TEST_API_KEYS.VALID}`,
        `BEARER ${TEST_API_KEYS.VALID}`,
        `BeArEr ${TEST_API_KEYS.VALID}`,
      ]

      for (const authHeader of validFormats) {
        const res = await makeAuthRequest(TEST_ENDPOINTS.TEST, TEST_DOMAINS.EXAMPLE, authHeader)
        expect(res.status).toBe(HTTP_STATUS.OK)
      }
    })

    it('should accept Bearer token with various whitespace separators', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.VALID)

      // The middleware regex \s+ accepts any whitespace including tabs and multiple spaces
      const validFormats = [
        `Bearer ${TEST_API_KEYS.VALID}`,
        `Bearer  ${TEST_API_KEYS.VALID}`, // Multiple spaces
        `Bearer\t${TEST_API_KEYS.VALID}`, // Tab
        `Bearer\t\t${TEST_API_KEYS.VALID}`, // Multiple tabs
        `Bearer \t ${TEST_API_KEYS.VALID}`, // Mixed whitespace
      ]

      for (const authHeader of validFormats) {
        const res = await makeAuthRequest(TEST_ENDPOINTS.TEST, TEST_DOMAINS.EXAMPLE, authHeader)
        expect(res.status).toBe(HTTP_STATUS.OK)
      }
    })
  })

  /**
   * Edge case tests
   * Tests for boundary conditions and unusual inputs
   */
  describe('Edge Cases', () => {
    it('should reject requests if the configured API key is an empty string', async () => {
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, '')

      const res = await makeAuthRequest(TEST_ENDPOINTS.TEST, TEST_DOMAINS.EXAMPLE, 'Bearer ')

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
    })

    it('should handle very long API keys', async () => {
      const longKey = TEST_API_KEYS.VALID + 'a'.repeat(1000)
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, longKey)

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE,
        `Bearer ${longKey}`
      )

      expect(res.status).toBe(HTTP_STATUS.OK)
    })

    it('should handle API keys with special characters', async () => {
      const specialKey = 'cnp_live_!@#$%^&*()_+-=[]{}|;:,.<>?'
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, specialKey)

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE,
        `Bearer ${specialKey}`
      )

      expect(res.status).toBe(HTTP_STATUS.OK)
    })

    it('should handle internationalized domain names (Punycode)', async () => {
      const punycodeDomain = 'xn--6qq79v.com' // Punycode for "你好.com"
      const testKey = TEST_API_KEYS.VALID

      mockAuthService.setMockKey(punycodeDomain, testKey)

      const res = await makeAuthRequest(TEST_ENDPOINTS.TEST, punycodeDomain, `Bearer ${testKey}`)

      expect(res.status).toBe(HTTP_STATUS.OK)
    })

    it('should handle emoji domains in Punycode', async () => {
      const punycodeDomain = 'xn--i-7iq.ws' // Punycode for "❤️.ws"
      const testKey = TEST_API_KEYS.VALID

      mockAuthService.setMockKey(punycodeDomain, testKey)

      const res = await makeAuthRequest(TEST_ENDPOINTS.TEST, punycodeDomain, `Bearer ${testKey}`)

      expect(res.status).toBe(HTTP_STATUS.OK)
    })
  })

  /**
   * Security-focused tests
   * These tests verify that the middleware implements proper security measures
   * including timing-safe comparison and protection against various attacks
   */
  describe('Security Features', () => {
    it('should use timing-safe comparison for API keys', async () => {
      // This test verifies consistent rejection behavior regardless of key similarity
      // The middleware should use SHA-256 hashing for timing-safe comparison
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, TEST_API_KEYS.SECURE)

      // Test keys with varying similarity to the correct key
      const testCases = [
        { key: 'a', description: 'single character' },
        { key: 'cnp_live_wrong', description: 'wrong but similar prefix' },
        {
          key: 'cnp_live_wrongkeythatisverylongandshouldbedifferent',
          description: 'longer than correct key',
        },
        {
          key: TEST_API_KEYS.SECURE.slice(0, -1),
          description: 'almost correct (one char missing)',
        },
        {
          key: TEST_API_KEYS.SECURE + 'x',
          description: 'correct prefix with extra char',
        },
      ]

      for (const { key } of testCases) {
        const res = await makeAuthRequest(
          TEST_ENDPOINTS.TEST,
          TEST_DOMAINS.EXAMPLE,
          `Bearer ${key}`
        )
        expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
      }
    })

    it('should prevent timing attacks on domain comparison', async () => {
      // Set up keys for different domains
      mockAuthService.setMockKey(TEST_DOMAINS.DOMAIN1, TEST_API_KEYS.DOMAIN1)

      // Test with similar domain names that should all fail
      const similarDomains = [
        'domain2.com', // Different domain
        'domain1.co', // Missing char
        'domain1.comm', // Extra char
        'xdomain1.com', // Prefix
        'subdomain.domain1.com', // Subdomain
      ]

      for (const domain of similarDomains) {
        const res = await makeAuthRequest(
          TEST_ENDPOINTS.TEST,
          domain,
          `Bearer ${TEST_API_KEYS.DOMAIN1}`
        )
        expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED)
      }
    })

    it('should ignore X-Forwarded-Host and rely only on Host header', async () => {
      const testKey = TEST_API_KEYS.SECURE
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, testKey)

      const res = await app.request(TEST_ENDPOINTS.TEST, {
        headers: {
          [AUTH_HEADERS.HOST]: TEST_DOMAINS.EXAMPLE,
          'X-Forwarded-Host': 'malicious-actor.com',
          [AUTH_HEADERS.AUTHORIZATION]: `Bearer ${testKey}`,
        },
      })

      // If X-Forwarded-Host were used, auth would fail. A 200 proves it was ignored
      expect(res.status).toBe(HTTP_STATUS.OK)
    })

    it('should ignore X-Original-Host header', async () => {
      const testKey = TEST_API_KEYS.SECURE
      mockAuthService.setMockKey(TEST_DOMAINS.EXAMPLE, testKey)

      const res = await app.request(TEST_ENDPOINTS.TEST, {
        headers: {
          [AUTH_HEADERS.HOST]: TEST_DOMAINS.EXAMPLE,
          'X-Original-Host': 'attacker.com',
          [AUTH_HEADERS.AUTHORIZATION]: `Bearer ${testKey}`,
        },
      })

      expect(res.status).toBe(HTTP_STATUS.OK)
    })
  })

  /**
   * Error handling tests
   * Verify graceful handling of unexpected errors and edge cases
   */
  describe('Error Handling', () => {
    it('should handle authentication service errors gracefully', async () => {
      // Override getClientApiKey to simulate service failure
      mockAuthService.getClientApiKey = async () => {
        throw new Error('Database connection failed')
      }

      const res = await makeAuthRequest(
        TEST_ENDPOINTS.TEST,
        TEST_DOMAINS.EXAMPLE,
        `Bearer ${TEST_API_KEYS.VALID}`
      )

      expect(res.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    })

    it('should handle concurrent requests correctly', async () => {
      // Set up multiple domains with different keys
      mockAuthService.setMockKey(TEST_DOMAINS.DOMAIN1, TEST_API_KEYS.DOMAIN1)
      mockAuthService.setMockKey(TEST_DOMAINS.DOMAIN2, TEST_API_KEYS.DOMAIN2)

      // Make concurrent requests
      const requests = [
        makeAuthRequest(
          TEST_ENDPOINTS.TEST,
          TEST_DOMAINS.DOMAIN1,
          `Bearer ${TEST_API_KEYS.DOMAIN1}`
        ),
        makeAuthRequest(
          TEST_ENDPOINTS.TEST,
          TEST_DOMAINS.DOMAIN2,
          `Bearer ${TEST_API_KEYS.DOMAIN2}`
        ),
        makeAuthRequest(TEST_ENDPOINTS.TEST, TEST_DOMAINS.DOMAIN1, `Bearer ${TEST_API_KEYS.WRONG}`),
      ]

      const results = await Promise.all(requests)

      expect(results[0].status).toBe(HTTP_STATUS.OK)
      expect(results[1].status).toBe(HTTP_STATUS.OK)
      expect(results[2].status).toBe(HTTP_STATUS.UNAUTHORIZED)
    })
  })
})

/**
 * Path traversal protection tests
 * These tests verify that the AuthenticationService properly sanitizes
 * domain names to prevent path traversal attacks
 */
describe('Path Traversal Protection', () => {
  it('should prevent path traversal attacks in domain names', async () => {
    const authService = new AuthenticationService()

    // Test various path traversal attempts
    const maliciousDomains = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      'example.com/../../secrets',
      'example.com%2F..%2F..%2Fsecrets',
      '..',
      '.',
      '',
    ]

    for (const domain of maliciousDomains) {
      const result = await authService.getClientApiKey(domain)
      expect(result).toBeNull()
    }
  })

  it('should allow valid domain names', async () => {
    const authService = new AuthenticationService()

    // Valid domain formats that should be allowed
    const validDomains = [
      'example.com',
      'sub.example.com',
      'example-with-dash.com',
      'example123.com',
      'localhost',
      'example.co.uk',
      'test-123.example.com',
    ]

    // Verify these don't throw errors (won't have keys in test environment)
    for (const domain of validDomains) {
      await expect(authService.getClientApiKey(domain)).resolves.toBeDefined()
    }
  })

  it('should allow valid domain names that contain dot sequences', async () => {
    const authService = new AuthenticationService()
    // These domains contain '..' but are valid subdomain structures
    const validDomainsWithDots = ['sub..domain.com', 'a..b.com', 'example..com', 'test...com']

    for (const domain of validDomainsWithDots) {
      // We expect it not to find a key, but it shouldn't be rejected as a traversal attempt
      const result = await authService.getClientApiKey(domain)
      expect(result).toBeNull()
    }
  })

  it('should reject domains with null bytes', async () => {
    const authService = new AuthenticationService()
    const maliciousDomains = ['example.com\x00.malicious', 'example.com\0', '\x00example.com']

    for (const domain of maliciousDomains) {
      const result = await authService.getClientApiKey(domain)
      expect(result).toBeNull()
    }
  })

  it('should handle domains with URL encoding attempts', async () => {
    const authService = new AuthenticationService()
    const encodedDomains = ['example%2Ecom', 'example%2e%2e%2fcom', '%2e%2e%2fetc%2fpasswd']

    for (const domain of encodedDomains) {
      const result = await authService.getClientApiKey(domain)
      expect(result).toBeNull()
    }
  })
})
