/**
 * In-memory prompt registry service that loads prompts from YAML files
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as Handlebars from 'handlebars'
import * as yaml from 'js-yaml'
import { watch } from 'node:fs'

interface PromptFile {
  name?: string
  description?: string
  template: string
}

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
  private watcher?: fs.FileHandle

  constructor(promptDir: string = 'prompts') {
    this.promptDir = path.resolve(promptDir)
  }

  public async initialize(): Promise<void> {
    console.log('Initializing PromptRegistryService...')

    // Ensure prompts directory exists
    await fs.mkdir(this.promptDir, { recursive: true })

    await this.loadPrompts()

    // Watch for changes in the prompts directory
    this.startWatching()
  }

  public async loadPrompts(): Promise<void> {
    console.log(`Loading prompts from ${this.promptDir}...`)
    try {
      const tempCache = new Map<string, PromptCacheEntry>()
      const files = await fs.readdir(this.promptDir)

      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const promptId = path.basename(file, path.extname(file))
          const filePath = path.join(this.promptDir, file)

          try {
            const fileContent = await fs.readFile(filePath, 'utf-8')
            const parsed = yaml.load(fileContent) as PromptFile

            if (typeof parsed.template !== 'string') {
              console.warn(`WARN: Skipping ${file}. 'template' key is missing or not a string.`)
              continue
            }

            // Pre-compile the template for performance
            const compiledTemplate = Handlebars.compile(parsed.template, {
              noEscape: true, // Prompts are not HTML
              strict: false, // Allow missing variables
            })

            tempCache.set(promptId, {
              name: parsed.name || promptId,
              description: parsed.description,
              rawTemplate: parsed.template,
              compiledTemplate,
            })
          } catch (e) {
            console.error(`Error processing prompt file ${file}:`, e)
          }
        }
      }

      // Atomic swap to ensure the cache is always in a consistent state
      this.promptCache = tempCache
      console.log(`Successfully loaded ${this.promptCache.size} prompts.`)
    } catch (error) {
      console.error('Failed to read prompts directory:', error)
      this.promptCache.clear()
    }
  }

  private startWatching(): void {
    try {
      const watcher = watch(this.promptDir, { recursive: false }, async (eventType, filename) => {
        if (filename && (filename.endsWith('.yaml') || filename.endsWith('.yml'))) {
          console.log(`Prompt file ${eventType}: ${filename}`)
          // Debounce reloads to avoid multiple rapid reloads
          setTimeout(() => this.loadPrompts(), 500)
        }
      })

      // Keep watcher reference to close it later if needed
      this.watcher = watcher as any
    } catch (error) {
      console.error('Failed to start watching prompts directory:', error)
    }
  }

  public renderPrompt(promptId: string, context: Record<string, any> = {}): string | null {
    const entry = this.promptCache.get(promptId)
    if (!entry) {
      return null
    }

    try {
      return entry.compiledTemplate(context)
    } catch (error) {
      console.error(`Error rendering prompt ${promptId}:`, error)
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
    if (this.watcher) {
      try {
        await (this.watcher as any).close()
      } catch (error) {
        console.error('Error closing file watcher:', error)
      }
    }
  }
}
