import { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { randomBytes } from 'crypto'
import { IS_PRODUCTION } from '../constants/auth.js'

// Cookie name for storing CSRF tokens
const CSRF_TOKEN_COOKIE = 'csrf_token'

// Header name for CSRF token validation
const CSRF_HEADER = 'X-CSRF-Token'

// Token length in bytes (generates 64 character hex string)
const TOKEN_LENGTH = 32

/**
 * Branded type for CSRF tokens to ensure type safety
 */
type CsrfToken = string & { readonly brand: unique symbol }

/**
 * Generate a cryptographically secure CSRF token
 * @returns A hex-encoded CSRF token
 */
function generateToken(): CsrfToken {
  return randomBytes(TOKEN_LENGTH).toString('hex') as CsrfToken
}

/**
 * CSRF protection middleware for the dashboard service
 *
 * Implements Double Submit Cookie pattern:
 * - Generates a cryptographically secure token stored in an httpOnly cookie
 * - Validates the token on state-changing requests (POST, PUT, DELETE, PATCH)
 * - Requires the token to be included in the X-CSRF-Token header
 *
 * @returns Hono middleware function
 */
export function csrfProtection() {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase()

    // Get or generate CSRF token
    let csrfToken = getCookie(c, CSRF_TOKEN_COOKIE) as CsrfToken | undefined
    if (!csrfToken) {
      csrfToken = generateToken()
      setCookie(c, CSRF_TOKEN_COOKIE, csrfToken, {
        httpOnly: true,
        sameSite: 'Strict',
        secure: IS_PRODUCTION,
        path: '/',
      })
    }

    // Skip CSRF validation for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      // Expose the token for forms to use
      c.set('csrfToken', csrfToken)
      return next()
    }

    // Validate CSRF token for state-changing requests
    const requestToken = c.req.header(CSRF_HEADER)

    if (!requestToken || requestToken !== csrfToken) {
      return c.json(
        {
          error: 'Invalid CSRF token',
          message: 'Request validation failed. Please refresh the page and try again.',
        },
        403
      )
    }

    // Token is valid, continue
    c.set('csrfToken', csrfToken)
    return next()
  }
}
