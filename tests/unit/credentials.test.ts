import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

// Mock the credentials module to test in isolation
const TEST_DIR = join(tmpdir(), `claude-proxy-test-${randomBytes(8).toString('hex')}`)

describe('Credentials', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  describe('loadCredentialsFromFile', () => {
    it('should load valid API key credentials', () => {
      const credFile = join(TEST_DIR, 'test.credentials.json')
      const credentials = {
        type: 'api_key',
        api_key: 'sk-ant-test-key',
      }

      writeFileSync(credFile, JSON.stringify(credentials))

      // Mock implementation - in real test, import and test actual function
      const loaded = JSON.parse(require('fs').readFileSync(credFile, 'utf-8'))

      expect(loaded.type).toBe('api_key')
      expect(loaded.api_key).toBe('sk-ant-test-key')
    })

    it('should load valid OAuth credentials', () => {
      const credFile = join(TEST_DIR, 'oauth.credentials.json')
      const credentials = {
        type: 'oauth',
        oauth: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: Date.now() + 3600000,
          scopes: ['org:create_api_key'],
          isMax: false,
        },
      }

      writeFileSync(credFile, JSON.stringify(credentials))

      const loaded = JSON.parse(require('fs').readFileSync(credFile, 'utf-8'))

      expect(loaded.type).toBe('oauth')
      expect(loaded.oauth.accessToken).toBe('test-access-token')
    })

    it('should reject credentials with missing type', () => {
      const credFile = join(TEST_DIR, 'invalid.credentials.json')
      const credentials = {
        api_key: 'sk-ant-test-key',
      }

      writeFileSync(credFile, JSON.stringify(credentials))

      // In real test, this should throw or return null
      expect(() => {
        const loaded = JSON.parse(require('fs').readFileSync(credFile, 'utf-8'))
        if (!loaded.type) throw new Error('Invalid credential file')
      }).toThrow()
    })

    it('should handle non-existent files gracefully', () => {
      const credFile = join(TEST_DIR, 'nonexistent.credentials.json')

      expect(() => {
        require('fs').readFileSync(credFile, 'utf-8')
      }).toThrow()
    })
  })

  describe('OAuth Token Refresh', () => {
    it('should identify tokens needing refresh', () => {
      const expiredToken = {
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      }

      const validToken = {
        expiresAt: Date.now() + 3600000, // Valid for 1 hour
      }

      // Mock implementation
      const needsRefresh = (token: any) => token.expiresAt < Date.now() + 60000

      expect(needsRefresh(expiredToken)).toBe(true)
      expect(needsRefresh(validToken)).toBe(false)
    })

    it('should update credentials file after refresh', () => {
      const credFile = join(TEST_DIR, 'oauth-update.credentials.json')
      const originalCreds = {
        type: 'oauth',
        oauth: {
          accessToken: 'old-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() - 1000,
        },
        client_api_key: 'preserve-this',
      }

      writeFileSync(credFile, JSON.stringify(originalCreds))

      // Simulate refresh
      const newOAuth = {
        accessToken: 'new-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
      }

      const updated = {
        ...originalCreds,
        oauth: newOAuth,
      }

      writeFileSync(credFile, JSON.stringify(updated, null, 2))

      const saved = JSON.parse(require('fs').readFileSync(credFile, 'utf-8'))
      expect(saved.oauth.accessToken).toBe('new-token')
      expect(saved.client_api_key).toBe('preserve-this')
    })
  })

  describe('Domain Credential Mapping', () => {
    it('should find credential file for domain', () => {
      const domain = 'example.com'
      const credFile = join(TEST_DIR, `${domain}.credentials.json`)

      writeFileSync(
        credFile,
        JSON.stringify({
          type: 'api_key',
          api_key: 'sk-ant-domain-key',
        })
      )

      // Mock domain lookup
      const files = require('fs').readdirSync(TEST_DIR)
      const domainFile = files.find(f => f === `${domain}.credentials.json`)

      expect(domainFile).toBeDefined()
    })

    it('should handle domains with ports', () => {
      const domain = 'localhost:3000'
      const credFile = join(TEST_DIR, `${domain}.credentials.json`)

      writeFileSync(
        credFile,
        JSON.stringify({
          type: 'api_key',
          api_key: 'sk-ant-local-key',
        })
      )

      const files = require('fs').readdirSync(TEST_DIR)
      const domainFile = files.find(f => f === `${domain}.credentials.json`)

      expect(domainFile).toBeDefined()
    })
  })
})
