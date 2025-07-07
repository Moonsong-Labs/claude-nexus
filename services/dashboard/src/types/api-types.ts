/**
 * Common API error response structure
 */
export interface ApiErrorResponse {
  error: string
  details?: unknown
  code?: string
}

/**
 * Type guard to check if a value is an API error response
 */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorResponse).error === 'string'
  )
}

/**
 * Error response with additional data
 */
export interface ErrorWithData<T = unknown> {
  error: string
  data?: T
}

/**
 * Response from APIs that might have been parsed from HttpError
 */
export interface HttpErrorData {
  status: number
  data?: unknown
  body?: unknown
}
