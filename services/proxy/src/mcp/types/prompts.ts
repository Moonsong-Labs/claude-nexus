/**
 * Prompt-specific types for MCP server
 */

// File format types for YAML prompts
export interface YamlPromptFormat {
  name: string
  description?: string
  template: string
}

// Sync status for file-based sync
export interface SyncStatus {
  repository: string
  branch: string
  lastSyncAt?: Date
  lastCommitSha?: string
  lastError?: string
  syncStatus: 'pending' | 'syncing' | 'success' | 'error' | 'never_synced'
}
