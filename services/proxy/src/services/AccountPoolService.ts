import { Pool } from 'pg'
import { ClaudeCredentials, PoolConfig, loadCredentials, getApiKey } from '../credentials.js'
import { TokenUsageService } from './TokenUsageService.js'
import { logger } from '../middleware/logger.js'
import { AuthResult } from './AuthenticationService.js'
import * as path from 'path'

interface PooledAccount {
  accountId: string
  credentialPath: string
  credentials: ClaudeCredentials
}

interface AccountUsageInfo {
  accountId: string
  outputTokens: number
  remainingTokens: number
  percentageUsed: number
  lastRequestTime?: Date
}

interface ConversationAccountMapping {
  [conversationId: string]: string // conversationId -> accountId
}

/**
 * Service for managing account pools and intelligent routing
 */
export class AccountPoolService {
  private pools = new Map<string, PooledAccount[]>()
  private accountCredentials = new Map<string, { path: string; credentials: ClaudeCredentials }>()
  private conversationAccountMap = new Map<string, string>()
  private tokenUsageService?: TokenUsageService
  
  constructor(
    private credentialsDir: string,
    private dbPool?: Pool
  ) {
    if (this.dbPool) {
      this.tokenUsageService = new TokenUsageService(this.dbPool)
    }
  }

  /**
   * Load a pool configuration from credentials
   */
  async loadPool(poolCredentialPath: string): Promise<void> {
    const poolCredentials = loadCredentials(poolCredentialPath)
    if (!poolCredentials || poolCredentials.type !== 'pool' || !poolCredentials.pool) {
      throw new Error(`Invalid pool credential file: ${poolCredentialPath}`)
    }

    const poolConfig = poolCredentials.pool
    const pooledAccounts: PooledAccount[] = []

    // Load each account in the pool
    for (const accountId of poolConfig.accounts) {
      // Find the credential file for this account
      const accountCredPath = await this.findAccountCredentialFile(accountId)
      if (!accountCredPath) {
        logger.warn(`Account ${accountId} not found for pool ${poolConfig.poolId}`)
        continue
      }

      const accountCreds = loadCredentials(accountCredPath)
      if (!accountCreds) {
        logger.warn(`Failed to load credentials for account ${accountId}`)
        continue
      }

      // Ensure account has an accountId
      if (!accountCreds.accountId) {
        accountCreds.accountId = accountId
      }

      pooledAccounts.push({
        accountId,
        credentialPath: accountCredPath,
        credentials: accountCreds,
      })

      // Cache account credentials for quick lookup
      this.accountCredentials.set(accountId, {
        path: accountCredPath,
        credentials: accountCreds,
      })
    }

    if (pooledAccounts.length === 0) {
      throw new Error(`No valid accounts found for pool ${poolConfig.poolId}`)
    }

    // Store the pool
    this.pools.set(poolCredentialPath, pooledAccounts)

    logger.info(`Loaded pool ${poolConfig.poolId} with ${pooledAccounts.length} accounts`, {
      metadata: {
        poolId: poolConfig.poolId,
        accounts: pooledAccounts.map(a => a.accountId),
        strategy: poolConfig.strategy || 'sticky',
      },
    })
  }

  /**
   * Get pool configuration from credential path
   */
  getPoolConfig(poolCredentialPath: string): PoolConfig | null {
    const poolCredentials = loadCredentials(poolCredentialPath)
    if (!poolCredentials || poolCredentials.type !== 'pool' || !poolCredentials.pool) {
      return null
    }
    return poolCredentials.pool
  }

  /**
   * Select an account from the pool for a request
   */
  async selectAccount(
    poolCredentialPath: string,
    conversationId?: string,
    requestId?: string
  ): Promise<AuthResult | null> {
    const poolAccounts = this.pools.get(poolCredentialPath)
    if (!poolAccounts || poolAccounts.length === 0) {
      return null
    }

    const poolConfig = this.getPoolConfig(poolCredentialPath)
    if (!poolConfig) {
      return null
    }

    const strategy = poolConfig.strategy || 'sticky'

    // For sticky routing, check if we already have an account for this conversation
    if (strategy === 'sticky' && conversationId) {
      const existingAccountId = this.conversationAccountMap.get(conversationId)
      if (existingAccountId) {
        const account = poolAccounts.find(a => a.accountId === existingAccountId)
        if (account) {
          // Check if account is still within limits
          const usage = await this.getAccountUsage(account.accountId)
          if (usage && usage.remainingTokens > 1000) {
            // Account still has capacity
            const authResult = await this.getAuthForAccount(account)
            if (authResult) {
              logger.debug(`Using sticky account ${account.accountId} for conversation ${conversationId}`, {
                metadata: {
                  requestId,
                  remainingTokens: usage.remainingTokens,
                },
              })
              return authResult
            }
          }
          // Account hit limits, will select a new one below
          logger.info(`Sticky account ${account.accountId} hit limits, selecting new account`, {
            metadata: {
              conversationId,
              requestId,
              remainingTokens: usage?.remainingTokens || 0,
            },
          })
        }
      }
    }

    // Select account based on strategy
    let selectedAccount: PooledAccount | null = null

    switch (strategy) {
      case 'least-used':
        selectedAccount = await this.selectLeastUsedAccount(poolAccounts)
        break
      
      case 'round-robin':
        selectedAccount = this.selectRoundRobinAccount(poolAccounts)
        break
      
      case 'sticky':
      default:
        // For sticky, select least used account for new conversations
        selectedAccount = await this.selectLeastUsedAccount(poolAccounts)
        break
    }

    if (!selectedAccount) {
      // All accounts exhausted
      if (poolConfig.fallbackBehavior === 'error') {
        return null
      }
      // Cycle to first account
      selectedAccount = poolAccounts[0]
    }

    // Get auth for selected account
    const authResult = await this.getAuthForAccount(selectedAccount)
    if (!authResult) {
      return null
    }

    // Store mapping for sticky routing
    if (conversationId && strategy === 'sticky') {
      this.conversationAccountMap.set(conversationId, selectedAccount.accountId)
    }

    logger.info(`Selected account ${selectedAccount.accountId} from pool`, {
      metadata: {
        requestId,
        conversationId,
        strategy,
        poolSize: poolAccounts.length,
      },
    })

    return authResult
  }

  /**
   * Get authentication result for a pooled account
   */
  private async getAuthForAccount(account: PooledAccount): Promise<AuthResult | null> {
    const apiKey = await getApiKey(account.credentialPath)
    if (!apiKey) {
      return null
    }

    const creds = account.credentials

    if (creds.type === 'oauth') {
      return {
        type: 'oauth',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'anthropic-beta': 'oauth-2025-04-20',
        },
        key: apiKey,
        betaHeader: 'oauth-2025-04-20',
        accountId: account.accountId,
      }
    } else {
      return {
        type: 'api_key',
        headers: {
          'x-api-key': apiKey,
        },
        key: apiKey,
        accountId: account.accountId,
      }
    }
  }

  /**
   * Select least used account based on token usage
   */
  private async selectLeastUsedAccount(accounts: PooledAccount[]): Promise<PooledAccount | null> {
    if (!this.tokenUsageService) {
      // No usage tracking, return first account
      return accounts[0]
    }

    let bestAccount: PooledAccount | null = null
    let maxRemainingTokens = -1

    for (const account of accounts) {
      const usage = await this.getAccountUsage(account.accountId)
      if (!usage) {
        // No usage data, assume account is fresh
        return account
      }

      if (usage.remainingTokens > maxRemainingTokens) {
        maxRemainingTokens = usage.remainingTokens
        bestAccount = account
      }
    }

    // Only return account if it has reasonable capacity remaining
    if (bestAccount && maxRemainingTokens > 1000) {
      return bestAccount
    }

    return null
  }

  /**
   * Simple round-robin selection (would need state tracking for true round-robin)
   */
  private selectRoundRobinAccount(accounts: PooledAccount[]): PooledAccount | null {
    // For now, just return a random account
    // In production, this would track the last used index
    const index = Math.floor(Math.random() * accounts.length)
    return accounts[index]
  }

  /**
   * Get token usage for an account
   */
  private async getAccountUsage(accountId: string): Promise<AccountUsageInfo | null> {
    if (!this.tokenUsageService) {
      return null
    }

    try {
      const usage = await this.tokenUsageService.getUsageWindow(accountId, 5) // 5-hour window
      const tokenLimit = 140000 // Claude's 5-hour limit

      return {
        accountId,
        outputTokens: usage.totalOutputTokens,
        remainingTokens: Math.max(0, tokenLimit - usage.totalOutputTokens),
        percentageUsed: (usage.totalOutputTokens / tokenLimit) * 100,
        lastRequestTime: usage.windowEnd,
      }
    } catch (error) {
      logger.error(`Failed to get usage for account ${accountId}`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Find credential file for an account ID
   */
  private async findAccountCredentialFile(accountId: string): Promise<string | null> {
    // Check cache first
    const cached = this.accountCredentials.get(accountId)
    if (cached) {
      return cached.path
    }

    // Search for files with this accountId
    // This is a simple implementation - in production, might want to index these
    const fs = await import('fs')
    const files = await fs.promises.readdir(this.credentialsDir)
    
    for (const file of files) {
      if (!file.endsWith('.credentials.json')) {
        continue
      }

      const filePath = path.join(this.credentialsDir, file)
      const creds = loadCredentials(filePath)
      
      if (creds && creds.accountId === accountId) {
        return filePath
      }
    }

    return null
  }

  /**
   * Clear conversation mapping for a conversation
   */
  clearConversationMapping(conversationId: string): void {
    this.conversationAccountMap.delete(conversationId)
  }

  /**
   * Get current pool status
   */
  async getPoolStatus(poolCredentialPath: string): Promise<{
    poolId: string
    accounts: Array<{
      accountId: string
      usage: AccountUsageInfo | null
    }>
    totalCapacity: number
    totalUsed: number
  } | null> {
    const poolConfig = this.getPoolConfig(poolCredentialPath)
    const poolAccounts = this.pools.get(poolCredentialPath)
    
    if (!poolConfig || !poolAccounts) {
      return null
    }

    const accountStatuses = await Promise.all(
      poolAccounts.map(async account => ({
        accountId: account.accountId,
        usage: await this.getAccountUsage(account.accountId),
      }))
    )

    const totalCapacity = poolAccounts.length * 140000 // 5-hour limit per account
    const totalUsed = accountStatuses.reduce(
      (sum, status) => sum + (status.usage?.outputTokens || 0),
      0
    )

    return {
      poolId: poolConfig.poolId,
      accounts: accountStatuses,
      totalCapacity,
      totalUsed,
    }
  }
}