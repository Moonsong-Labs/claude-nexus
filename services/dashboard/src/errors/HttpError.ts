/**
 * Custom error class for HTTP errors with status code and structured data
 */
export class HttpError<T = unknown> extends Error {
  public readonly status: number
  public readonly data: T

  constructor(message: string, status: number, data?: T) {
    super(message)
    // Set the prototype explicitly for instanceof to work correctly
    Object.setPrototypeOf(this, HttpError.prototype)

    this.name = 'HttpError'
    this.status = status
    this.data = data ?? ({ error: message } as T)
  }

  /**
   * Type guard to check if an error is an HttpError
   */
  static isHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError
  }

  /**
   * Common HTTP error factory methods
   */
  static BadRequest<T = unknown>(message = 'Bad Request', data?: T): HttpError<T> {
    return new HttpError<T>(message, 400, data)
  }

  static Unauthorized<T = unknown>(message = 'Unauthorized', data?: T): HttpError<T> {
    return new HttpError<T>(message, 401, data)
  }

  static Forbidden<T = unknown>(message = 'Forbidden', data?: T): HttpError<T> {
    return new HttpError<T>(message, 403, data)
  }

  static NotFound<T = unknown>(message = 'Not Found', data?: T): HttpError<T> {
    return new HttpError<T>(message, 404, data)
  }

  static InternalServerError<T = unknown>(
    message = 'Internal Server Error',
    data?: T
  ): HttpError<T> {
    return new HttpError<T>(message, 500, data)
  }

  /**
   * Create an HttpError from a Response object
   */
  static async fromResponse<T = unknown>(response: Response): Promise<HttpError<T>> {
    let errorData: any
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

    return new HttpError<T>(message, response.status, errorData)
  }

  /**
   * Serialize the error to JSON format
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      data: this.data,
      // Only include stack in development for security
      ...(process.env.NODE_ENV !== 'production' && { stack: this.stack }),
    }
  }

  /**
   * Extract error message from various possible error response structures
   */
  private static extractErrorMessage(data: unknown, response: Response): string {
    // Define extractors inline to avoid 'this' binding issues
    const extractors: Array<(data: any) => string | undefined> = [
      // Check for { error: "message" }
      data => (typeof data?.error === 'string' ? data.error : undefined),
      // Check for { message: "message" }
      data => (typeof data?.message === 'string' ? data.message : undefined),
      // Check for { error: { message: "message" } }
      data => (typeof data?.error?.message === 'string' ? data.error.message : undefined),
      // Check if data itself is a string
      data => (typeof data === 'string' ? data : undefined),
    ]

    // Try each extractor in order
    for (const extractor of extractors) {
      try {
        const message = extractor(data)
        if (message) {
          return message
        }
      } catch {
        // Ignore extractor errors and try the next one
      }
    }

    // Fall back to generic message
    return `API error: ${response.status} ${response.statusText}`
  }
}
