import { Page, Browser, BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const AUTH_FILE = path.join(__dirname, '../../.auth/user.json')

export class AuthHelper {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey?: string, baseUrl?: string) {
    // In CI, use the CI-specific API key
    this.apiKey = apiKey || process.env.DASHBOARD_API_KEY || (process.env.CI ? 'test_dashboard_key_ci' : 'test_dashboard_key')
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
    const response = await page.goto(this.baseUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    // Check if we got a successful response
    if (!response || response.status() !== 200) {
      throw new Error(`Failed to load dashboard: ${response?.status()}`)
    }

    // In CI or when API key is set, the dashboard should accept the header auth
    // We don't need to wait for a cookie as header auth is sufficient
    
    // Save the storage state for reuse (even if empty, for consistency)
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
    // In CI or when using header auth, we don't need complex storage state management
    // Just create a context with the proper headers
    
    for (let i = 0; i <= retries; i++) {
      try {
        // Create context with authentication headers
        const context = await browser.newContext({
          extraHTTPHeaders: {
            'X-Dashboard-Key': this.apiKey,
          },
        })

        // Verify the context works by testing a simple request
        const page = await context.newPage()
        const response = await page.goto(this.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })

        if (!response || (response.status() !== 200 && response.status() !== 304)) {
          await page.close()
          await context.close()
          throw new Error(`Dashboard returned status ${response?.status()}`)
        }

        await page.close()
        return context
      } catch (error) {
        if (i === retries) {
          throw new Error(`Failed to create authenticated context after ${retries + 1} attempts: ${error}`)
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    throw new Error('Authentication failed')
  }
}
