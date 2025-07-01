import type { TaskInvocation } from '@claude-nexus/shared'

export class TaskInvocationCache {
  private cache: Map<string, TaskInvocation[]> = new Map()
  private maxAge: number
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(maxAge: number = 300000) {
    // 5 minutes default
    this.maxAge = maxAge

    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000)
  }

  /**
   * Add a new task invocation to the cache
   */
  add(domain: string, invocation: TaskInvocation): void {
    const existing = this.cache.get(domain) || []
    existing.push(invocation)
    this.cache.set(domain, existing)
  }

  /**
   * Get recent task invocations within the specified time window
   */
  getRecent(domain: string, timeWindow: number = 30000): TaskInvocation[] {
    const invocations = this.cache.get(domain) || []
    const cutoffTime = Date.now() - timeWindow

    return invocations.filter(inv => inv.timestamp.getTime() > cutoffTime)
  }

  /**
   * Remove expired entries from the cache
   */
  cleanup(): void {
    const cutoffTime = Date.now() - this.maxAge

    for (const [domain, invocations] of this.cache.entries()) {
      const recent = invocations.filter(inv => inv.timestamp.getTime() > cutoffTime)

      if (recent.length === 0) {
        this.cache.delete(domain)
      } else if (recent.length < invocations.length) {
        this.cache.set(domain, recent)
      }
    }
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clear()
  }

  /**
   * Get the current size of the cache
   */
  size(): number {
    let total = 0
    for (const invocations of this.cache.values()) {
      total += invocations.length
    }
    return total
  }

  /**
   * Get cache statistics
   */
  getStats(): { domains: number; totalInvocations: number; oldestTimestamp: Date | null } {
    let oldestTimestamp: Date | null = null
    let totalInvocations = 0

    for (const invocations of this.cache.values()) {
      totalInvocations += invocations.length
      for (const inv of invocations) {
        if (!oldestTimestamp || inv.timestamp < oldestTimestamp) {
          oldestTimestamp = inv.timestamp
        }
      }
    }

    return {
      domains: this.cache.size,
      totalInvocations,
      oldestTimestamp,
    }
  }
}
