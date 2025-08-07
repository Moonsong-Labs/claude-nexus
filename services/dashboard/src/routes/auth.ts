import { Hono } from 'hono'
import { html } from 'hono/html'
import { setCookie } from 'hono/cookie'
import { timingSafeEqual } from 'crypto'
import { layout } from '../layout/index.js'
import { isReadOnly } from '../config.js'

type AuthVariables = {
  Variables: {
    csrfToken?: string
  }
}

export const authRoutes = new Hono<AuthVariables>()

/**
 * Login page
 */
authRoutes.get('/login', c => {
  // If in read-only mode, redirect to dashboard
  if (isReadOnly) {
    return c.redirect('/dashboard')
  }

  // Get the CSRF token from context
  const csrfToken = c.get('csrfToken') || ''

  const content = html`
    <div
      style="max-width: 400px; margin: 4rem auto; background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);"
    >
      <h2 style="margin: 0 0 1.5rem 0;">Dashboard Login</h2>
      <form method="POST" action="/dashboard/login">
        <input type="hidden" name="_csrf" value="${csrfToken}" />
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

  // Pass the context to layout so it can inject the CSRF token
  return c.html(layout('Login', content, '', c))
})

/**
 * Handle login POST
 */
authRoutes.post('/login', async c => {
  // If in read-only mode, redirect to dashboard
  if (isReadOnly) {
    return c.redirect('/dashboard')
  }

  const { key } = await c.req.parseBody()
  const apiKey = process.env.DASHBOARD_API_KEY

  let isValid = false
  if (typeof key === 'string' && apiKey) {
    const keyBuffer = Buffer.from(key)
    const apiKeyBuffer = Buffer.from(apiKey)
    if (keyBuffer.length === apiKeyBuffer.length) {
      isValid = timingSafeEqual(keyBuffer, apiKeyBuffer)
    }
  }

  if (isValid) {
    setCookie(c, 'dashboard_auth', key as string, {
      httpOnly: true, // Prevent client-side script access for security
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return c.redirect('/dashboard')
  }

  return c.redirect('/dashboard/login?error=invalid')
})

/**
 * Logout
 */
authRoutes.get('/logout', c => {
  setCookie(c, 'dashboard_auth', '', { maxAge: 0 })
  return c.redirect('/dashboard/login')
})
