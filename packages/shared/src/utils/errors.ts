/**
 * Shared error utilities and type guards
 */

export interface HTTPResponseError extends Error {
  status?: number
  statusCode?: number
  code?: string
}

/**
 * Type guard to check if an error has a status property
 */
export function hasStatusCode(error: unknown): error is HTTPResponseError {
  return (
    error instanceof Error &&
    (typeof (error as any).status === 'number' ||
     typeof (error as any).statusCode === 'number')
  )
}

/**
 * Type guard to check if a value is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error
}

/**
 * Safely get error message from unknown error
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
 * Safely get error stack from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack
  }
  return undefined
}

/**
 * Safely get error code from unknown error
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return String(error.code)
  }
  return undefined
}

/**
 * Get status code from error
 */
export function getStatusCode(error: unknown): number {
  if (hasStatusCode(error)) {
    return error.status || error.statusCode || 500
  }
  return 500
}