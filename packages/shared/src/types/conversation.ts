/**
 * Conversation tracking types for the Claude Nexus Proxy
 */

/**
 * Conversation tracking data for linking messages across requests
 */
export interface ConversationData {
  /** SHA-256 hash of the current message content */
  currentMessageHash: string

  /** SHA-256 hash of the parent message content (null for first message) */
  parentMessageHash: string | null

  /** UUID identifying the conversation thread */
  conversationId: string

  /** SHA-256 hash of the system prompt (null if no system prompt) */
  systemHash: string | null

  /** Branch identifier (defaults to 'main', auto-generated for new branches) */
  branchId?: string

  /** Direct link to the parent request in the conversation chain */
  parentRequestId?: string

  /** Links sub-task requests to their parent task */
  parentTaskRequestId?: string

  /** Boolean flag indicating if a request is a confirmed sub-task */
  isSubtask?: boolean
}
