import { Hono } from 'hono'
import { html } from 'hono/html'
import { setCookie } from 'hono/cookie'
import { timingSafeEqual } from 'crypto'
import { layout } from '../layout/index.js'
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE, IS_PRODUCTION } from '../constants/auth.js'

export const authRoutes = new Hono()

/**
 * Login page route handler
 * Displays the authentication form for dashboard access
 *
 * @route GET /dashboard/login
 * @returns {Response} HTML response with login form
 */
authRoutes.get('/login', c => {
  const error = c.req.query('error')
  const errorMessage =
    error === 'invalid'
      ? '<p style="color: #dc2626; margin: 0 0 1rem 0; text-align: center;">Invalid API key. Please try again.</p>'
      : ''
  const content = html`
    <div
      style="max-width: 400px; margin: 4rem auto; background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);"
    >
      <h2 style="margin: 0 0 1.5rem 0;">Dashboard Login</h2>
      ${errorMessage}
      <form method="POST" action="/dashboard/login">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151;"
            >API Key</label
          >
          <input
            type="password"
            name="key"
            required
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            placeholder="Enter your dashboard API key"
          />
        </div>
        <button type="submit" class="btn" style="width: 100%;">Login</button>
      </form>
      <p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280; text-align: center;">
        Set DASHBOARD_API_KEY environment variable
      </p>
    </div>
  `

  return c.html(layout('Login', content))
})

/**
 * Handle login POST request
 * Validates the provided API key against the configured dashboard key
 * Sets authentication cookie on successful validation
 *
 * @route POST /dashboard/login
 * @param {string} key - API key from form submission
 * @returns {Response} Redirect to dashboard or login page with error
 *
 * @security IMPORTANT: Cookie is set with httpOnly: false to allow JavaScript access
 * for authenticated API calls from the dashboard frontend. This is a security trade-off
 * that makes the cookie vulnerable to XSS attacks.
 *
 * TODO: Implement a more secure authentication mechanism such as:
 * - Using a separate API token for browser-based requests
 * - Implementing a server-side proxy endpoint in the dashboard
 * - Using session-based authentication with CSRF tokens
 *
 * See: services/dashboard/src/components/spark-recommendation-inline.ts for usage
 */
authRoutes.post('/login', async c => {
  const body = await c.req.parseBody()
  const key = body.key
  const apiKey = process.env.DASHBOARD_API_KEY

  // Validate input types and presence
  if (typeof key !== 'string' || !key.trim()) {
    return c.redirect('/dashboard/login?error=invalid')
  }

  if (!apiKey) {
    console.error('DASHBOARD_API_KEY environment variable not set')
    return c.redirect('/dashboard/login?error=invalid')
  }

  // Timing-safe comparison to prevent timing attacks
  let isValid = false
  const keyBuffer = Buffer.from(key)
  const apiKeyBuffer = Buffer.from(apiKey)

  if (keyBuffer.length === apiKeyBuffer.length) {
    isValid = timingSafeEqual(keyBuffer, apiKeyBuffer)
  }

  if (isValid) {
    setCookie(c, AUTH_COOKIE_NAME, key, {
      httpOnly: false, // See security note in JSDoc above
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
      maxAge: AUTH_COOKIE_MAX_AGE,
    })
    return c.redirect('/dashboard')
  }

  return c.redirect('/dashboard/login?error=invalid')
})

/**
 * Logout route handler
 * Clears the authentication cookie and redirects to login page
 *
 * @route GET /dashboard/logout
 * @returns {Response} Redirect to login page
 */
authRoutes.get('/logout', c => {
  setCookie(c, AUTH_COOKIE_NAME, '', { maxAge: 0 })
  return c.redirect('/dashboard/login')
})
