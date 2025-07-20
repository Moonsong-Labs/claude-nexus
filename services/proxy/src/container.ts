import { Pool } from 'pg'
import { MessageController } from './controllers/MessageController.js'
import { ProxyService } from './services/ProxyService.js'
import { AuthenticationService } from './services/AuthenticationService.js'
import { ClaudeApiClient } from './services/ClaudeApiClient.js'
import { MetricsService } from './services/MetricsService.js'
import { NotificationService } from './services/NotificationService.js'
import { StorageAdapter } from './storage/StorageAdapter.js'
import { TokenUsageService } from './services/TokenUsageService.js'
import { CredentialManager } from './services/CredentialManager.js'
import { config } from '@claude-nexus/shared/config'
import { logger } from './middleware/logger.js'
import { McpServer } from './mcp/McpServer.js'
import { PromptRegistryService } from './mcp/PromptRegistryService.js'
import { GitHubSyncService } from './mcp/GitHubSyncService.js'
import { SyncScheduler } from './mcp/SyncScheduler.js'
import { JsonRpcHandler } from './mcp/JsonRpcHandler.js'

/**
 * Service health status
 */
interface HealthStatus {
  status: 'ok' | 'error' | 'degraded'
  message?: string
}

/**
 * Container health report
 */
interface HealthReport {
  initialized: boolean
  database: HealthStatus
  storage: HealthStatus
  mcp: HealthStatus
}

/**
 * Dependency injection container for the proxy service.
 * Implements singleton pattern with lazy initialization for backward compatibility.
 */
class Container {
  private static instance?: Container
  private isInitialized = false
  private initializationPromise?: Promise<void>

  // Service instances
  private pool?: Pool
  private storageService?: StorageAdapter
  private tokenUsageService?: TokenUsageService
  private metricsService?: MetricsService
  private notificationService?: NotificationService
  private authenticationService?: AuthenticationService
  private claudeApiClient?: ClaudeApiClient
  private proxyService?: ProxyService
  private messageController?: MessageController
  private credentialManager?: CredentialManager
  private mcpServer?: McpServer
  private promptRegistry?: PromptRegistryService
  private githubSyncService?: GitHubSyncService
  private syncScheduler?: SyncScheduler
  private jsonRpcHandler?: JsonRpcHandler

  /**
   * Constructor initializes services synchronously for backward compatibility
   */
  constructor() {
    this.initializeServicesSync()
  }

  /**
   * Synchronous initialization wrapper that starts async initialization
   */
  private initializeServicesSync(): void {
    // Start async initialization but don't await it
    this.initializationPromise = this.initializeServices()
      .then(() => {
        this.isInitialized = true
        logger.info('Container initialized successfully')
      })
      .catch(error => {
        logger.error('Failed to initialize container', {
          error: { message: error.message, stack: error.stack },
        })
        // Don't throw here to maintain backward compatibility
      })
  }

  /**
   * Async initialization of all services
   */
  private async initializeServices(): Promise<void> {
    logger.info('Initializing container...')

    try {
      await this.initializeDatabase()
      this.initializeStorageServices()
      this.initializeCoreServices()
      await this.initializeMcpServices()
    } catch (error) {
      logger.error('Error during container initialization', {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw error
    }
  }

  /**
   * Initialize database connection pool
   */
  private async initializeDatabase(): Promise<void> {
    if (!config.storage.enabled || !config.database.url) {
      logger.info('Database initialization skipped', {
        metadata: {
          storageEnabled: config.storage.enabled,
          databaseUrl: config.database.url ? 'configured' : 'not configured',
        },
      })
      return
    }

    this.pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    this.pool.on('error', err => {
      logger.error('Unexpected database pool error', {
        error: { message: err.message, stack: err.stack },
      })
    })

    logger.info('Database pool created')
  }

  /**
   * Initialize storage-related services
   */
  private initializeStorageServices(): void {
    if (!this.pool || !config.storage.enabled) {
      return
    }

    this.storageService = new StorageAdapter(this.pool)
    this.tokenUsageService = new TokenUsageService(this.pool)
    logger.info('Storage services initialized')
  }

  /**
   * Initialize core services
   */
  private initializeCoreServices(): void {
    // Credential management
    this.credentialManager = new CredentialManager()
    this.credentialManager.startPeriodicCleanup()

    // Metrics and monitoring
    this.metricsService = new MetricsService(
      {
        enableTokenTracking: true,
        enableStorage: config.storage.enabled,
      },
      this.storageService,
      this.tokenUsageService
    )

    // Notification service
    this.notificationService = new NotificationService()

    // Authentication
    this.authenticationService = new AuthenticationService(
      undefined, // No default API key
      config.auth.credentialsDir
    )

    // Claude API client
    this.claudeApiClient = new ClaudeApiClient({
      baseUrl: config.api.claudeBaseUrl,
      timeout: config.api.claudeTimeout,
    })

    // Wire up dependencies
    this.notificationService.setAuthService(this.authenticationService)

    // Proxy service
    this.proxyService = new ProxyService(
      this.authenticationService,
      this.claudeApiClient,
      this.notificationService,
      this.metricsService,
      this.storageService
    )

    // Message controller
    this.messageController = new MessageController(this.proxyService)

    logger.info('Core services initialized')
  }

  /**
   * Initialize MCP (Model Context Protocol) services
   */
  private async initializeMcpServices(): Promise<void> {
    if (!config.mcp.enabled) {
      return
    }

    try {
      // Initialize prompt registry
      this.promptRegistry = new PromptRegistryService()
      await this.promptRegistry.initialize()
      logger.info('MCP Prompt Registry initialized')

      // Initialize MCP server and handler
      this.mcpServer = new McpServer(this.promptRegistry)
      this.jsonRpcHandler = new JsonRpcHandler(this.mcpServer)

      // Initialize GitHub sync if credentials are provided
      if (config.mcp.github.owner && config.mcp.github.repo && config.mcp.github.token) {
        this.githubSyncService = new GitHubSyncService(this.promptRegistry)
        this.syncScheduler = new SyncScheduler(this.githubSyncService)
        this.syncScheduler.start()
        logger.info('MCP GitHub sync initialized')
      } else {
        logger.info('MCP enabled without GitHub sync (credentials not configured)')
      }
    } catch (error) {
      logger.error('Failed to initialize MCP services', {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      // MCP is optional, so we don't throw here
    }
  }

  /**
   * Wait for initialization to complete
   * @returns Promise that resolves when initialization is complete
   */
  public async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise
    }
  }

  /**
   * Get database connection pool
   * @returns Database pool or undefined if storage is disabled
   */
  public getDbPool(): Pool | undefined {
    return this.pool
  }

  /**
   * Get storage adapter
   * @returns Storage adapter or undefined if storage is disabled
   */
  public getStorageService(): StorageAdapter | undefined {
    return this.storageService
  }

  /**
   * Get token usage service
   * @returns Token usage service or undefined if storage is disabled
   */
  public getTokenUsageService(): TokenUsageService | undefined {
    return this.tokenUsageService
  }

  /**
   * Get metrics service
   * @returns Metrics service instance
   * @throws Error if service is not initialized
   */
  public getMetricsService(): MetricsService {
    if (!this.metricsService) {
      throw new Error(
        'MetricsService is not available. This should not happen - metrics service is always initialized.'
      )
    }
    return this.metricsService
  }

  /**
   * Get notification service
   * @returns Notification service instance
   * @throws Error if service is not initialized
   */
  public getNotificationService(): NotificationService {
    if (!this.notificationService) {
      throw new Error(
        'NotificationService is not available. This should not happen - notification service is always initialized.'
      )
    }
    return this.notificationService
  }

  /**
   * Get authentication service
   * @returns Authentication service instance
   * @throws Error if service is not initialized
   */
  public getAuthenticationService(): AuthenticationService {
    if (!this.authenticationService) {
      throw new Error(
        'AuthenticationService is not available. This should not happen - authentication service is always initialized.'
      )
    }
    return this.authenticationService
  }

  /**
   * Get Claude API client
   * @returns Claude API client instance
   * @throws Error if service is not initialized
   */
  public getClaudeApiClient(): ClaudeApiClient {
    if (!this.claudeApiClient) {
      throw new Error(
        'ClaudeApiClient is not available. This should not happen - Claude API client is always initialized.'
      )
    }
    return this.claudeApiClient
  }

  /**
   * Get credential manager
   * @returns Credential manager instance
   * @throws Error if service is not initialized
   */
  public getCredentialManager(): CredentialManager {
    if (!this.credentialManager) {
      throw new Error(
        'CredentialManager is not available. This should not happen - credential manager is always initialized.'
      )
    }
    return this.credentialManager
  }

  /**
   * Get proxy service
   * @returns Proxy service instance
   * @throws Error if service is not initialized
   */
  public getProxyService(): ProxyService {
    if (!this.proxyService) {
      throw new Error(
        'ProxyService is not available. This should not happen - proxy service is always initialized.'
      )
    }
    return this.proxyService
  }

  /**
   * Get message controller
   * @returns Message controller instance
   * @throws Error if service is not initialized
   */
  public getMessageController(): MessageController {
    if (!this.messageController) {
      throw new Error(
        'MessageController is not available. This should not happen - message controller is always initialized.'
      )
    }
    return this.messageController
  }

  /**
   * Get MCP JSON-RPC handler
   * @returns MCP handler or undefined if MCP is disabled
   */
  public getMcpHandler(): JsonRpcHandler | undefined {
    return this.jsonRpcHandler
  }

  /**
   * Get prompt registry service
   * @returns Prompt registry or undefined if MCP is disabled
   */
  public getPromptRegistry(): PromptRegistryService | undefined {
    return this.promptRegistry
  }

  /**
   * Get GitHub sync service
   * @returns GitHub sync service or undefined if not configured
   */
  public getGitHubSyncService(): GitHubSyncService | undefined {
    return this.githubSyncService
  }

  /**
   * Get sync scheduler
   * @returns Sync scheduler or undefined if not configured
   */
  public getSyncScheduler(): SyncScheduler | undefined {
    return this.syncScheduler
  }

  /**
   * Get health status of all services
   * @returns Health report with status of each service
   */
  public async getHealth(): Promise<HealthReport> {
    // Ensure initialization is complete before checking health
    await this.waitForInitialization()

    const report: HealthReport = {
      initialized: this.isInitialized,
      database: { status: 'ok' },
      storage: { status: 'ok' },
      mcp: { status: 'ok' },
    }

    if (!this.isInitialized) {
      report.database = { status: 'error', message: 'Container not initialized' }
      report.storage = { status: 'error', message: 'Container not initialized' }
      report.mcp = { status: 'error', message: 'Container not initialized' }
      return report
    }

    // Check database connection
    if (this.pool) {
      try {
        const client = await this.pool.connect()
        await client.query('SELECT 1')
        client.release()
      } catch (error) {
        report.database = {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    } else if (config.storage.enabled) {
      report.database = {
        status: 'error',
        message: 'Storage is enabled but database pool is not initialized',
      }
    } else {
      report.database = { status: 'degraded', message: 'Storage is disabled' }
    }

    // Check storage services
    if (config.storage.enabled) {
      if (!this.storageService || !this.tokenUsageService) {
        report.storage = {
          status: 'error',
          message: 'Storage services not properly initialized',
        }
      }
    } else {
      report.storage = { status: 'degraded', message: 'Storage is disabled' }
    }

    // Check MCP services
    if (config.mcp.enabled) {
      if (!this.promptRegistry || !this.mcpServer) {
        report.mcp = { status: 'error', message: 'MCP services not properly initialized' }
      } else if (!this.githubSyncService && config.mcp.github.token) {
        report.mcp = {
          status: 'degraded',
          message: 'GitHub sync not initialized despite credentials',
        }
      }
    } else {
      report.mcp = { status: 'degraded', message: 'MCP is disabled' }
    }

    return report
  }

  /**
   * Clean up all resources
   */
  public async cleanup(): Promise<void> {
    logger.info('Starting container cleanup...')

    if (this.credentialManager) {
      this.credentialManager.stopPeriodicCleanup()
    }
    if (this.syncScheduler) {
      this.syncScheduler.stop()
    }
    if (this.promptRegistry) {
      await this.promptRegistry.stop()
    }
    if (this.storageService) {
      await this.storageService.close()
    }
    if (this.pool) {
      await this.pool.end()
    }

    logger.info('Container cleanup completed')
  }
}

// Create singleton instance for backward compatibility
export const container = new Container()
