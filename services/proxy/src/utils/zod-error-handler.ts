import { Context } from 'hono'
import { ZodError } from 'zod'
import { HTTP_STATUS } from '../constants.js'

/**
 * Checks if an error is a ZodError and handles it appropriately
 * Works around potential instanceof issues with bundlers
 * @param error - The error to check and handle
 * @param c - Hono context for response
 * @returns Response if error is ZodError, null otherwise
 */
export function handleZodError(error: unknown, c: Context): Response | null {
  // Check for ZodError by name due to potential instanceof issues with bundlers
  if (
    error instanceof ZodError ||
    (error as Error & { constructor?: { name?: string } })?.constructor?.name === 'ZodError'
  ) {
    return c.json(
      {
        error: 'Invalid request',
        details: (error as ZodError).errors,
      },
      HTTP_STATUS.BAD_REQUEST
    )
  }
  
  return null
}