/**
 * Shared error utilities and type guards
 */

/**
 * Default HTTP status code for internal server errors
 */
export const DEFAULT_ERROR_STATUS_CODE = 500

/**
 * HTTP error with status code information
 * @interface HTTPResponseError
 * @extends {Error}
 * @property {number} [status] - HTTP status code (deprecated, use statusCode)
 * @property {number} [statusCode] - HTTP status code (preferred)
 * @property {string} [code] - Error code identifier
 */
export interface HTTPResponseError extends Error {
  /**
   * @deprecated Use statusCode instead for consistency
   */
  status?: number
  statusCode?: number
  code?: string
}

/**
 * Type guard to check if an error has a status code property
 * @param {unknown} error - Value to check
 * @returns {boolean} True if error has status or statusCode property
 * @example
 * ```typescript
 * try {
 *   await fetch(url)
 * } catch (error) {
 *   if (hasStatusCode(error)) {
 *     console.log('HTTP error:', error.statusCode || error.status)
 *   }
 * }
 * ```
 */
export function hasStatusCode(error: unknown): error is HTTPResponseError {
  if (!(error instanceof Error)) {
    return false
  }

  const err = error as HTTPResponseError
  return typeof err.status === 'number' || typeof err.statusCode === 'number'
}

/**
 * Type guard to check if a value is an Error instance
 * @param {unknown} error - Value to check
 * @returns {boolean} True if value is an Error instance
 * @example
 * ```typescript
 * const value: unknown = getValueFromSomewhere()
 * if (isError(value)) {
 *   console.error('Error:', value.message)
 * }
 * ```
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error
}

/**
 * Safely extract error message from unknown value
 * @param {unknown} error - Value to extract message from
 * @returns {string} Error message or 'Unknown error' if not found
 * @example
 * ```typescript
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   logger.error(getErrorMessage(error))
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Unknown error'
}

/**
 * Safely extract error stack trace from unknown value
 * @param {unknown} error - Value to extract stack from
 * @returns {string | undefined} Stack trace if available
 * @example
 * ```typescript
 * catch (error) {
 *   const stack = getErrorStack(error)
 *   if (stack) {
 *     logger.debug('Stack trace:', stack)
 *   }
 * }
 * ```
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack
  }
  return undefined
}

/**
 * Safely extract error code from unknown value
 * @param {unknown} error - Value to extract code from
 * @returns {string | undefined} Error code if available
 * @example
 * ```typescript
 * catch (error) {
 *   const code = getErrorCode(error)
 *   if (code === 'ECONNREFUSED') {
 *     console.error('Connection refused')
 *   }
 * }
 * ```
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return String(error.code)
  }
  return undefined
}

/**
 * Extract HTTP status code from error
 * @param {unknown} error - Value to extract status code from
 * @returns {number} HTTP status code (defaults to 500 for internal server error)
 * @example
 * ```typescript
 * app.use((err, req, res, next) => {
 *   const statusCode = getStatusCode(err)
 *   res.status(statusCode).json({ error: getErrorMessage(err) })
 * })
 * ```
 */
export function getStatusCode(error: unknown): number {
  if (hasStatusCode(error)) {
    return error.status || error.statusCode || DEFAULT_ERROR_STATUS_CODE
  }
  return DEFAULT_ERROR_STATUS_CODE
}
