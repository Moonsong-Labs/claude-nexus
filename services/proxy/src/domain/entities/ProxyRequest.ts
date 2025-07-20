import { ClaudeMessagesRequest, countSystemMessages, ClaudeTextContent } from '@claude-nexus/shared'

export type RequestType = 'query_evaluation' | 'inference' | 'quota'

/**
 * Threshold for determining request type based on system message count.
 * Requests with 2 or more system messages are considered "inference" requests.
 */
const INFERENCE_SYSTEM_MESSAGE_THRESHOLD = 2

/**
 * Domain entity representing a proxy request.
 * Encapsulates business logic related to request processing, including:
 * - Request type determination based on system message count
 * - User content extraction for notifications
 * - Header creation for Claude API
 */
export class ProxyRequest {
  private _requestType: RequestType | null = null

  constructor(
    public readonly raw: ClaudeMessagesRequest,
    public readonly host: string,
    public readonly requestId: string,
    public readonly apiKey?: string
  ) {}

  /**
   * Indicates whether the request is for streaming responses
   */
  get isStreaming(): boolean {
    return this.raw.stream === true
  }

  /**
   * The Claude model being requested
   */
  get model(): string {
    return this.raw.model
  }

  /**
   * Determines the type of request (query_evaluation, inference, or quota)
   */
  get requestType(): RequestType {
    if (!this._requestType) {
      this._requestType = this.determineRequestType()
    }
    return this._requestType
  }

  /**
   * Count of system messages in the request
   */
  get systemMessageCount(): number {
    return countSystemMessages(this.raw)
  }

  /**
   * Extract text content from the last user message
   * @param filterSystemReminders - Whether to filter out system reminders (first and last text blocks) for inference requests
   * @returns The extracted text content
   */
  private extractUserTextContent(filterSystemReminders: boolean = false): string {
    // Find the last user message
    const lastUserMessage = [...this.raw.messages].reverse().find(msg => msg.role === 'user')

    if (!lastUserMessage) {
      return ''
    }

    if (typeof lastUserMessage.content === 'string') {
      return lastUserMessage.content
    }

    // Handle array content - filter for text content only
    let textContentArray = lastUserMessage.content.filter(
      (c): c is ClaudeTextContent => c.type === 'text'
    )

    // Apply system reminder filtering if requested
    if (filterSystemReminders) {
      textContentArray = this.filterSystemReminders(textContentArray)
    }

    return textContentArray.map(c => c.text).join('\n')
  }

  /**
   * Filter out system reminders from text content array.
   * For inference requests with more than 2 text blocks, removes the first and last blocks
   * which are typically system reminders.
   * @param contentArray - Array of text content blocks
   * @returns Filtered array
   */
  private filterSystemReminders(contentArray: ClaudeTextContent[]): ClaudeTextContent[] {
    // Only filter for inference requests with more than 2 text content items
    if (this.requestType === 'inference' && contentArray.length > 2) {
      return contentArray.slice(1, -1)
    }
    return contentArray
  }

  /**
   * Extract user content from the last user message
   * @returns The full user content without any filtering
   */
  getUserContent(): string {
    return this.extractUserTextContent(false)
  }

  /**
   * Extract user content for notifications.
   * For inference requests, filters out system reminders (first and last text blocks).
   * @returns The user content suitable for notifications
   */
  getUserContentForNotification(): string {
    return this.extractUserTextContent(true)
  }

  /**
   * Check if user content has changed from previous content
   * @param previousContent - The previous content to compare against
   * @returns True if the content has changed
   */
  hasUserContentChanged(previousContent: string): boolean {
    const currentContent = this.getUserContentForNotification()
    return currentContent !== previousContent
  }

  /**
   * Determine the type of request based on content and system message count
   * @returns The determined request type
   */
  private determineRequestType(): RequestType {
    // Check if this is a quota query
    const userContent = this.getUserContent()
    if (userContent && userContent.trim().toLowerCase() === 'quota') {
      return 'quota'
    }

    // Determine request type based on system message count
    const systemMessageCount = this.systemMessageCount

    // Requests with fewer than threshold system messages are query_evaluation
    if (systemMessageCount < INFERENCE_SYSTEM_MESSAGE_THRESHOLD) {
      return 'query_evaluation'
    }

    // Requests with threshold or more system messages are inference
    return 'inference'
  }

  /**
   * Create request headers for Claude API.
   * Filters out x-api-key header and adds required Claude API headers.
   * @param authHeaders - Authentication headers to include
   * @returns Headers object ready for Claude API request
   */
  createHeaders(authHeaders: Record<string, string>): Record<string, string> {
    // Filter out x-api-key to ensure it's never sent to Claude
    const { 'x-api-key': _, ...filteredAuthHeaders } = authHeaders

    return {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...filteredAuthHeaders,
    }
  }
}
