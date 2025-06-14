import { AuthenticationService } from './services/AuthenticationService'
import { ClaudeApiClient } from './services/ClaudeApiClient'
import { NotificationService } from './services/NotificationService'
import { MetricsService } from './services/MetricsService'
import { ProxyService } from './services/ProxyService'
import { MessageController } from './controllers/MessageController'
import { StorageService } from './storage'
import { config } from './config'
import { Pool } from 'pg'

/**
 * Dependency injection container
 * Manages service creation and dependencies
 */
export class Container {
  private instances = new Map<string, any>()
  
  /**
   * Get or create database pool
   */
  getDbPool(): Pool | undefined {
    if (!this.instances.has('dbPool')) {
      if (config.database.url || config.database.host) {
        const pool = new Pool({
          connectionString: config.database.url,
          host: config.database.host,
          port: config.database.port,
          database: config.database.name,
          user: config.database.user,
          password: config.database.password,
          ssl: config.database.ssl,
          max: config.database.poolSize
        })
        this.instances.set('dbPool', pool)
      }
    }
    return this.instances.get('dbPool')
  }
  
  /**
   * Get or create storage service
   */
  getStorageService(): StorageService | undefined {
    if (!this.instances.has('storageService')) {
      const pool = this.getDbPool()
      if (pool && config.storage.enabled) {
        const service = new StorageService({
          connectionString: config.database.url,
          host: config.database.host,
          port: config.database.port,
          database: config.database.name,
          user: config.database.user,
          password: config.database.password,
          ssl: config.database.ssl
        })
        this.instances.set('storageService', service)
      }
    }
    return this.instances.get('storageService')
  }
  
  /**
   * Get or create authentication service
   */
  getAuthenticationService(): AuthenticationService {
    if (!this.instances.has('authService')) {
      const service = new AuthenticationService(
        config.api.claudeApiKey,
        config.auth.credentialsDir
      )
      this.instances.set('authService', service)
    }
    return this.instances.get('authService')
  }
  
  /**
   * Get or create Claude API client
   */
  getClaudeApiClient(): ClaudeApiClient {
    if (!this.instances.has('apiClient')) {
      const client = new ClaudeApiClient({
        baseUrl: config.api.claudeBaseUrl,
        timeout: config.api.claudeTimeout
      })
      this.instances.set('apiClient', client)
    }
    return this.instances.get('apiClient')
  }
  
  /**
   * Get or create notification service
   */
  getNotificationService(): NotificationService {
    if (!this.instances.has('notificationService')) {
      const service = new NotificationService({
        enabled: config.features.enableNotifications && config.slack.enabled,
        maxLines: 20,
        maxLength: 3000
      })
      this.instances.set('notificationService', service)
    }
    return this.instances.get('notificationService')
  }
  
  /**
   * Get or create metrics service
   */
  getMetricsService(): MetricsService {
    if (!this.instances.has('metricsService')) {
      const service = new MetricsService(
        {
          enableTokenTracking: true,
          enableStorage: config.storage.enabled,
          enableTelemetry: config.telemetry.enabled
        },
        this.getStorageService(),
        config.telemetry.endpoint
      )
      this.instances.set('metricsService', service)
    }
    return this.instances.get('metricsService')
  }
  
  /**
   * Get or create proxy service
   */
  getProxyService(): ProxyService {
    if (!this.instances.has('proxyService')) {
      const service = new ProxyService(
        this.getAuthenticationService(),
        this.getClaudeApiClient(),
        this.getNotificationService(),
        this.getMetricsService()
      )
      this.instances.set('proxyService', service)
    }
    return this.instances.get('proxyService')
  }
  
  /**
   * Get or create message controller
   */
  getMessageController(): MessageController {
    if (!this.instances.has('messageController')) {
      const controller = new MessageController(
        this.getProxyService()
      )
      this.instances.set('messageController', controller)
    }
    return this.instances.get('messageController')
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Close storage service
    const storage = this.instances.get('storageService')
    if (storage) {
      await storage.close()
    }
    
    // Close database pool
    const pool = this.instances.get('dbPool')
    if (pool) {
      await pool.end()
    }
    
    // Clear instances
    this.instances.clear()
  }
}

// Global container instance
export const container = new Container()