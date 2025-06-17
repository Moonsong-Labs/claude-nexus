import { Context } from 'hono'

/**
 * Value object containing request context information
 * Immutable container for request metadata
 */
export class RequestContext {
  constructor(
    public readonly requestId: string,
    public readonly host: string,
    public readonly method: string,
    public readonly path: string,
    public readonly startTime: number,
    public readonly headers: Record<string, string>,
    public readonly apiKey?: string,
    public readonly honoContext?: Context
  ) {}
  
  /**
   * Create from Hono context
   */
  static fromHono(c: Context): RequestContext {
    const requestId = c.get('requestId') || generateRequestId()
    const host = c.req.header('host') || 'unknown'
    const apiKey = c.req.header('x-api-key') || 
                  c.req.header('authorization')
    
    // Extract relevant headers
    const headers: Record<string, string> = {}
    const relevantHeaders = [
      'user-agent',
      'x-forwarded-for',
      'x-real-ip',
      'content-type',
      'accept'
    ]
    
    for (const header of relevantHeaders) {
      const value = c.req.header(header)
      if (value) {
        headers[header] = value
      }
    }
    
    return new RequestContext(
      requestId,
      host,
      c.req.method,
      c.req.path,
      Date.now(),
      headers,
      apiKey,
      c
    )
  }
  
  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime
  }
  
  /**
   * Create telemetry context
   */
  toTelemetry() {
    return {
      requestId: this.requestId,
      domain: this.host,
      method: this.method,
      path: this.path,
      duration: this.getElapsedTime(),
      timestamp: new Date(this.startTime).toISOString()
    }
  }
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}