import { describe, it, expect } from 'bun:test'
import {
  // Regex patterns
  UUID_REGEX,
  BEARER_TOKEN_REGEX,
  SLUG_REGEX,
  SEMVER_REGEX,

  // Validation functions
  isValidUUID,
  isValidAnthropicApiKey,
  isValidCNPApiKey,
  isValidJWT,
  isValidEmail,
  isValidDomain,
  isValidDatabaseUrl,
  isValidBearerToken,
  isValidSlug,
  isValidContentType,
  isValidSemver,

  // Zod schemas
  uuidSchema,
  anthropicApiKeySchema,
  cnpApiKeySchema,
  jwtTokenSchema,
  emailSchema,
  domainSchema,
  databaseUrlSchema,
  paginationSchema,
  dateRangeSchema,
  conversationBranchParamsSchema,
  bearerTokenSchema,
  slugSchema,
  contentTypeSchema,
  semverSchema,

  // Sanitization functions
  maskSensitiveData,
  truncateString,

  // Type guards
  isUUID,
  isNonEmptyString,

  // Helpers
  validateRequestSize,
} from '../validation'

// Test Data Constants
const VALID_UUIDS = [
  '123e4567-e89b-12d3-a456-426614174000',
  '550e8400-e29b-41d4-a716-446655440000',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
]

const INVALID_UUIDS = [
  '123e4567-e89b-12d3-a456',
  'not-a-uuid',
  '123e456-e89b-12d3-a456-426614174000', // too few digits in first segment
  '',
  null,
  undefined,
  123,
  {},
]

const VALID_ANTHROPIC_KEYS = [
  'sk-ant-api03-abc123def456ghi789',
  'sk-ant-test-key-123456789abcdef',
  'sk-ant-prod_key_456789abcdefghi',
]

const VALID_CNP_KEYS = ['cnp_live_abc123', 'cnp_test_xyz789', 'cnp_live_production_key_123']

const VALID_JWTS = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
]

const INVALID_JWTS = [
  'not.a.jwt',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // missing parts
  'invalid-jwt-token',
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature', // with Bearer prefix
]

const VALID_EMAILS = ['test@example.com', 'user.name@domain.co.uk', 'admin+tag@company.org']

const INVALID_EMAILS = ['not-an-email', '@example.com', 'user@', 'user@.com', 'user@domain']

const VALID_DOMAINS = ['example.com', 'subdomain.example.com', 'my-domain.co.uk', 'test123.org']

const INVALID_DOMAINS = [
  'not a domain',
  'http://example.com', // URL, not domain
  '-invalid.com',
  'domain.c', // TLD too short
  'domain-.com', // ends with hyphen
]

const VALID_DATABASE_URLS = [
  'postgresql://user:pass@localhost:5432/mydb',
  'mysql://root:password@mysql.example.com/database',
  'mongodb://admin:secret@mongo.example.com/testdb',
  'mongodb+srv://user:pass@cluster.mongodb.net/mydb',
]

const VALID_BEARER_TOKENS = [
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
]

const INVALID_BEARER_TOKENS = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', // missing Bearer prefix
  'Bearer invalid-token',
  'Basic eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', // wrong prefix
  'Bearer',
  '',
]

const VALID_SLUGS = ['a-slug', 'another-long-slug-123', 'my-resource', 'api-v2']

const INVALID_SLUGS = [
  'A-Slug', // uppercase
  'a_slug', // underscore
  '-a-slug', // starts with hyphen
  'a-slug-', // ends with hyphen
  'a--slug', // double hyphen
  'a slug', // space
  'slug!', // special character
]

const VALID_CONTENT_TYPES = {
  json: ['application/json', 'application/json; charset=utf-8', 'application/json;charset=UTF-8'],
  text: ['text/plain', 'text/plain; charset=utf-8'],
  formUrlEncoded: ['application/x-www-form-urlencoded'],
  multipart: ['multipart/form-data', 'multipart/form-data; boundary=----WebKitFormBoundary'],
}

const INVALID_CONTENT_TYPES = ['invalid/content-type', 'application', 'text/', '/json', '']

const VALID_SEMVERS = [
  '1.0.0',
  '0.0.0',
  '1.2.3',
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-0.3.7',
  '1.0.0-x.7.z.92',
  '1.0.0+20130313144700',
  '1.0.0-beta+exp.sha.5114f85',
  '1.0.0+21AF26D3----117B344092BD',
]

const INVALID_SEMVERS = [
  '1.0', // missing patch
  '1.0.0.0', // too many parts
  '01.0.0', // leading zero
  '1.00.0', // leading zero
  'v1.0.0', // v prefix
  '1.0.0-', // empty pre-release
  '',
  'not-a-version',
]

describe('Validation Utilities', () => {
  describe('UUID Validation', () => {
    describe('isValidUUID()', () => {
      it.each(VALID_UUIDS)('should return true for valid UUID: %s', uuid => {
        expect(isValidUUID(uuid)).toBe(true)
      })

      it.each(INVALID_UUIDS.filter(v => typeof v === 'string'))(
        'should return false for invalid UUID: %s',
        uuid => {
          expect(isValidUUID(uuid)).toBe(false)
        }
      )
    })

    describe('UUID_REGEX', () => {
      it.each(VALID_UUIDS)('should match valid UUID: %s', uuid => {
        expect(UUID_REGEX.test(uuid)).toBe(true)
      })

      it.each(INVALID_UUIDS.filter(v => typeof v === 'string'))(
        'should not match invalid UUID: %s',
        uuid => {
          expect(UUID_REGEX.test(uuid)).toBe(false)
        }
      )
    })

    describe('uuidSchema', () => {
      it.each(VALID_UUIDS)('should parse valid UUID: %s', uuid => {
        expect(() => uuidSchema.parse(uuid)).not.toThrow()
      })

      it.each(INVALID_UUIDS)('should reject invalid input: %s', value => {
        expect(() => uuidSchema.parse(value)).toThrow()
      })

      it('should have correct error code for invalid UUID', () => {
        const result = uuidSchema.safeParse('not-a-uuid')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].code).toBe('invalid_string')
        }
      })
    })
  })

  describe('API Key Validation', () => {
    describe('Anthropic API Keys', () => {
      describe('isValidAnthropicApiKey()', () => {
        it.each(VALID_ANTHROPIC_KEYS)('should return true for valid key: %s', key => {
          expect(isValidAnthropicApiKey(key)).toBe(true)
        })

        it.each(['invalid-key', 'sk-invalid', '', 'sk-ant-'])(
          'should return false for invalid key: %s',
          key => {
            expect(isValidAnthropicApiKey(key)).toBe(false)
          }
        )
      })

      describe('anthropicApiKeySchema', () => {
        it.each(VALID_ANTHROPIC_KEYS)('should parse valid key: %s', key => {
          expect(() => anthropicApiKeySchema.parse(key)).not.toThrow()
        })

        it('should reject keys that are too short', () => {
          const result = anthropicApiKeySchema.safeParse('sk-ant-abc')
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error.issues[0].code).toBe('too_small')
          }
        })
      })
    })

    describe('CNP API Keys', () => {
      describe('isValidCNPApiKey()', () => {
        it.each(VALID_CNP_KEYS)('should return true for valid key: %s', key => {
          expect(isValidCNPApiKey(key)).toBe(true)
        })

        it.each(['cnp_invalid_key', 'cnp_staging_key', 'cnp_prod_key', ''])(
          'should return false for invalid key: %s',
          key => {
            expect(isValidCNPApiKey(key)).toBe(false)
          }
        )
      })

      describe('cnpApiKeySchema', () => {
        it.each(VALID_CNP_KEYS)('should parse valid key: %s', key => {
          expect(() => cnpApiKeySchema.parse(key)).not.toThrow()
        })

        it('should reject invalid environment prefixes', () => {
          expect(() => cnpApiKeySchema.parse('cnp_staging_key')).toThrow()
        })
      })
    })
  })

  describe('JWT Validation', () => {
    describe('isValidJWT()', () => {
      it.each(VALID_JWTS)('should return true for valid JWT', jwt => {
        expect(isValidJWT(jwt)).toBe(true)
      })

      it.each(INVALID_JWTS)('should return false for invalid JWT: %s', jwt => {
        expect(isValidJWT(jwt)).toBe(false)
      })
    })

    describe('jwtTokenSchema', () => {
      it.each(VALID_JWTS)('should parse valid JWT', jwt => {
        expect(() => jwtTokenSchema.parse(jwt)).not.toThrow()
      })

      it.each(INVALID_JWTS)('should reject invalid JWT: %s', jwt => {
        expect(() => jwtTokenSchema.parse(jwt)).toThrow()
      })
    })
  })

  describe('Email Validation', () => {
    describe('isValidEmail()', () => {
      it.each(VALID_EMAILS)('should return true for valid email: %s', email => {
        expect(isValidEmail(email)).toBe(true)
      })

      it.each(INVALID_EMAILS)('should return false for invalid email: %s', email => {
        expect(isValidEmail(email)).toBe(false)
      })

      it('should handle edge cases', () => {
        // Edge cases for email validation
        expect(isValidEmail('test@localhost')).toBe(false) // no TLD
        expect(isValidEmail('test@sub.domain.com')).toBe(true) // subdomain
        expect(isValidEmail('test.name+tag@example.com')).toBe(true) // complex local part
        expect(isValidEmail('test@domain.a')).toBe(false) // TLD too short (less than 2 chars)
        expect(isValidEmail('test@-domain.com')).toBe(true) // Note: regex allows hyphen at start of domain (known limitation)
      })
    })

    describe('emailSchema', () => {
      it.each(VALID_EMAILS)('should parse valid email: %s', email => {
        expect(() => emailSchema.parse(email)).not.toThrow()
      })

      it.each(INVALID_EMAILS)('should reject invalid email: %s', email => {
        expect(() => emailSchema.parse(email)).toThrow()
      })
    })
  })

  describe('Domain Validation', () => {
    describe('isValidDomain()', () => {
      it.each(VALID_DOMAINS)('should return true for valid domain: %s', domain => {
        expect(isValidDomain(domain)).toBe(true)
      })

      it.each(INVALID_DOMAINS)('should return false for invalid domain: %s', domain => {
        expect(isValidDomain(domain)).toBe(false)
      })
    })

    describe('domainSchema', () => {
      it.each(VALID_DOMAINS)('should parse valid domain: %s', domain => {
        expect(() => domainSchema.parse(domain)).not.toThrow()
      })

      it.each(INVALID_DOMAINS)('should reject invalid domain: %s', domain => {
        expect(() => domainSchema.parse(domain)).toThrow()
      })
    })
  })

  describe('Database URL Validation', () => {
    describe('isValidDatabaseUrl()', () => {
      it.each(VALID_DATABASE_URLS)('should return true for valid URL: %s', url => {
        expect(isValidDatabaseUrl(url)).toBe(true)
      })

      it('should validate specific database URL types', () => {
        expect(isValidDatabaseUrl('postgresql://user:pass@localhost/db', 'postgresql')).toBe(true)
        expect(isValidDatabaseUrl('mysql://user:pass@localhost/db', 'mysql')).toBe(true)
        expect(isValidDatabaseUrl('mongodb://user:pass@localhost/db', 'mongodb')).toBe(true)
        expect(isValidDatabaseUrl('postgresql://user:pass@localhost/db', 'mysql')).toBe(false)
      })

      it('should handle edge cases', () => {
        // URLs with special characters in password
        expect(isValidDatabaseUrl('postgresql://user:p@ss!word@localhost/db')).toBe(true)
        expect(isValidDatabaseUrl('mysql://user:pass%40word@localhost/db')).toBe(true)

        // Invalid URLs
        expect(isValidDatabaseUrl('http://not-a-db-url.com')).toBe(false)
        expect(isValidDatabaseUrl('postgresql://')).toBe(false)
        expect(isValidDatabaseUrl('')).toBe(false)
      })
    })

    describe('databaseUrlSchema', () => {
      it.each(VALID_DATABASE_URLS)('should parse valid URL: %s', url => {
        expect(() => databaseUrlSchema.parse(url)).not.toThrow()
      })

      it('should reject invalid database URLs', () => {
        expect(() => databaseUrlSchema.parse('http://not-a-db.com')).toThrow()
        expect(() => databaseUrlSchema.parse('invalid-url')).toThrow()
      })
    })
  })

  describe('Bearer Token Validation', () => {
    describe('isValidBearerToken()', () => {
      it.each(VALID_BEARER_TOKENS)('should return true for valid token: %s', token => {
        expect(isValidBearerToken(token)).toBe(true)
      })

      it.each(INVALID_BEARER_TOKENS)('should return false for invalid token: %s', token => {
        expect(isValidBearerToken(token)).toBe(false)
      })
    })

    describe('BEARER_TOKEN_REGEX', () => {
      it.each(VALID_BEARER_TOKENS)('should match valid token: %s', token => {
        expect(BEARER_TOKEN_REGEX.test(token)).toBe(true)
      })

      it.each(INVALID_BEARER_TOKENS)('should not match invalid token: %s', token => {
        expect(BEARER_TOKEN_REGEX.test(token)).toBe(false)
      })
    })

    describe('bearerTokenSchema', () => {
      it.each(VALID_BEARER_TOKENS)('should parse and extract token from: %s', token => {
        const result = bearerTokenSchema.parse(token)
        expect(result).not.toContain('Bearer ')
        expect(result).toMatch(/^eyJ/)
      })

      it.each(INVALID_BEARER_TOKENS)('should reject invalid token: %s', token => {
        expect(() => bearerTokenSchema.parse(token)).toThrow()
      })
    })
  })

  describe('Slug Validation', () => {
    describe('isValidSlug()', () => {
      it.each(VALID_SLUGS)('should return true for valid slug: %s', slug => {
        expect(isValidSlug(slug)).toBe(true)
      })

      it.each(INVALID_SLUGS)('should return false for invalid slug: %s', slug => {
        expect(isValidSlug(slug)).toBe(false)
      })
    })

    describe('SLUG_REGEX', () => {
      it.each(VALID_SLUGS)('should match valid slug: %s', slug => {
        expect(SLUG_REGEX.test(slug)).toBe(true)
      })

      it.each(INVALID_SLUGS)('should not match invalid slug: %s', slug => {
        expect(SLUG_REGEX.test(slug)).toBe(false)
      })
    })

    describe('slugSchema', () => {
      it.each(VALID_SLUGS)('should parse valid slug: %s', slug => {
        expect(() => slugSchema.parse(slug)).not.toThrow()
      })

      it.each(INVALID_SLUGS)('should reject invalid slug: %s', slug => {
        expect(() => slugSchema.parse(slug)).toThrow()
      })

      it('should enforce length limits', () => {
        const longSlug = 'a'.repeat(101)
        expect(() => slugSchema.parse(longSlug)).toThrow()
        expect(() => slugSchema.parse('')).toThrow()
      })
    })
  })

  describe('Content-Type Validation', () => {
    describe('isValidContentType()', () => {
      it('should validate JSON content types', () => {
        VALID_CONTENT_TYPES.json.forEach(contentType => {
          expect(isValidContentType(contentType)).toBe(true)
          expect(isValidContentType(contentType, 'json')).toBe(true)
        })
      })

      it('should validate other content types', () => {
        VALID_CONTENT_TYPES.text.forEach(ct => expect(isValidContentType(ct, 'text')).toBe(true))
        VALID_CONTENT_TYPES.formUrlEncoded.forEach(ct =>
          expect(isValidContentType(ct, 'formUrlEncoded')).toBe(true)
        )
        VALID_CONTENT_TYPES.multipart.forEach(ct =>
          expect(isValidContentType(ct, 'multipart')).toBe(true)
        )
      })

      it.each(INVALID_CONTENT_TYPES)('should return false for invalid type: %s', contentType => {
        expect(isValidContentType(contentType)).toBe(false)
      })
    })

    describe('contentTypeSchema', () => {
      it('should parse valid content types', () => {
        Object.values(VALID_CONTENT_TYPES)
          .flat()
          .forEach(contentType => {
            expect(() => contentTypeSchema.parse(contentType)).not.toThrow()
          })
      })

      it.each(INVALID_CONTENT_TYPES)('should reject invalid type: %s', contentType => {
        expect(() => contentTypeSchema.parse(contentType)).toThrow()
      })
    })
  })

  describe('Semantic Version Validation', () => {
    describe('isValidSemver()', () => {
      it.each(VALID_SEMVERS)('should return true for valid version: %s', version => {
        expect(isValidSemver(version)).toBe(true)
      })

      it.each(INVALID_SEMVERS)('should return false for invalid version: %s', version => {
        expect(isValidSemver(version)).toBe(false)
      })
    })

    describe('SEMVER_REGEX', () => {
      it.each(VALID_SEMVERS)('should match valid version: %s', version => {
        expect(SEMVER_REGEX.test(version)).toBe(true)
      })

      it.each(INVALID_SEMVERS)('should not match invalid version: %s', version => {
        expect(SEMVER_REGEX.test(version)).toBe(false)
      })
    })

    describe('semverSchema', () => {
      it.each(VALID_SEMVERS)('should parse valid version: %s', version => {
        expect(() => semverSchema.parse(version)).not.toThrow()
      })

      it.each(INVALID_SEMVERS)('should reject invalid version: %s', version => {
        expect(() => semverSchema.parse(version)).toThrow()
      })
    })
  })

  describe('Sanitization Functions', () => {
    describe('maskSensitiveData()', () => {
      it('should mask various types of sensitive data', () => {
        const input =
          'API key: sk-ant-abc123, email: test@example.com, Bearer eyJhbGc.eyJzdWI.SflKxw'
        const masked = maskSensitiveData(input)

        expect(masked).toContain('sk-ant-****')
        expect(masked).toContain('****@****.com')
        expect(masked).toContain('Bearer ****')
        expect(masked).not.toContain('sk-ant-abc123')
        expect(masked).not.toContain('test@example.com')
      })

      it('should mask database URLs', () => {
        const input = 'Database: postgresql://user:password@localhost:5432/mydb'
        const masked = maskSensitiveData(input)

        expect(masked).toContain('postgresql://****:****@****/****')
        expect(masked).not.toContain('user:password')
      })

      it('should be idempotent', () => {
        const input = 'sk-ant-secret123 and test@email.com'
        const masked1 = maskSensitiveData(input)
        const masked2 = maskSensitiveData(masked1)
        const masked3 = maskSensitiveData(masked2)

        expect(masked1).toBe(masked2)
        expect(masked2).toBe(masked3)
      })

      it('should handle multiple occurrences', () => {
        const input = 'Keys: sk-ant-key1, sk-ant-key2. Emails: user1@test.com, user2@test.com'
        const masked = maskSensitiveData(input)

        expect(masked.match(/sk-ant-\*\*\*\*/g)).toHaveLength(2)
        expect(masked.match(/\*\*\*\*@\*\*\*\*\.com/g)).toHaveLength(2)
      })
    })

    describe('truncateString()', () => {
      it('should truncate long strings', () => {
        const longString = 'a'.repeat(2000)
        const truncated = truncateString(longString, 100)

        expect(truncated).toHaveLength(103) // 100 + '...'
        expect(truncated).toEndWith('...')
      })

      it('should not truncate short strings', () => {
        const shortString = 'short string'
        const result = truncateString(shortString, 100)

        expect(result).toBe(shortString)
        expect(result).not.toContain('...')
      })

      it('should use default length when not specified', () => {
        const longString = 'a'.repeat(2000)
        const truncated = truncateString(longString)

        expect(truncated).toHaveLength(1003) // 1000 + '...'
      })
    })
  })

  describe('Type Guards', () => {
    describe('isUUID()', () => {
      it('should correctly identify valid UUIDs', () => {
        expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
        expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      })

      it('should reject invalid UUIDs', () => {
        expect(isUUID('not-a-uuid')).toBe(false)
        expect(isUUID('123e4567-e89b-12d3-a456')).toBe(false) // too short
      })

      it('should handle non-string types', () => {
        expect(isUUID(123)).toBe(false)
        expect(isUUID(null)).toBe(false)
        expect(isUUID(undefined)).toBe(false)
        expect(isUUID({})).toBe(false)
        expect(isUUID([])).toBe(false)
      })

      it('should reject near-miss UUIDs', () => {
        // Almost valid but not quite
        expect(isUUID('123e4567-e89b-12d3-a456-426614174000x')).toBe(false) // extra char
        expect(isUUID('123e4567e89b12d3a456426614174000')).toBe(false) // no hyphens
        expect(isUUID('GGGGGGGG-e89b-12d3-a456-426614174000')).toBe(false) // invalid hex
      })
    })

    describe('isNonEmptyString()', () => {
      it('should identify non-empty strings', () => {
        expect(isNonEmptyString('hello')).toBe(true)
        expect(isNonEmptyString('  hello  ')).toBe(true)
        expect(isNonEmptyString('a')).toBe(true)
      })

      it('should reject empty strings', () => {
        expect(isNonEmptyString('')).toBe(false)
        expect(isNonEmptyString('   ')).toBe(false)
        expect(isNonEmptyString('\t\n')).toBe(false)
      })

      it('should handle non-string types', () => {
        expect(isNonEmptyString(123)).toBe(false)
        expect(isNonEmptyString(0)).toBe(false)
        expect(isNonEmptyString(null)).toBe(false)
        expect(isNonEmptyString(undefined)).toBe(false)
        expect(isNonEmptyString({})).toBe(false)
        expect(isNonEmptyString([])).toBe(false)
        expect(isNonEmptyString(true)).toBe(false)
      })
    })
  })

  describe('Validation Helpers', () => {
    describe('validateRequestSize()', () => {
      const oneMB = 1024 * 1024

      it('should accept sizes within limit', () => {
        expect(validateRequestSize(5 * oneMB, 10)).toBe(true)
        expect(validateRequestSize(0, 10)).toBe(true)
        expect(validateRequestSize(1, 10)).toBe(true)
      })

      it('should reject sizes exceeding limit', () => {
        expect(validateRequestSize(15 * oneMB, 10)).toBe(false)
        expect(validateRequestSize(11 * oneMB, 10)).toBe(false)
      })

      it('should accept sizes exactly at limit', () => {
        expect(validateRequestSize(10 * oneMB, 10)).toBe(true)
      })

      it('should use default limit when not specified', () => {
        expect(validateRequestSize(5 * oneMB)).toBe(true) // default is 10MB
        expect(validateRequestSize(15 * oneMB)).toBe(false)
      })
    })
  })

  describe('Zod Schema Integration', () => {
    describe('paginationSchema', () => {
      it('should validate and apply defaults', () => {
        const valid = { page: 1, limit: 20 }
        const parsed = paginationSchema.parse(valid)

        expect(parsed.page).toBe(1)
        expect(parsed.limit).toBe(20)
        expect(parsed.sortOrder).toBe('desc')
      })

      it('should coerce string values', () => {
        const stringParams = { page: '2', limit: '50' }
        const parsed = paginationSchema.parse(stringParams)

        expect(parsed.page).toBe(2)
        expect(parsed.limit).toBe(50)
      })

      it('should apply defaults for missing fields', () => {
        const parsed = paginationSchema.parse({})

        expect(parsed.page).toBe(1)
        expect(parsed.limit).toBe(20)
        expect(parsed.sortOrder).toBe('desc')
      })

      it('should enforce maximum limit', () => {
        expect(() => paginationSchema.parse({ limit: 150 })).toThrow()
      })

      it('should reject invalid values', () => {
        expect(() => paginationSchema.parse({ page: 0 })).toThrow()
        expect(() => paginationSchema.parse({ page: -1 })).toThrow()
        expect(() => paginationSchema.parse({ limit: 0 })).toThrow()
      })
    })

    describe('dateRangeSchema', () => {
      it('should validate ISO datetime strings', () => {
        const valid = {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z',
        }

        const parsed = dateRangeSchema.parse(valid)
        expect(parsed.startDate).toBe(valid.startDate)
        expect(parsed.endDate).toBe(valid.endDate)
      })

      it('should accept optional fields', () => {
        expect(() => dateRangeSchema.parse({})).not.toThrow()
        expect(() => dateRangeSchema.parse({ startDate: '2024-01-01T00:00:00Z' })).not.toThrow()
        expect(() => dateRangeSchema.parse({ endDate: '2024-12-31T23:59:59Z' })).not.toThrow()
      })

      it('should reject invalid datetime formats', () => {
        expect(() => dateRangeSchema.parse({ startDate: '2024-01-01' })).toThrow()
        expect(() => dateRangeSchema.parse({ startDate: 'invalid-date' })).toThrow()
      })
    })

    describe('conversationBranchParamsSchema', () => {
      it('should validate conversation and branch IDs', () => {
        const valid = {
          conversationId: '123e4567-e89b-12d3-a456-426614174000',
          branchId: 'main',
        }

        const parsed = conversationBranchParamsSchema.parse(valid)
        expect(parsed.conversationId).toBe(valid.conversationId)
        expect(parsed.branchId).toBe('main')
      })

      it('should reject invalid conversation IDs', () => {
        expect(() =>
          conversationBranchParamsSchema.parse({
            conversationId: 'not-a-uuid',
            branchId: 'main',
          })
        ).toThrow()
      })

      it('should reject empty branch IDs', () => {
        expect(() =>
          conversationBranchParamsSchema.parse({
            conversationId: '123e4567-e89b-12d3-a456-426614174000',
            branchId: '',
          })
        ).toThrow()
      })
    })
  })
})
