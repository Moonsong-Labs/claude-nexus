import { describe, it, expect } from 'bun:test'
import { hasStatusCode, getStatusCode, sanitizeErrorMessage, HTTPResponseError } from '../errors'

describe('error utilities', () => {
  describe('hasStatusCode', () => {
    it('should return true for errors with statusCode', () => {
      const error: HTTPResponseError = new Error('Test')
      error.statusCode = 404
      expect(hasStatusCode(error)).toBe(true)
    })

    it('should return false for errors without statusCode', () => {
      const error = new Error('Test')
      expect(hasStatusCode(error)).toBe(false)
    })

    it('should return false for non-Error values', () => {
      expect(hasStatusCode('not an error')).toBe(false)
      expect(hasStatusCode(null)).toBe(false)
      expect(hasStatusCode(undefined)).toBe(false)
    })
  })

  describe('getStatusCode', () => {
    it('should extract statusCode from HTTPResponseError', () => {
      const error: HTTPResponseError = new Error('Test')
      error.statusCode = 404
      expect(getStatusCode(error)).toBe(404)
    })

    it('should return 500 for errors without statusCode', () => {
      const error = new Error('Test')
      expect(getStatusCode(error)).toBe(500)
    })

    it('should return 500 for non-Error values', () => {
      expect(getStatusCode('not an error')).toBe(500)
    })
  })

  describe('sanitizeErrorMessage', () => {
    it('should truncate long messages', () => {
      const longMessage = 'a'.repeat(2000)
      const result = sanitizeErrorMessage(longMessage)
      expect(result.length).toBe(1003) // 1000 + '...'
      expect(result.endsWith('...')).toBe(true)
    })

    it('should mask Claude API keys', () => {
      const message = 'Error with key sk-ant-api03-1234567890'
      const result = sanitizeErrorMessage(message)
      expect(result).toBe('Error with key sk-ant-****')
    })

    it('should mask Bearer tokens', () => {
      const message = 'Authorization failed: Bearer abc123xyz'
      const result = sanitizeErrorMessage(message)
      expect(result).toBe('Authorization failed: Bearer ****')
    })

    it('should mask client API keys', () => {
      const message = 'Invalid key cnp_live_abcd1234'
      const result = sanitizeErrorMessage(message)
      expect(result).toBe('Invalid key cnp_****')
    })

    it('should handle multiple sensitive patterns', () => {
      const message = 'Keys: sk-ant-test123 and Bearer xyz789 and cnp_test_456'
      const result = sanitizeErrorMessage(message)
      expect(result).toBe('Keys: sk-ant-**** and Bearer **** and cnp_****')
    })
  })
})
