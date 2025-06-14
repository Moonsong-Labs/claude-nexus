import { ClaudeMessagesRequest, countSystemMessages } from '../../types/claude'

export type RequestType = 'query_evaluation' | 'inference'

/**
 * Domain entity representing a proxy request
 * Encapsulates business logic related to request processing
 */
export class ProxyRequest {
  private _requestType: RequestType | null = null
  
  constructor(
    public readonly raw: ClaudeMessagesRequest,
    public readonly host: string,
    public readonly requestId: string,
    public readonly apiKey?: string
  ) {}
  
  get isStreaming(): boolean {
    return this.raw.stream === true
  }
  
  get model(): string {
    return this.raw.model
  }
  
  get requestType(): RequestType {
    if (!this._requestType) {
      this._requestType = this.determineRequestType()
    }
    return this._requestType
  }
  
  get systemMessageCount(): number {
    return countSystemMessages(this.raw)
  }
  
  /**
   * Extract user content for notifications
   */
  getUserContent(): string {
    // Find the last user message
    const lastUserMessage = [...this.raw.messages]
      .reverse()
      .find(msg => msg.role === 'user')
    
    if (!lastUserMessage) return ''
    
    if (typeof lastUserMessage.content === 'string') {
      return lastUserMessage.content
    }
    
    // Handle array content
    const textContent = lastUserMessage.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n')
    
    return textContent
  }
  
  /**
   * Check if user content has changed from previous
   */
  hasUserContentChanged(previousContent: string): boolean {
    const currentContent = this.getUserContent()
    return currentContent !== previousContent
  }
  
  private determineRequestType(): RequestType {
    const systemCount = this.systemMessageCount
    
    // Query evaluation: exactly 1 system message
    // Inference: 0 or more than 1 system message
    return systemCount === 1 ? 'query_evaluation' : 'inference'
  }
  
  /**
   * Create request headers for Claude API
   */
  createHeaders(authHeaders: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...authHeaders
    }
  }
}