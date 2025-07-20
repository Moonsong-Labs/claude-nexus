import { describe, it, expect } from 'bun:test'
import { RequestContext } from '../src/domain/value-objects/RequestContext'
import { RequestContextFactory } from '../src/domain/factories/RequestContextFactory'

describe('RequestContext', () => {
  describe('constructor validation', () => {
    it('should create a valid RequestContext', () => {
      const context = new RequestContext(
        'req_123',
        'api.example.com',
        'POST',
        '/v1/messages',
        Date.now(),
        { 'user-agent': 'Mozilla/5.0' },
        'Bearer sk-ant-123'
      )

      expect(context.requestId).toBe('req_123')
      expect(context.host).toBe('api.example.com')
      expect(context.method).toBe('POST')
      expect(context.path).toBe('/v1/messages')
      expect(context.hasApiKey()).toBe(true)
    })

    it('should throw error for missing requestId', () => {
      expect(() => {
        new RequestContext('', 'api.example.com', 'POST', '/v1/messages', Date.now(), {})
      }).toThrow('RequestContext: requestId is required')
    })

    it('should throw error for missing host', () => {
      expect(() => {
        new RequestContext('req_123', '', 'POST', '/v1/messages', Date.now(), {})
      }).toThrow('RequestContext: host is required')
    })

    it('should throw error for invalid startTime', () => {
      expect(() => {
        new RequestContext('req_123', 'api.example.com', 'POST', '/v1/messages', 0, {})
      }).toThrow('RequestContext: startTime must be a positive number')
    })
  })

  describe('immutability', () => {
    it('should freeze headers object', () => {
      const headers = { 'user-agent': 'Mozilla/5.0' }
      const context = new RequestContext(
        'req_123',
        'api.example.com',
        'POST',
        '/v1/messages',
        Date.now(),
        headers
      )

      // Headers should be frozen
      expect(Object.isFrozen(context.headers)).toBe(true)

      // Original headers can be modified but won't affect context
      headers['new-header'] = 'value'
      expect(context.headers['new-header']).toBeUndefined()

      // Attempting to modify frozen headers throws in strict mode
      expect(() => {
        'use strict'
        ;(context.headers as any)['new-header'] = 'value'
      }).toThrow()
    })
  })

  describe('utility methods', () => {
    it('should correctly check domain', () => {
      const context = new RequestContext(
        'req_123',
        'api.example.com',
        'POST',
        '/v1/messages',
        Date.now(),
        {}
      )

      expect(context.isFromDomain('api.example.com')).toBe(true)
      expect(context.isFromDomain('API.EXAMPLE.COM')).toBe(true)
      expect(context.isFromDomain('other.com')).toBe(false)
    })

    it('should calculate elapsed time', async () => {
      const startTime = Date.now()
      const context = new RequestContext(
        'req_123',
        'api.example.com',
        'POST',
        '/v1/messages',
        startTime,
        {}
      )

      await Bun.sleep(10)
      const elapsed = context.getElapsedTime()
      expect(elapsed).toBeGreaterThanOrEqual(10)
    })

    it('should generate telemetry data', () => {
      const startTime = Date.now()
      const context = new RequestContext(
        'req_123',
        'api.example.com',
        'POST',
        '/v1/messages',
        startTime,
        {}
      )

      const telemetry = context.toTelemetry()
      expect(telemetry).toMatchObject({
        requestId: 'req_123',
        domain: 'api.example.com',
        method: 'POST',
        path: '/v1/messages',
        duration: expect.any(Number),
        timestamp: expect.any(String),
      })
    })
  })
})

describe('RequestContextFactory', () => {
  it('should create RequestContext for testing', () => {
    const context = RequestContextFactory.forTesting({
      requestId: 'test_123',
      host: 'test.com',
    })

    expect(context.requestId).toBe('test_123')
    expect(context.host).toBe('test.com')
    expect(context.method).toBe('POST')
    expect(context.path).toBe('/v1/messages')
  })

  it('should use defaults for testing', () => {
    const context = RequestContextFactory.forTesting({})

    expect(context.requestId).toBe('test-request-id')
    expect(context.host).toBe('test.example.com')
    expect(context.method).toBe('POST')
    expect(context.path).toBe('/v1/messages')
  })
})
