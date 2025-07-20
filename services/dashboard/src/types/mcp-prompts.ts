/**
 * Type definitions for MCP prompts dashboard
 */

/**
 * MCP prompt data as returned by the API
 */
export interface McpPrompt {
  /** Unique identifier for the prompt (typically the filename without extension) */
  promptId: string
  /** Display name of the prompt */
  name: string
  /** Optional description of the prompt's purpose */
  description?: string
}

/**
 * Response from the MCP prompts list API
 */
export interface McpPromptsResponse {
  /** Array of prompts */
  prompts: McpPrompt[]
  /** Total count of prompts (for pagination) */
  total: number
}

/**
 * MCP sync status information
 */
export interface McpSyncStatus {
  /** Current sync status */
  sync_status: 'never_synced' | 'syncing' | 'success' | 'error'
  /** Timestamp of last successful sync */
  last_sync_at?: string
  /** Error message from last failed sync */
  last_error?: string
}

/**
 * Sync API response
 */
export interface McpSyncResponse {
  success: boolean
  error?: string
}

/** Default page size for prompts listing */
export const PROMPTS_PAGE_SIZE = 20
