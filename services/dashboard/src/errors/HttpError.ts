/**
 * Custom error class for HTTP errors with status code and structured data
 */
export class HttpError extends Error {
  public readonly status: number
  public readonly data: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    // Set the prototype explicitly for instanceof to work correctly
    Object.setPrototypeOf(this, HttpError.prototype)

    this.name = 'HttpError'
    this.status = status
    this.data = data ?? { error: message }
  }

  /**
   * Type guard to check if an error is an HttpError
   */
  static isHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError
  }

  /**
   * Create an HttpError from a Response object
   */
  static async fromResponse(response: Response): Promise<HttpError> {
    let errorData: unknown
    const contentType = response.headers.get('content-type')

    try {
      if (contentType?.includes('application/json')) {
        errorData = await response.json()
      } else {
        // For non-JSON responses, use the text as the error message
        const text = await response.text()
        errorData = { error: text || response.statusText }
      }
    } catch {
      // If parsing fails, fall back to status text
      errorData = { error: response.statusText }
    }

    // Extract error message from various possible structures
    const message = HttpError.extractErrorMessage(errorData, response)

    return new HttpError(message, response.status, errorData)
  }

  /**
   * Extract error message from various possible error response structures
   */
  private static extractErrorMessage(data: unknown, response: Response): string {
    // Check for common error message patterns
    if (data && typeof data === 'object') {
      // Check for { error: "message" }
      if ('error' in data && typeof data.error === 'string') {
        return data.error
      }
      // Check for { message: "message" }
      if ('message' in data && typeof data.message === 'string') {
        return data.message
      }
      // Check for { error: { message: "message" } }
      if (
        'error' in data &&
        data.error &&
        typeof data.error === 'object' &&
        'message' in data.error &&
        typeof data.error.message === 'string'
      ) {
        return data.error.message
      }
    }

    // Fall back to generic message
    return `API error: ${response.status} ${response.statusText}`
  }
}
