/**
 * In-memory prompt registry service that loads prompts from YAML files
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as Handlebars from 'handlebars'
import * as yaml from 'js-yaml'
import { watch, type FSWatcher } from 'node:fs'
import { logger } from '../middleware/logger.js'
import { YamlPromptFormat } from './types/prompts.js'
import { config } from '@claude-nexus/shared/config'

// Constants
const SUPPORTED_EXTENSIONS = ['.yaml', '.yml']
const DEFAULT_DEBOUNCE_DELAY_MS = 500

interface PromptCacheEntry {
  name: string
  description?: string
  rawTemplate: string
  compiledTemplate: Handlebars.TemplateDelegate
}

export interface PromptInfo {
  promptId: string
  name: string
  description?: string
  template: string
}

export class PromptRegistryService {
  private promptCache = new Map<string, PromptCacheEntry>()
  private promptDir: string
  private watcher?: FSWatcher
  private reloadTimeoutId?: NodeJS.Timeout
  private isLoadingPrompts = false

  constructor(promptDir: string = 'prompts') {
    this.promptDir = path.resolve(promptDir)
  }

  public async initialize(): Promise<void> {
    logger.info('Initializing PromptRegistryService', {
      metadata: { promptDir: this.promptDir, watchEnabled: config.mcp.watchFiles },
    })

    // Ensure prompts directory exists
    await fs.mkdir(this.promptDir, { recursive: true })

    await this.loadPrompts()

    // Watch for changes in the prompts directory if enabled
    if (config.mcp.watchFiles) {
      this.startWatching()
    }
  }

  public async loadPrompts(): Promise<void> {
    logger.info('Loading prompts', { metadata: { promptDir: this.promptDir } })

    try {
      const tempCache = new Map<string, PromptCacheEntry>()
      const files = await fs.readdir(this.promptDir)

      for (const file of files) {
        if (SUPPORTED_EXTENSIONS.some(ext => file.endsWith(ext))) {
          const promptId = path.basename(file, path.extname(file))
          const filePath = path.join(this.promptDir, file)

          try {
            const fileContent = await fs.readFile(filePath, 'utf-8')
            const parsed = yaml.load(fileContent) as YamlPromptFormat

            if (typeof parsed.template !== 'string') {
              logger.warn('Skipping invalid prompt file', {
                metadata: { file, reason: 'template key is missing or not a string' },
              })
              continue
            }

            // Pre-compile the template for performance
            const compiledTemplate = Handlebars.compile(parsed.template, {
              noEscape: true, // Prompts are not HTML
              strict: false, // Allow missing variables
            })

            tempCache.set(promptId, {
              name: parsed.name || promptId, // Use name from YAML, fallback to file ID
              description: parsed.description,
              rawTemplate: parsed.template,
              compiledTemplate,
            })
          } catch (e) {
            logger.error('Error processing prompt file', {
              metadata: { file, error: e instanceof Error ? e.message : String(e) },
            })
          }
        }
      }

      // Atomic swap to ensure the cache is always in a consistent state
      this.promptCache = tempCache
      logger.info('Successfully loaded prompts', {
        metadata: { count: this.promptCache.size },
      })
    } catch (error) {
      logger.error('Failed to read prompts directory', {
        metadata: {
          promptDir: this.promptDir,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      // Don't clear the cache on read failure - preserve the last known good state
    }
  }

  private startWatching(): void {
    try {
      const watcher = watch(this.promptDir, { recursive: false }, (eventType, filename) => {
        if (filename && SUPPORTED_EXTENSIONS.some(ext => filename.endsWith(ext))) {
          this.handleFileChange(eventType, filename)
        }
      })

      this.watcher = watcher
      logger.info('Started watching prompts directory', {
        metadata: { promptDir: this.promptDir },
      })
    } catch (error) {
      logger.error('Failed to start watching prompts directory', {
        metadata: {
          promptDir: this.promptDir,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  private handleFileChange(eventType: string, filename: string): void {
    logger.info('Prompt file changed', {
      metadata: { eventType, filename },
    })

    // Clear any existing reload timeout
    if (this.reloadTimeoutId) {
      clearTimeout(this.reloadTimeoutId)
    }

    // Schedule a new reload with debouncing
    this.reloadTimeoutId = setTimeout(async () => {
      if (this.isLoadingPrompts) {
        logger.debug('Skipping prompt reload: a reload is already in progress')
        return
      }

      this.isLoadingPrompts = true
      try {
        await this.loadPrompts()
      } catch (error) {
        logger.error('Error during scheduled prompt reload', {
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
      } finally {
        this.isLoadingPrompts = false
      }
    }, DEFAULT_DEBOUNCE_DELAY_MS)
  }

  public renderPrompt(promptId: string, context: Record<string, any> = {}): string | null {
    const entry = this.promptCache.get(promptId)
    if (!entry) {
      return null
    }

    try {
      return entry.compiledTemplate(context)
    } catch (error) {
      logger.error('Error rendering prompt', {
        metadata: {
          promptId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      return null
    }
  }

  public getPrompt(promptId: string): PromptInfo | null {
    const entry = this.promptCache.get(promptId)
    if (!entry) {
      return null
    }

    return {
      promptId,
      name: entry.name,
      description: entry.description,
      template: entry.rawTemplate,
    }
  }

  public listPrompts(): PromptInfo[] {
    return Array.from(this.promptCache.entries()).map(([promptId, entry]) => ({
      promptId,
      name: entry.name,
      description: entry.description,
      template: entry.rawTemplate,
    }))
  }

  public async stop(): Promise<void> {
    // Clear any pending reload timeout
    if (this.reloadTimeoutId) {
      clearTimeout(this.reloadTimeoutId)
      this.reloadTimeoutId = undefined
    }

    // Close the file watcher
    if (this.watcher) {
      try {
        this.watcher.close()
        logger.info('Stopped watching prompts directory')
      } catch (error) {
        logger.error('Error closing file watcher', {
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
      }
    }
  }
}
