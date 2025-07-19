import { defineConfig, devices, PlaywrightTestConfig } from '@playwright/test'

// Constants for configuration
const DASHBOARD_PORT = 3001
const DEFAULT_DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`
const DEV_SERVER_TIMEOUT_MS = 120 * 1000 // 2 minutes

// Environment configuration
const CI = !!process.env.CI
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_DASHBOARD_URL

/**
 * Playwright E2E test configuration for the Claude Nexus Proxy dashboard.
 * 
 * Environment variables:
 * - CI: Enables CI-specific settings (retries, single worker, forbid test.only)
 * - PLAYWRIGHT_BASE_URL: Override the base URL for tests (default: http://localhost:3001)
 * 
 * See https://playwright.dev/docs/test-configuration for all available options.
 */
const config: PlaywrightTestConfig = defineConfig({
  testDir: './e2e',
  
  /* Parallel execution settings */
  fullyParallel: true,
  workers: CI ? 1 : undefined, // Single worker on CI for stability
  
  /* CI-specific settings */
  forbidOnly: CI, // Prevent accidental test.only in CI
  retries: CI ? 2 : 0, // Retry failed tests in CI
  
  /* Test output */
  reporter: 'html',
  
  /* Shared test options */
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Browser configurations - Desktop only (mobile tests removed as unused) */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Development server configuration */
  webServer: {
    command: 'bun run dev:dashboard',
    port: DASHBOARD_PORT,
    reuseExistingServer: !CI, // Always start fresh server in CI
    timeout: DEV_SERVER_TIMEOUT_MS,
  },
})

// Validate environment on startup
if (CI && !process.env.PLAYWRIGHT_BASE_URL) {
  console.log('ℹ️  Running Playwright tests in CI mode against default URL:', DEFAULT_DASHBOARD_URL)
}

export default config
