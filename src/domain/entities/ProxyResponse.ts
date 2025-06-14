import { ClaudeMessagesResponse, ClaudeStreamEvent, hasToolUse } from '../../types/claude'

/**
 * Domain entity representing a proxy response
 * Encapsulates response processing logic
 */
export class ProxyResponse {
  private _inputTokens: number = 0
  private _outputTokens: number = 0
  private _toolCallCount: number = 0
  private _content: string = ''
  
  constructor(
    public readonly requestId: string,
    public readonly streaming: boolean
  ) {}
  
  get inputTokens(): number {
    return this._inputTokens
  }
  
  get outputTokens(): number {
    return this._outputTokens
  }
  
  get totalTokens(): number {
    return this._inputTokens + this._outputTokens
  }
  
  get toolCallCount(): number {
    return this._toolCallCount
  }
  
  get content(): string {
    return this._content
  }
  
  /**
   * Process a non-streaming response
   */
  processResponse(response: ClaudeMessagesResponse): void {
    this._inputTokens = response.usage?.input_tokens || 0
    this._outputTokens = response.usage?.output_tokens || 0
    
    // Count tool calls
    if (response.content && hasToolUse(response.content)) {
      this._toolCallCount = response.content.filter(c => c.type === 'tool_use').length
    }
    
    // Extract text content
    this._content = response.content
      ?.filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n') || ''
  }
  
  /**
   * Process a streaming event
   */
  processStreamEvent(event: ClaudeStreamEvent): void {
    switch (event.type) {
      case 'message_start':
        if (event.message?.usage?.input_tokens) {
          this._inputTokens = event.message.usage.input_tokens
        }
        break
        
      case 'message_delta':
        if (event.usage?.output_tokens) {
          this._outputTokens = event.usage.output_tokens
        }
        break
        
      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          this._toolCallCount++
        }
        break
        
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta' && event.delta.text) {
          this._content += event.delta.text
        }
        break
    }
  }
  
  /**
   * Get metrics for tracking
   */
  getMetrics() {
    return {
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      totalTokens: this.totalTokens,
      toolCallCount: this._toolCallCount,
      hasContent: this._content.length > 0
    }
  }
  
  /**
   * Get truncated content for notifications
   */
  getTruncatedContent(maxLines: number = 20, maxLength: number = 3000): string {
    if (!this._content) return ''
    
    // Truncate by lines first
    const lines = this._content.split('\n')
    let truncated = lines.slice(0, maxLines).join('\n')
    
    if (lines.length > maxLines) {
      truncated += '\n... (truncated)'
    }
    
    // Then truncate by total length
    if (truncated.length > maxLength) {
      truncated = truncated.substring(0, maxLength) + '... (truncated)'
    }
    
    return truncated
  }
}