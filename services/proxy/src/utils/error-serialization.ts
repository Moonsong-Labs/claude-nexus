/**
 * Error serialization utilities specific to Claude API compatibility
 */

import type { BaseError, UpstreamError } from '@claude-nexus/shared'

// Map error codes to Claude API error types
const errorCodeToType: Record<string, string> = {
  AUTHENTICATION_ERROR: 'authentication_error',
  AUTHORIZATION_ERROR: 'permission_error',
  VALIDATION_ERROR: 'invalid_request_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  NOT_FOUND: 'not_found_error',
  UPSTREAM_ERROR: 'api_error',
  TIMEOUT_ERROR: 'timeout_error',
  CONFIGURATION_ERROR: 'internal_error',
  STORAGE_ERROR: 'internal_error',
  INTERNAL_ERROR: 'internal_error',
}

// Serialize error for Claude API response format
export function serializeError(error: Error): any {
  // Special handling for UpstreamError to return Claude's original error format
  if ((error as UpstreamError).upstreamResponse) {
    // Return Claude's error response directly to maintain compatibility
    return (error as UpstreamError).upstreamResponse
  }

  if ((error as BaseError).code) {
    const baseError = error as BaseError
    // Use Claude's error format for compatibility
    return {
      error: {
        type: errorCodeToType[baseError.code] || 'internal_error',
        message: baseError.message,
        request_id: baseError.context?.requestId as string | undefined,
      },
    }
  }

  // Handle non-operational errors
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      statusCode: 500,
      timestamp: new Date(),
    },
  }
}
