/**
 * Service for syncing prompts from GitHub repository to local filesystem
 */

import { Octokit } from '@octokit/rest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { config } from '@claude-nexus/shared'
import { logger } from '../middleware/logger.js'
import type { PromptRegistryService } from './PromptRegistryService.js'

// Constants
const SYNC_INFO_FILENAME = 'sync-info.json'
const ALLOWED_PROMPT_EXTENSIONS = ['.yaml', '.yml'] as const
const SERVICE_NAME = 'GitHubSyncService'

interface SyncInfo {
  repository: string
  branch: string
  lastCommitSha: string
  lastSyncAt: string
  syncStatus: 'success' | 'error'
  lastError?: string
}

interface PromptFile {
  filename: string
  content: string
}

export class GitHubSyncService {
  private octokit: Octokit
  private readonly owner: string
  private readonly repo: string
  private readonly branch: string
  private readonly path: string
  private readonly promptsDir: string
  private readonly syncInfoPath: string

  constructor(
    private promptRegistry: PromptRegistryService,
    promptsDir: string = 'prompts'
  ) {
    if (!config.mcp.github.token) {
      throw new Error('GitHub token is required for MCP sync')
    }

    this.octokit = new Octokit({
      auth: config.mcp.github.token,
    })

    this.owner = config.mcp.github.owner
    this.repo = config.mcp.github.repo
    this.branch = config.mcp.github.branch
    // Remove trailing slash from path if present
    this.path = config.mcp.github.path.replace(/\/$/, '')

    this.promptsDir = path.resolve(promptsDir)
    this.syncInfoPath = path.join(path.dirname(this.promptsDir), SYNC_INFO_FILENAME)
  }

  /**
   * Helper method to log errors consistently
   */
  private logError(message: string, error: unknown, metadata?: Record<string, unknown>): void {
    logger.error(message, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        code: error instanceof Error && 'code' in error ? (error as any).code : undefined,
      },
      metadata: {
        service: SERVICE_NAME,
        ...metadata,
      },
    })
  }

  /**
   * Validates if a file is a valid prompt file
   */
  private isValidPromptFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return ALLOWED_PROMPT_EXTENSIONS.includes(ext as any)
  }

  /**
   * Checks if filename contains path traversal characters
   */
  private hasPathTraversalChars(filename: string): boolean {
    return filename.includes('/') || filename.includes('\\')
  }

  async syncRepository(): Promise<void> {
    logger.info(`Starting GitHub sync from ${this.owner}/${this.repo}`, {
      metadata: {
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
        path: this.path,
      },
    })

    try {
      // Get the latest commit SHA
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
      })
      const latestSha = ref.object.sha

      // Check if we need to sync
      const currentSyncInfo = await this.getSyncInfo()
      if (currentSyncInfo?.lastCommitSha === latestSha) {
        logger.info('Repository is already up to date')
        return
      }

      // Ensure prompts directory exists
      await fs.mkdir(this.promptsDir, { recursive: true })

      // Fetch prompts first before any destructive operations
      const prompts = await this.fetchPrompts()
      logger.info(`Found ${prompts.length} prompt files`)

      // Only proceed with sync if we successfully fetched prompts
      if (prompts.length === 0) {
        logger.warn('No prompts found in GitHub repository, skipping sync to prevent data loss')

        // Update sync status to reflect successful connection but no prompts
        await this.updateSyncInfo({
          repository: `${this.owner}/${this.repo}`,
          branch: this.branch,
          lastSyncAt: new Date().toISOString(),
          lastCommitSha: latestSha,
          syncStatus: 'success',
          lastError: undefined,
        })

        return
      }

      // Create a set of valid filenames that will be synced
      const validFilenames = new Set<string>()
      for (const prompt of prompts) {
        const safeFilename = path.basename(prompt.filename)
        if (this.isValidPromptFile(safeFilename) && !this.hasPathTraversalChars(safeFilename)) {
          validFilenames.add(safeFilename)
        }
      }

      // Remove only files that will be replaced (not all YAML files)
      const existingFiles = await fs.readdir(this.promptsDir)
      for (const file of existingFiles) {
        if (validFilenames.has(file)) {
          await fs.unlink(path.join(this.promptsDir, file))
        }
      }

      let successCount = 0
      for (const prompt of prompts) {
        try {
          // Sanitize filename to prevent path traversal attacks
          const safeFilename = path.basename(prompt.filename)

          // Validate file for security and format
          if (!this.isValidPromptFile(safeFilename)) {
            logger.warn(`Skipping non-YAML file: ${prompt.filename}`)
            continue
          }

          if (this.hasPathTraversalChars(safeFilename)) {
            logger.warn(`Skipping file with invalid characters in name: ${prompt.filename}`)
            continue
          }

          await fs.writeFile(path.join(this.promptsDir, safeFilename), prompt.content, 'utf-8')
          successCount++
        } catch (error) {
          this.logError(`Failed to write prompt ${prompt.filename}`, error, {
            filename: prompt.filename,
          })
        }
      }

      // Reload prompts in registry
      await this.promptRegistry.loadPrompts()

      // Update sync info
      await this.updateSyncInfo({
        repository: `${this.owner}/${this.repo}`,
        branch: this.branch,
        lastCommitSha: latestSha,
        lastSyncAt: new Date().toISOString(),
        syncStatus: 'success',
      })

      logger.info(`GitHub sync completed. Saved ${successCount}/${prompts.length} prompts`)

      // Log files that were preserved (not in GitHub)
      const finalFiles = await fs.readdir(this.promptsDir)
      const preservedFiles = finalFiles.filter(
        f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !validFilenames.has(f)
      )
      if (preservedFiles.length > 0) {
        logger.info(
          `Preserved ${preservedFiles.length} local-only prompt files: ${preservedFiles.join(', ')}`
        )
      }
    } catch (error) {
      this.logError('GitHub sync failed', error, {
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
      })

      await this.updateSyncInfo({
        repository: `${this.owner}/${this.repo}`,
        branch: this.branch,
        lastCommitSha: '',
        lastSyncAt: new Date().toISOString(),
        syncStatus: 'error',
        lastError: error instanceof Error ? error.message : 'Unknown error',
      })

      // Still throw to maintain backward compatibility with SyncScheduler
      throw error
    }
  }

  private async fetchPrompts(): Promise<PromptFile[]> {
    const prompts: PromptFile[] = []

    try {
      // List contents of the prompts directory
      logger.debug('Fetching directory contents', {
        metadata: {
          owner: this.owner,
          repo: this.repo,
          path: this.path,
          ref: this.branch,
        },
      })

      const { data: contents } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: this.path,
        ref: this.branch,
      })

      if (!Array.isArray(contents)) {
        logger.warn('Expected directory listing but got single file')
        return prompts
      }

      // Process each file
      for (const item of contents) {
        if (item.type !== 'file') {
          continue
        }

        // Only process YAML files
        if (!this.isValidPromptFile(item.name)) {
          continue
        }

        try {
          // Fetch file content
          const { data: file } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: item.path,
            ref: this.branch,
          })

          if ('content' in file && file.content) {
            const content = Buffer.from(file.content, 'base64').toString('utf-8')
            prompts.push({
              filename: item.name,
              content,
            })
          }
        } catch (error) {
          this.logError(`Failed to fetch file ${item.path}`, error, {
            filePath: item.path,
          })
        }
      }
    } catch (error) {
      this.logError('Error fetching prompts from GitHub', error, {
        path: this.path,
        ref: this.branch,
      })
      throw error
    }

    return prompts
  }

  private async getSyncInfo(): Promise<SyncInfo | null> {
    try {
      const content = await fs.readFile(this.syncInfoPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private async updateSyncInfo(info: SyncInfo): Promise<void> {
    try {
      await fs.writeFile(this.syncInfoPath, JSON.stringify(info, null, 2), 'utf-8')
    } catch (error) {
      this.logError('Error updating sync info', error)
    }
  }

  async getSyncStatus(): Promise<{
    repository: string
    branch: string
    sync_status: string
    last_sync_at: Date | null
    last_commit_sha: string | null
    last_error: string | null
  } | null> {
    const syncInfo = await this.getSyncInfo()
    if (!syncInfo) {
      return {
        repository: `${this.owner}/${this.repo}`,
        branch: this.branch,
        sync_status: 'never_synced',
        last_sync_at: null,
        last_commit_sha: null,
        last_error: null,
      }
    }

    return {
      repository: syncInfo.repository,
      branch: syncInfo.branch,
      sync_status: syncInfo.syncStatus,
      last_sync_at: new Date(syncInfo.lastSyncAt),
      last_commit_sha: syncInfo.lastCommitSha,
      last_error: syncInfo.lastError || null,
    }
  }
}
