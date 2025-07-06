/**
 * Prompt-specific types for MCP server
 */

export interface McpPrompt {
  id: string
  promptId: string
  name: string
  description?: string
  content: string
  arguments?: PromptArgument[]
  metadata?: Record<string, any>
  githubPath: string
  githubSha?: string
  githubUrl?: string
  version: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  syncedAt: Date
}

export interface PromptArgument {
  name: string
  type?: string
  description?: string
  required?: boolean
  default?: any
}

export interface PromptFilter {
  search?: string
  active?: boolean
  limit?: number
  offset?: number
}

export interface PromptUsage {
  promptId: string
  domain?: string
  accountId?: string
  requestId?: string
  arguments?: Record<string, any>
  usedAt: Date
}

export interface SyncStatus {
  id: string
  repository: string
  branch: string
  lastSyncAt?: Date
  lastCommitSha?: string
  lastError?: string
  syncStatus: 'pending' | 'syncing' | 'success' | 'error'
  createdAt: Date
  updatedAt: Date
}

// File format types
export interface YamlPromptFormat {
  id: string
  name: string
  description?: string
  arguments?: Array<{
    name: string
    type?: string
    description?: string
    required?: boolean
    default?: any
  }>
  content: string
  metadata?: Record<string, any>
}

export interface JsonPromptFormat {
  id: string
  name: string
  description?: string
  arguments?: PromptArgument[]
  content: string
  metadata?: Record<string, any>
}

export interface MarkdownFrontmatter {
  id: string
  name: string
  description?: string
  arguments?: PromptArgument[]
  metadata?: Record<string, any>
}
