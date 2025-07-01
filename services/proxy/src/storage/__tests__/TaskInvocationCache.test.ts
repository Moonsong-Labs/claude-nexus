import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { TaskInvocationCache } from '../TaskInvocationCache.js'
import type { TaskInvocation } from '@claude-nexus/shared'

describe('TaskInvocationCache', () => {
  let cache: TaskInvocationCache

  beforeEach(() => {
    cache = new TaskInvocationCache(300000) // 5 minutes
  })

  afterEach(() => {
    cache.destroy()
  })

  describe('add', () => {
    it('should add invocations to the cache', () => {
      const invocation: TaskInvocation = {
        requestId: 'req-123',
        toolUseId: 'tool-456',
        prompt: 'Test prompt',
        timestamp: new Date(),
      }

      cache.add('example.com', invocation)
      expect(cache.size()).toBe(1)
    })

    it('should add multiple invocations for the same domain', () => {
      const invocation1: TaskInvocation = {
        requestId: 'req-123',
        toolUseId: 'tool-456',
        prompt: 'Test prompt 1',
        timestamp: new Date(),
      }
      const invocation2: TaskInvocation = {
        requestId: 'req-789',
        toolUseId: 'tool-012',
        prompt: 'Test prompt 2',
        timestamp: new Date(),
      }

      cache.add('example.com', invocation1)
      cache.add('example.com', invocation2)
      expect(cache.size()).toBe(2)
    })
  })

  describe('getRecent', () => {
    it('should return invocations within the time window', () => {
      const now = new Date()
      const invocation1: TaskInvocation = {
        requestId: 'req-123',
        toolUseId: 'tool-456',
        prompt: 'Test prompt 1',
        timestamp: new Date(now.getTime() - 10000), // 10 seconds ago
      }
      const invocation2: TaskInvocation = {
        requestId: 'req-789',
        toolUseId: 'tool-012',
        prompt: 'Test prompt 2',
        timestamp: new Date(now.getTime() - 40000), // 40 seconds ago
      }

      cache.add('example.com', invocation1)
      cache.add('example.com', invocation2)

      // Get invocations within 30 seconds
      const recent = cache.getRecent('example.com', 30000)
      expect(recent).toHaveLength(1)
      expect(recent[0].requestId).toBe('req-123')
    })

    it('should return empty array for unknown domain', () => {
      const recent = cache.getRecent('unknown.com')
      expect(recent).toEqual([])
    })
  })

  describe('cleanup', () => {
    it('should remove expired invocations', () => {
      const now = new Date()
      const oldInvocation: TaskInvocation = {
        requestId: 'req-old',
        toolUseId: 'tool-old',
        prompt: 'Old prompt',
        timestamp: new Date(now.getTime() - 400000), // Older than maxAge
      }
      const newInvocation: TaskInvocation = {
        requestId: 'req-new',
        toolUseId: 'tool-new',
        prompt: 'New prompt',
        timestamp: now,
      }

      cache.add('example.com', oldInvocation)
      cache.add('example.com', newInvocation)

      // Cleanup should remove the old invocation
      cache.cleanup()

      expect(cache.size()).toBe(1)
      const recent = cache.getRecent('example.com', 600000)
      expect(recent[0].requestId).toBe('req-new')
    })
  })

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const now = new Date()
      const invocation1: TaskInvocation = {
        requestId: 'req-123',
        toolUseId: 'tool-456',
        prompt: 'Test prompt 1',
        timestamp: new Date(now.getTime() - 10000),
      }
      const invocation2: TaskInvocation = {
        requestId: 'req-789',
        toolUseId: 'tool-012',
        prompt: 'Test prompt 2',
        timestamp: now,
      }

      cache.add('example.com', invocation1)
      cache.add('another.com', invocation2)

      const stats = cache.getStats()
      expect(stats.domains).toBe(2)
      expect(stats.totalInvocations).toBe(2)
      expect(stats.oldestTimestamp).toEqual(invocation1.timestamp)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      const invocation: TaskInvocation = {
        requestId: 'req-123',
        toolUseId: 'tool-456',
        prompt: 'Test prompt',
        timestamp: new Date(),
      }

      cache.add('example.com', invocation)
      expect(cache.size()).toBe(1)

      cache.clear()
      expect(cache.size()).toBe(0)
    })
  })
})