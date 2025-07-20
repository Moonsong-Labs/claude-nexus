import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { loadCredentials, ClaudeCredentials } from '../credentials'
import { logger } from '../middleware/logger'

// Time constants for better readability
const ONE_MINUTE_MS = 60 * 1000
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const ONE_DAY_MS = 24 * ONE_HOUR_MS

export interface CredentialStatus {
  domain: string
  file: string
  type: 'api_key' | 'oauth'
  status: 'valid' | 'expired' | 'expiring_soon' | 'missing_refresh_token' | 'invalid' | 'error'
  message: string
  expiresAt?: Date
  expiresIn?: string
  hasClientApiKey: boolean
  hasSlackConfig: boolean
}

export class CredentialStatusService {
  private credentialsDir: string

  constructor(credentialsDir: string = process.env.CREDENTIALS_DIR || 'credentials') {
    // Resolve the credentials directory path
    if (credentialsDir.startsWith('~')) {
      this.credentialsDir = join(homedir(), credentialsDir.slice(1))
    } else if (credentialsDir.startsWith('/') || credentialsDir.includes(':')) {
      this.credentialsDir = credentialsDir
    } else {
      this.credentialsDir = resolve(process.cwd(), credentialsDir)
    }
  }

  /**
   * Check the status of all credential files in the credentials directory
   */
  async checkAllCredentials(): Promise<CredentialStatus[]> {
    const statuses: CredentialStatus[] = []

    try {
      // Check if directory exists
      try {
        await fs.access(this.credentialsDir)
      } catch {
        logger.info('Credentials directory does not exist', {
          metadata: { credentialsDir: this.credentialsDir },
        })
        return statuses
      }

      // Get all .credentials.json files
      const files = (await fs.readdir(this.credentialsDir))
        .filter(file => file.endsWith('.credentials.json'))
        .sort()

      logger.info(`Found ${files.length} credential files to check`, {
        metadata: { credentialsDir: this.credentialsDir },
      })

      for (const file of files) {
        const status = await this.checkCredentialFile(file)
        statuses.push(status)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to read credentials directory', {
        error: { message: errorMessage },
        metadata: { credentialsDir: this.credentialsDir },
      })
    }

    return statuses
  }

  /**
   * Check the status of a single credential file
   */
  private async checkCredentialFile(filename: string): Promise<CredentialStatus> {
    const domain = filename.replace('.credentials.json', '')
    const filePath = join(this.credentialsDir, filename)

    try {
      // Check if file exists and is readable
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) {
        return {
          domain,
          file: filename,
          type: 'api_key',
          status: 'error',
          message: 'Not a file',
          hasClientApiKey: false,
          hasSlackConfig: false,
        }
      }

      // Load credentials
      const credentials = loadCredentials(filePath)
      if (!credentials) {
        return {
          domain,
          file: filename,
          type: 'api_key',
          status: 'invalid',
          message: 'Failed to load credentials',
          hasClientApiKey: false,
          hasSlackConfig: false,
        }
      }

      // Check credential type and status
      if (credentials.type === 'oauth' && credentials.oauth) {
        return this.checkOAuthStatus(domain, filename, credentials)
      } else if (credentials.type === 'api_key' && credentials.api_key) {
        return {
          domain,
          file: filename,
          type: 'api_key',
          status: 'valid',
          message: 'API key configured',
          hasClientApiKey: !!credentials.client_api_key,
          hasSlackConfig: !!credentials.slack,
        }
      } else {
        return {
          domain,
          file: filename,
          type: credentials.type || 'api_key',
          status: 'invalid',
          message: `Missing ${credentials.type === 'oauth' ? 'OAuth data' : 'API key'}`,
          hasClientApiKey: !!credentials.client_api_key,
          hasSlackConfig: !!credentials.slack,
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to check credential file: ${filename}`, {
        error: { message: errorMessage },
        metadata: { domain, filePath },
      })
      return {
        domain,
        file: filename,
        type: 'api_key',
        status: 'error',
        message: errorMessage,
        hasClientApiKey: false,
        hasSlackConfig: false,
      }
    }
  }

  /**
   * Check OAuth credential status
   */
  private checkOAuthStatus(
    domain: string,
    filename: string,
    credentials: ClaudeCredentials
  ): CredentialStatus {
    const oauth = credentials.oauth
    if (!oauth) {
      return {
        domain,
        file: filename,
        type: 'oauth',
        status: 'invalid',
        message: 'OAuth credentials missing',
        hasClientApiKey: !!credentials.client_api_key,
        hasSlackConfig: !!credentials.slack,
      }
    }
    const now = Date.now()
    const expiresAt = oauth.expiresAt || 0
    const expiresIn = expiresAt - now

    // Check if refresh token is available
    if (!oauth.refreshToken) {
      return {
        domain,
        file: filename,
        type: 'oauth',
        status: 'missing_refresh_token',
        message: 'No refresh token - re-authentication required when token expires',
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        hasClientApiKey: !!credentials.client_api_key,
        hasSlackConfig: !!credentials.slack,
      }
    }

    // Check expiration status
    if (now >= expiresAt) {
      return {
        domain,
        file: filename,
        type: 'oauth',
        status: 'expired',
        message: 'Token expired - will refresh on next use',
        expiresAt: new Date(expiresAt),
        hasClientApiKey: !!credentials.client_api_key,
        hasSlackConfig: !!credentials.slack,
      }
    }

    // Check if expiring soon (within 24 hours)
    if (expiresIn <= ONE_DAY_MS) {
      const hours = Math.floor(expiresIn / ONE_HOUR_MS)
      const minutes = Math.floor((expiresIn % ONE_HOUR_MS) / ONE_MINUTE_MS)

      return {
        domain,
        file: filename,
        type: 'oauth',
        status: 'expiring_soon',
        message: `Token expiring soon - will refresh on next use`,
        expiresAt: new Date(expiresAt),
        expiresIn: `${hours}h ${minutes}m`,
        hasClientApiKey: !!credentials.client_api_key,
        hasSlackConfig: !!credentials.slack,
      }
    }

    // Token is valid
    const days = Math.floor(expiresIn / ONE_DAY_MS)
    const hours = Math.floor((expiresIn % ONE_DAY_MS) / ONE_HOUR_MS)

    return {
      domain,
      file: filename,
      type: 'oauth',
      status: 'valid',
      message: 'OAuth token valid',
      expiresAt: new Date(expiresAt),
      expiresIn: `${days}d ${hours}h`,
      hasClientApiKey: !!credentials.client_api_key,
      hasSlackConfig: !!credentials.slack,
    }
  }

  /**
   * Group credential statuses by their status type
   */
  private groupStatusesByType(statuses: CredentialStatus[]): Record<string, CredentialStatus[]> {
    return statuses.reduce(
      (groups, status) => {
        const key = status.status
        if (!groups[key]) {
          groups[key] = []
        }
        groups[key].push(status)
        return groups
      },
      {} as Record<string, CredentialStatus[]>
    )
  }

  /**
   * Format a single credential status line
   */
  private formatStatusLine(status: CredentialStatus): string {
    const extras: string[] = []
    if (status.hasClientApiKey) {
      extras.push('client_key')
    }
    if (status.hasSlackConfig) {
      extras.push('slack')
    }

    let line = `  ${status.domain}: ${status.type} - ${status.status}`
    if (status.expiresIn) {
      line += ` (expires in ${status.expiresIn})`
    }
    if (extras.length > 0) {
      line += ` [${extras.join(', ')}]`
    }
    return line
  }

  /**
   * Get credential statuses that need attention
   */
  private getStatusesNeedingAttention(statuses: CredentialStatus[]): CredentialStatus[] {
    return statuses.filter(
      s =>
        s.status === 'expired' ||
        s.status === 'missing_refresh_token' ||
        s.status === 'invalid' ||
        s.status === 'error'
    )
  }

  /**
   * Format credential status for logging
   */
  formatStatusForLogging(statuses: CredentialStatus[]): string[] {
    const lines: string[] = []

    // Group by status
    const byStatus = this.groupStatusesByType(statuses)

    // Summary
    lines.push(`Credential Status Summary:`)
    lines.push(`  Total: ${statuses.length} domains`)
    lines.push(`  Valid: ${byStatus.valid?.length || 0}`)

    const statusTypes = ['expired', 'expiring_soon', 'missing_refresh_token', 'invalid', 'error']
    for (const statusType of statusTypes) {
      const count = byStatus[statusType]?.length || 0
      if (count > 0) {
        const label = statusType
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
        lines.push(`  ${label}: ${count}`)
      }
    }

    // Details for each domain
    lines.push(`\nDomain Details:`)
    for (const status of statuses) {
      lines.push(this.formatStatusLine(status))

      if (status.status !== 'valid') {
        lines.push(`    → ${status.message}`)
      }
    }

    // Warnings for domains that need attention
    const needsAttention = this.getStatusesNeedingAttention(statuses)

    if (needsAttention.length > 0) {
      lines.push(`\n⚠️  Domains Needing Attention:`)
      for (const status of needsAttention) {
        lines.push(`  - ${status.domain}: ${status.message}`)
        if (status.status === 'expired' || status.status === 'missing_refresh_token') {
          lines.push(`    Run: bun run scripts/oauth-login.ts credentials/${status.file}`)
        }
      }
    }

    return lines
  }
}
