/**
 * CredentialManager - Manages credential caching and lifecycle
 *
 * This class encapsulates credential caching logic and provides
 * lifecycle management for cleanup operations. It replaces the
 * global state and setInterval from credentials.ts.
 *
 * Features:
 * - Credential caching with TTL
 * - OAuth token refresh tracking and deduplication
 * - Failed refresh cooldown management
 * - Periodic cleanup of expired entries
 * - Comprehensive metrics tracking
 */

import { ClaudeCredentials } from '../credentials'
import { logger } from '../middleware/logger.js'

// Configuration constants
const DEFAULT_CREDENTIAL_CACHE_TTL = 3600000 // 1 hour
const CREDENTIAL_CACHE_MAX_SIZE = 100
const FAILED_REFRESH_COOLDOWN = 5000 // 5 seconds
const REFRESH_TIMEOUT = 60000 // 1 minute
const CLEANUP_INTERVAL = 300000 // 5 minutes

interface CachedCredential {
  credential: ClaudeCredentials
  timestamp: number
}

interface FailedRefresh {
  timestamp: number
  error: string
}

export interface RefreshMetrics {
  attempts: number
  successes: number
  failures: number
  concurrentWaits: number
  totalRefreshTime: number
}

type MetricEvent = 'attempt' | 'success' | 'failure' | 'concurrent'

export class CredentialManager {
  // Credential cache with TTL
  private credentialCache = new Map<string, CachedCredential>()
  private readonly credentialCacheTTL: number

  // Refresh token management
  private activeRefreshes = new Map<string, Promise<string | null>>()
  private refreshTimestamps = new Map<string, number>()
  private failedRefreshCache = new Map<string, FailedRefresh>()

  // Metrics
  private refreshMetrics: RefreshMetrics = {
    attempts: 0,
    successes: 0,
    failures: 0,
    concurrentWaits: 0,
    totalRefreshTime: 0,
  }

  // Cleanup interval handle
  private cleanupIntervalId?: NodeJS.Timeout

  constructor(cacheTTL: number = DEFAULT_CREDENTIAL_CACHE_TTL) {
    this.credentialCacheTTL = cacheTTL
  }

  /**
   * Get a cached credential
   * @param key - The cache key (usually the credential file path)
   * @returns The cached credential or null if not found/expired
   */
  getCachedCredential(key: string): ClaudeCredentials | null {
    const cached = this.credentialCache.get(key)
    if (!cached) {
      return null
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.credentialCacheTTL) {
      this.credentialCache.delete(key)
      return null
    }

    return cached.credential
  }

  /**
   * Set a cached credential
   * @param key - The cache key (usually the credential file path)
   * @param credential - The credential to cache
   */
  setCachedCredential(key: string, credential: ClaudeCredentials): void {
    // Ensure cache doesn't grow too large
    if (this.credentialCache.size >= CREDENTIAL_CACHE_MAX_SIZE) {
      // Remove oldest entry
      const oldestEntry = this.findOldestCacheEntry()
      if (oldestEntry) {
        this.credentialCache.delete(oldestEntry)
      }
    }

    this.credentialCache.set(key, {
      credential,
      timestamp: Date.now(),
    })
  }

  /**
   * Clear credential cache
   */
  clearCredentialCache(): void {
    this.credentialCache.clear()
  }

  /**
   * Get active refresh promise for a credential
   * @param credentialPath - Path to the credential file
   * @returns The active refresh promise or undefined if no refresh is in progress
   */
  getActiveRefresh(credentialPath: string): Promise<string | null> | undefined {
    return this.activeRefreshes.get(credentialPath)
  }

  /**
   * Set active refresh promise
   * @param credentialPath - Path to the credential file
   * @param promise - The refresh promise to track
   */
  setActiveRefresh(credentialPath: string, promise: Promise<string | null>): void {
    this.activeRefreshes.set(credentialPath, promise)
    this.refreshTimestamps.set(credentialPath, Date.now())
  }

  /**
   * Remove active refresh
   * @param credentialPath - Path to the credential file
   */
  removeActiveRefresh(credentialPath: string): void {
    this.activeRefreshes.delete(credentialPath)
    this.refreshTimestamps.delete(credentialPath)
  }

  /**
   * Check if refresh recently failed
   * @param credentialPath - Path to the credential file
   * @returns Object indicating if refresh failed recently and the error message
   */
  hasRecentFailure(credentialPath: string): { failed: boolean; error?: string } {
    const failedRefresh = this.failedRefreshCache.get(credentialPath)
    if (failedRefresh && Date.now() - failedRefresh.timestamp < FAILED_REFRESH_COOLDOWN) {
      return { failed: true, error: failedRefresh.error }
    }
    return { failed: false }
  }

  /**
   * Record a failed refresh
   * @param credentialPath - Path to the credential file
   * @param error - Error message describing the failure
   */
  recordFailedRefresh(credentialPath: string, error: string): void {
    this.failedRefreshCache.set(credentialPath, {
      timestamp: Date.now(),
      error,
    })
  }

  /**
   * Update refresh metrics
   * @param event - The type of metric event
   * @param duration - Optional duration in milliseconds (for success events)
   */
  updateMetrics(event: MetricEvent, duration?: number): void {
    switch (event) {
      case 'attempt':
        this.refreshMetrics.attempts++
        break
      case 'success':
        this.refreshMetrics.successes++
        if (duration) {
          this.refreshMetrics.totalRefreshTime += duration
        }
        break
      case 'failure':
        this.refreshMetrics.failures++
        break
      case 'concurrent':
        this.refreshMetrics.concurrentWaits++
        break
    }
  }

  /**
   * Get current refresh metrics
   * @returns Current metrics including active and failed refresh counts
   */
  getRefreshMetrics(): RefreshMetrics & {
    currentActiveRefreshes: number
    currentFailedRefreshes: number
  } {
    return {
      ...this.refreshMetrics,
      currentActiveRefreshes: this.activeRefreshes.size,
      currentFailedRefreshes: this.failedRefreshCache.size,
    }
  }

  /**
   * Start periodic cleanup (for long-running services)
   */
  startPeriodicCleanup(): void {
    if (this.cleanupIntervalId) {
      return // Already running
    }

    this.cleanupIntervalId = setInterval(() => {
      this.performCleanup()
    }, CLEANUP_INTERVAL)

    // Don't let the interval prevent process exit in Node.js
    if (this.cleanupIntervalId.unref) {
      this.cleanupIntervalId.unref()
    }
  }

  /**
   * Stop periodic cleanup (for graceful shutdown)
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = undefined
    }
  }

  /**
   * Perform cleanup of expired entries
   */
  private performCleanup(): void {
    try {
      const now = Date.now()

      // Clean expired entries from all caches
      this.cleanExpiredEntries(now)

      // Log metrics periodically
      if (this.refreshMetrics.attempts > 0) {
        logger.info('OAuth refresh metrics', {
          metadata: {
            attempts: this.refreshMetrics.attempts,
            successes: this.refreshMetrics.successes,
            failures: this.refreshMetrics.failures,
            successRate: this.calculateSuccessRate(),
            avgRefreshTime: this.calculateAverageRefreshTime(),
            currentActiveRefreshes: this.activeRefreshes.size,
          },
        })
      }
    } catch (error) {
      logger.error('Error during credential manager cleanup', {
        error: error instanceof Error ? error : undefined,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Clean expired entries from all caches
   */
  private cleanExpiredEntries(now: number): void {
    // Clean credential cache
    for (const [key, value] of this.credentialCache.entries()) {
      if (now - value.timestamp > this.credentialCacheTTL) {
        this.credentialCache.delete(key)
      }
    }

    // Clean stuck refresh operations
    for (const [key, timestamp] of this.refreshTimestamps.entries()) {
      if (now - timestamp > REFRESH_TIMEOUT) {
        logger.warn('Cleaning up stuck refresh operation', {
          metadata: {
            credentialPath: key,
            timeoutMs: REFRESH_TIMEOUT,
          },
        })
        this.activeRefreshes.delete(key)
        this.refreshTimestamps.delete(key)
      }
    }

    // Clean expired failed refresh entries
    for (const [key, failure] of this.failedRefreshCache.entries()) {
      if (now - failure.timestamp > FAILED_REFRESH_COOLDOWN) {
        this.failedRefreshCache.delete(key)
      }
    }
  }

  /**
   * Find the oldest entry in the credential cache
   */
  private findOldestCacheEntry(): string | undefined {
    let oldestKey: string | undefined
    let oldestTime = Date.now()

    for (const [key, value] of this.credentialCache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp
        oldestKey = key
      }
    }

    return oldestKey
  }

  /**
   * Calculate the success rate percentage
   */
  private calculateSuccessRate(): string {
    if (this.refreshMetrics.attempts === 0) {
      return '0.00%'
    }
    return ((this.refreshMetrics.successes / this.refreshMetrics.attempts) * 100).toFixed(2) + '%'
  }

  /**
   * Calculate the average refresh time in milliseconds
   */
  private calculateAverageRefreshTime(): string {
    if (this.refreshMetrics.attempts === 0) {
      return '0ms'
    }
    return (this.refreshMetrics.totalRefreshTime / this.refreshMetrics.attempts).toFixed(0) + 'ms'
  }

  /**
   * Perform immediate cleanup (useful for scripts)
   */
  cleanup(): void {
    this.performCleanup()
  }
}
