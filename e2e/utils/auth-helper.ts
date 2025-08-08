import { Page, Browser, BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const AUTH_FILE = path.join(__dirname, '../../.auth/user.json')

export class AuthHelper {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.DASHBOARD_API_KEY || 'test_dashboard_key'
    this.baseUrl = baseUrl || process.env.TEST_BASE_URL || 'http://localhost:3001'
  }

  /**
   * Perform API-based authentication and save storage state
   */
  async authenticate(page: Page): Promise<void> {
    // Set authentication headers on the page context
    await page.context().setExtraHTTPHeaders({
      'X-Dashboard-Key': this.apiKey,
    })

    // Navigate to dashboard
    await page.goto(this.baseUrl)

    // Wait for authentication to complete
    // The dashboard sets a cookie after successful auth
    await page.waitForFunction(
      () => {
        return document.cookie.includes('dashboard_auth')
      },
      { timeout: 5000 }
    )

    // Save the storage state for reuse
    await this.saveStorageState(page)
  }

  /**
   * Save the current storage state (cookies, localStorage)
   */
  async saveStorageState(page: Page): Promise<void> {
    const context = page.context()

    // Ensure directory exists
    const authDir = path.dirname(AUTH_FILE)
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true })
    }

    // Save storage state
    await context.storageState({ path: AUTH_FILE })
  }

  /**
   * Load saved storage state into a new context
   */
  async loadStorageState(browser: Browser): Promise<BrowserContext> {
    // Check if auth file exists
    if (!fs.existsSync(AUTH_FILE)) {
      throw new Error('Authentication file not found. Run authenticate() first.')
    }

    // Create context with saved storage state
    const context = await browser.newContext({
      storageState: AUTH_FILE,
    })

    return context
  }

  /**
   * Check if storage state file exists
   */
  hasStorageState(): boolean {
    return fs.existsSync(AUTH_FILE)
  }

  /**
   * Clear saved authentication
   */
  clearAuth(): void {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE)
    }
  }

  /**
   * Setup authentication for a page (adds headers)
   */
  async setupPageAuth(page: Page): Promise<void> {
    // Add API key header to all requests
    await page.setExtraHTTPHeaders({
      'X-Dashboard-Key': this.apiKey,
    })
  }

  /**
   * Check if authentication is still valid
   */
  async isAuthValid(page: Page): Promise<boolean> {
    try {
      // Try to access a protected route
      const response = await page.goto(`${this.baseUrl}/api/requests`, {
        waitUntil: 'domcontentloaded',
      })

      return response?.status() === 200
    } catch {
      return false
    }
  }

  /**
   * Get authenticated context with retries
   */
  async getAuthenticatedContext(browser: Browser, retries: number = 2): Promise<BrowserContext> {
    for (let i = 0; i <= retries; i++) {
      try {
        // Try to load existing storage state
        if (this.hasStorageState()) {
          const context = await this.loadStorageState(browser)
          // Set headers on the context
          await context.setExtraHTTPHeaders({
            'X-Dashboard-Key': this.apiKey,
          })
          const page = await context.newPage()

          // Verify auth is still valid
          if (await this.isAuthValid(page)) {
            await page.close()
            return context
          }

          // Auth expired, clear and retry
          await page.close()
          await context.close()
          this.clearAuth()
        }

        // Create new context with authentication headers
        const context = await browser.newContext({
          extraHTTPHeaders: {
            'X-Dashboard-Key': this.apiKey,
          },
        })
        const page = await context.newPage()
        await this.authenticate(page)
        await page.close()

        return context
      } catch (error) {
        if (i === retries) {
          throw new Error(`Failed to authenticate after ${retries + 1} attempts: ${error}`)
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    throw new Error('Authentication failed')
  }
}
