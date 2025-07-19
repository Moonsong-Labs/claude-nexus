import type { Context } from 'hono'
import { ERROR_TYPES, HTTP_STATUS } from '../constants.js'

interface ErrorResponse {
  error: {
    message: string
    type: string
    request_id?: string
    code?: string
  }
}

export function createErrorResponse(
  c: Context,
  message: string,
  status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  type: string = ERROR_TYPES.INTERNAL_ERROR,
  code?: string
): Response {
  const requestId = c.get('requestId') || 'unknown'
  
  const response: ErrorResponse = {
    error: {
      message,
      type,
      request_id: requestId,
    },
  }
  
  if (code) {
    response.error.code = code
  }
  
  return c.json(response, status as any)
}