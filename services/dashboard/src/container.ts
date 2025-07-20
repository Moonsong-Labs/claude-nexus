import { Pool } from 'pg'
import { StorageReader } from './storage/reader.js'
import { ProxyApiClient } from './services/api-client.js'
import { logger } from './middleware/logger.js'
import { config } from '@claude-nexus/shared/config'

/**
 * Dependency injection container for the dashboard service.
 *
 * Manages service dependencies with lazy initialization and proper lifecycle management.
 * The database connection is optional, allowing the dashboard to operate with just the API client.
 *
 * @example
 * ```typescript
 * // Get required service
 * const apiClient = container.getApiClient()
 *
 * // Get optional service with null check
 * const storage = container.getStorageService()
 * if (storage) {
 *   const data = await storage.getRequests()
 * }
 * ```
 */
class Container {
  private pool?: Pool
  private storageReader?: StorageReader
  private apiClient?: ProxyApiClient
  private initialized = false

  /**
   * Initializes all services. Called automatically on first service access.
   * Can be called manually for eager initialization.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Initialize API client (required service)
    const proxyUrl = process.env.PROXY_API_URL || 'http://proxy:3000'
    this.apiClient = new ProxyApiClient(proxyUrl)
    logger.info('Dashboard initialized with Proxy API client', { proxyUrl })

    // Initialize database connection (optional service)
    const databaseUrl = this.getDatabaseUrl()
    if (databaseUrl) {
      try {
        this.pool = new Pool({
          connectionString: databaseUrl,
          max: 10, // Dashboard needs fewer connections
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        })

        this.pool.on('error', err => {
          logger.error('Database pool error', {
            error: {
              message: err.message,
              code: (err as any).code,
              detail: (err as any).detail,
            },
          })
        })

        this.storageReader = new StorageReader(this.pool)
        logger.info('Dashboard initialized with database storage')
      } catch (error) {
        logger.warn('Failed to initialize database connection', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        // Continue without database - dashboard can work with just API
      }
    } else {
      logger.info('Dashboard running without direct database access')
    }

    this.initialized = true
  }

  /**
   * Gets the database URL from configuration.
   * Uses centralized config, falling back to individual env vars for compatibility.
   */
  private getDatabaseUrl(): string | undefined {
    // Prefer centralized config
    if (config.database.url) {
      return config.database.url
    }

    // Fall back to building from individual env vars
    const { host, port, name, user, password } = config.database
    if (host && name && user) {
      const passwordPart = password ? `:${password}` : ''
      return `postgresql://${user}${passwordPart}@${host}:${port}/${name}`
    }

    return undefined
  }

  /**
   * Gets the database pool instance.
   *
   * @returns The PostgreSQL connection pool
   * @throws Error if database is not configured or initialization failed
   * @deprecated Direct database access is being phased out. Use API client instead.
   */
  getPool(): Pool {
    if (!this.initialized) {
      throw new Error('Container not initialized. Services are lazily initialized on first access.')
    }
    if (!this.pool) {
      throw new Error('Database pool not available. Check database configuration.')
    }
    return this.pool
  }

  /**
   * Gets the storage reader service.
   *
   * @returns The storage reader instance or undefined if database is not configured
   * @deprecated Direct database access is being phased out. Use API client instead.
   */
  getStorageService(): StorageReader | undefined {
    if (!this.initialized) {
      // Lazy initialization
      this.initialize().catch(err => {
        logger.error('Failed to initialize container', { error: err })
      })
    }
    return this.storageReader
  }

  /**
   * Gets the proxy API client.
   *
   * @returns The API client instance for communicating with the proxy service
   */
  getApiClient(): ProxyApiClient {
    if (!this.initialized) {
      // Lazy initialization
      this.initialize().catch(err => {
        logger.error('Failed to initialize container', { error: err })
      })
    }
    if (!this.apiClient) {
      throw new Error('API client initialization failed')
    }
    return this.apiClient
  }

  /**
   * Cleans up resources, closing database connections.
   * Should be called during graceful shutdown.
   */
  async cleanup(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.end()
        logger.info('Database pool closed')
      }
    } catch (error) {
      logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}

// Create singleton instance
export const container = new Container()
