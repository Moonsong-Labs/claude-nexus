import { describe, it, expect } from 'bun:test'
import { serializeError } from '../error-serialization'
import { UpstreamError, ValidationError, AuthenticationError } from '../../types/errors'

describe('serializeError', () => {
  it('should serialize BaseError with Claude API format', () => {
    const error = new ValidationError('Invalid input')
    const result = serializeError(error)

    expect(result).toEqual({
      error: {
        type: 'invalid_request_error',
        message: 'Invalid input',
        request_id: undefined,
      },
    })
  })

  it('should include request_id from context', () => {
    const error = new AuthenticationError('Invalid API key', { requestId: 'req_123' })
    const result = serializeError(error)

    expect(result).toEqual({
      error: {
        type: 'authentication_error',
        message: 'Invalid API key',
        request_id: 'req_123',
      },
    })
  })

  it('should return upstream response directly for UpstreamError', () => {
    const upstreamResponse = {
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded',
      },
    }
    const error = new UpstreamError('Upstream failed', 429, undefined, upstreamResponse)
    const result = serializeError(error)

    expect(result).toBe(upstreamResponse)
  })

  it('should handle non-BaseError errors', () => {
    const error = new Error('Something went wrong')
    const result = serializeError(error)

    expect(result).toEqual({
      error: {
        type: 'internal_error',
        message: 'Something went wrong',
      },
    })
  })

  it('should handle errors without message', () => {
    const error = new Error()
    const result = serializeError(error)

    expect(result).toEqual({
      error: {
        type: 'internal_error',
        message: 'An unexpected error occurred',
      },
    })
  })
})
