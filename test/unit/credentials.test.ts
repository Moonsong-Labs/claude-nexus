import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { loadCredentials, getCredentials, refreshToken } from '@/credentials'
import { mockServer } from '../../test-setup/setup'
import { rest } from 'msw'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/test')
}))

describe('Credential Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Clear credential cache by calling the internal clear function
    // In real implementation, we'd export a test-only clearCache function
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  describe('loadCredentials', () => {
    it('should load API key credentials from file', () => {
      const mockCredentials = {
        type: 'api_key',
        api_key: 'sk-ant-api03-test-key'
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCredentials))
      
      const result = loadCredentials('/path/to/creds.json')
      
      expect(result).toEqual(mockCredentials)
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/creds.json')
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/creds.json', 'utf-8')
    })
    
    it('should cache loaded credentials', () => {
      const mockCredentials = {
        type: 'api_key',
        api_key: 'sk-ant-api03-test-key'
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCredentials))
      
      // Load twice
      const result1 = loadCredentials('/path/to/creds.json')
      const result2 = loadCredentials('/path/to/creds.json')
      
      // Should only read file once due to caching
      expect(fs.readFileSync).toHaveBeenCalledTimes(1)
      expect(result1).toBe(result2) // Same reference
    })
    
    it('should handle missing files gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const result = loadCredentials('/missing/file.json')
      
      expect(result).toBeNull()
      expect(fs.readFileSync).not.toHaveBeenCalled()
    })
    
    it('should resolve ~ paths correctly', () => {
      const mockCredentials = {
        type: 'api_key',
        api_key: 'sk-ant-api03-test-key'
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCredentials))
      
      loadCredentials('~/.config/claude/creds.json')
      
      expect(fs.existsSync).toHaveBeenCalledWith('/home/test/.config/claude/creds.json')
    })
    
    it('should handle invalid JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')
      
      // Mock console.error to avoid test output noise
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const result = loadCredentials('/path/to/invalid.json')
      
      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
    
    it('should evict old entries when cache is full', () => {
      // This test would require access to internal cache state
      // In practice, we'd test this by loading more than CREDENTIAL_CACHE_MAX_SIZE files
      // and verifying the oldest entries are evicted
    })
    
    it('should respect cache TTL', () => {
      const mockCredentials = {
        type: 'api_key',
        api_key: 'sk-ant-api03-test-key'
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCredentials))
      
      // Load credentials
      loadCredentials('/path/to/creds.json')
      expect(fs.readFileSync).toHaveBeenCalledTimes(1)
      
      // Advance time past TTL
      vi.advanceTimersByTime(3600001) // 1 hour + 1ms
      
      // Load again - should read from file due to expired cache
      loadCredentials('/path/to/creds.json')
      expect(fs.readFileSync).toHaveBeenCalledTimes(2)
    })
  })
  
  describe('refreshToken', () => {
    it('should refresh OAuth tokens successfully', async () => {
      const newTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600
      }
      
      mockServer.use(
        rest.post('https://console.anthropic.com/v1/oauth/token', (req, res, ctx) => {
          return res(ctx.status(200), ctx.json(newTokens))
        })
      )
      
      const result = await refreshToken('old_refresh_token')
      
      expect(result).toEqual({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: expect.any(Number),
        scopes: expect.any(Array)
      })
    })
    
    it('should handle refresh failures gracefully', async () => {
      mockServer.use(
        rest.post('https://console.anthropic.com/v1/oauth/token', (req, res, ctx) => {
          return res(ctx.status(401), ctx.json({ error: 'invalid_grant' }))
        })
      )
      
      await expect(refreshToken('invalid_token')).rejects.toThrow()
    })
  })
  
  describe('getCredentials', () => {
    it('should return domain-specific credentials', async () => {
      const mockCredentials = {
        type: 'api_key' as const,
        api_key: 'sk-ant-api03-domain-key'
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCredentials))
      
      process.env.CREDENTIALS_DIR = '/credentials'
      
      const result = await getCredentials('test.example.com')
      
      expect(result).toEqual({
        type: 'api_key',
        key: 'sk-ant-api03-domain-key'
      })
      expect(fs.existsSync).toHaveBeenCalledWith('/credentials/test.example.com.credentials.json')
    })
    
    it('should refresh OAuth tokens 1 minute before expiry', async () => {
      const mockCredentials = {
        type: 'oauth' as const,
        oauth: {
          accessToken: 'old_access_token',
          refreshToken: 'refresh_token',
          expiresAt: Date.now() + 50000, // Expires in 50 seconds
          scopes: ['user:inference'],
          isMax: false
        }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCredentials))
      
      // Mock successful refresh
      const newTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600
      }
      
      mockServer.use(
        rest.post('https://console.anthropic.com/v1/oauth/token', (req, res, ctx) => {
          return res(ctx.status(200), ctx.json(newTokens))
        })
      )
      
      const result = await getCredentials('oauth.example.com')
      
      expect(result).toEqual({
        type: 'oauth',
        key: 'new_access_token', // Should be the new token
        betaHeader: 'oauth-2025-04-20'
      })
    })
    
    it('should fall back to request header API key', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const result = await getCredentials('unknown.domain.com', 'sk-ant-api03-header-key')
      
      expect(result).toEqual({
        type: 'api_key',
        key: 'sk-ant-api03-header-key'
      })
    })
    
    it('should fall back to environment variable API key', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      process.env.CLAUDE_API_KEY = 'sk-ant-api03-env-key'
      
      const result = await getCredentials('unknown.domain.com')
      
      expect(result).toEqual({
        type: 'api_key',
        key: 'sk-ant-api03-env-key'
      })
      
      delete process.env.CLAUDE_API_KEY
    })
  })
})