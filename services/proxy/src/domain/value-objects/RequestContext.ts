/**
 * Immutable value object representing the context of an HTTP request.
 *
 * This class encapsulates essential request metadata needed throughout
 * the request lifecycle. It serves as a domain-agnostic container that
 * can be passed between different layers and services without coupling
 * them to specific frameworks or transport mechanisms.
 *
 * @example
 * ```typescript
 * const context = new RequestContext(
 *   'req_123',
 *   'api.example.com',
 *   'POST',
 *   '/v1/messages',
 *   Date.now(),
 *   { 'user-agent': 'Mozilla/5.0' },
 *   'Bearer sk-ant-...'
 * )
 * ```
 */
export class RequestContext {
  private readonly _headers: Readonly<Record<string, string>>

  /**
   * Creates a new RequestContext instance
   *
   * @param requestId - Unique identifier for the request
   * @param host - Host header value from the request
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - Request path/URL
   * @param startTime - Timestamp when request processing started (milliseconds since epoch)
   * @param headers - Relevant HTTP headers (will be shallow frozen)
   * @param apiKey - Optional API key from Authorization header
   * @throws Error if required fields are missing or invalid
   */
  constructor(
    public readonly requestId: string,
    public readonly host: string,
    public readonly method: string,
    public readonly path: string,
    public readonly startTime: number,
    headers: Record<string, string>,
    public readonly apiKey?: string
  ) {
    // Validate required fields
    if (!requestId || !requestId.trim()) {
      throw new Error('RequestContext: requestId is required')
    }
    if (!host || !host.trim()) {
      throw new Error('RequestContext: host is required')
    }
    if (!method || !method.trim()) {
      throw new Error('RequestContext: method is required')
    }
    if (!path || !path.trim()) {
      throw new Error('RequestContext: path is required')
    }
    if (typeof startTime !== 'number' || startTime <= 0) {
      throw new Error('RequestContext: startTime must be a positive number')
    }

    // Shallow freeze headers to prevent modification
    this._headers = Object.freeze({ ...headers })
  }

  /**
   * Get immutable headers object
   *
   * @returns Readonly copy of the request headers
   */
  get headers(): Readonly<Record<string, string>> {
    return this._headers
  }

  /**
   * Calculate elapsed time since request started
   *
   * @returns Elapsed time in milliseconds
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * Check if the request has an API key
   *
   * @returns true if apiKey is present
   */
  hasApiKey(): boolean {
    return !!this.apiKey
  }

  /**
   * Check if the request is from a specific domain
   *
   * @param domain - Domain to check against
   * @returns true if the host matches the domain (case-insensitive)
   */
  isFromDomain(domain: string): boolean {
    return this.host.toLowerCase() === domain.toLowerCase()
  }

  /**
   * Create telemetry data object for monitoring/logging
   *
   * @returns Object containing key request metrics
   */
  toTelemetry() {
    return {
      requestId: this.requestId,
      domain: this.host,
      method: this.method,
      path: this.path,
      duration: this.getElapsedTime(),
      timestamp: new Date(this.startTime).toISOString(),
    }
  }
}
