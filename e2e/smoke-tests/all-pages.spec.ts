import { test, expect } from '@playwright/test'
import { ConsoleMonitor } from '../utils/console-monitor'
import { AuthHelper } from '../utils/auth-helper'
import { testData } from '../fixtures/test-data'

// Tag all tests as @smoke for CI filtering
test.describe('@smoke Dashboard Pages Smoke Tests', () => {
  // Run tests serially for consistency
  test.describe.configure({ mode: 'serial' })
  const authHelper = new AuthHelper()

  // Test each dashboard route
  testData.dashboardRoutes.forEach(route => {
    test(`${route.name} (${route.path}) loads without console errors`, async ({ browser }) => {
      // Create authenticated context
      const context = await authHelper.getAuthenticatedContext(browser)
      const page = await context.newPage()

      // Setup console monitoring
      const consoleMonitor = new ConsoleMonitor(page)
      await consoleMonitor.startMonitoring()

      try {
        // Navigate to the page
        await page.goto(`${testData.testConfig.baseUrl}${route.path}`, {
          waitUntil: 'networkidle',
          timeout: testData.testConfig.defaultTimeout,
        })

        // Wait for page to be fully loaded
        await page.waitForLoadState('domcontentloaded')

        // Check page title exists (more lenient)
        await expect(page).toHaveTitle(/Claude|Nexus|Dashboard/i, { timeout: 10000 })

        // Very basic smoke test - just verify the page loaded without errors
        // Check for any content on the page
        const bodyContent = page.locator('body')
        await expect(bodyContent).toBeVisible({ timeout: 10000 })

        // Verify no error messages are displayed
        const errorMessages = page.locator('text=/error|failed|exception/i')
        const errorCount = await errorMessages.count()

        // If there are error messages, check if they're expected (e.g., "No data" messages)
        if (errorCount > 0) {
          // Check if it's a real error or just a "no data" type message
          const criticalError = page.locator('text=/uncaught|exception|failed to load/i')
          const hasCriticalError = (await criticalError.count()) > 0
          expect(hasCriticalError).toBe(false)
        }

        // Assert no console errors
        consoleMonitor.assertNoErrors()

        // Take screenshot on success (optional, for debugging)
        if (process.env.CAPTURE_SCREENSHOTS === 'true') {
          await page.screenshot({
            path: `test-results/screenshots/${route.name.replace(/\s+/g, '-').toLowerCase()}-success.png`,
            fullPage: true,
          })
        }
      } catch (error) {
        // Take screenshot on failure
        await page.screenshot({
          path: `test-results/screenshots/${route.name.replace(/\s+/g, '-').toLowerCase()}-failure.png`,
          fullPage: true,
        })

        // Log console errors if any
        const errors = consoleMonitor.getErrors()
        if (errors.length > 0) {
          console.error(`Console errors on ${route.path}:`, consoleMonitor.getErrorReport())
        }

        throw error
      } finally {
        await page.close()
        await context.close()
      }
    })
  })

  // Test error pages - simplified
  test('404 page handles gracefully', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const consoleMonitor = new ConsoleMonitor(page)
    await consoleMonitor.startMonitoring()

    // Navigate to non-existent page
    const response = await page.goto(`${testData.testConfig.baseUrl}/non-existent-page`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    })

    // Should return a valid status (200, 404, or redirects are all ok)
    expect(response?.status()).toBeGreaterThanOrEqual(200)
    expect(response?.status()).toBeLessThan(500)

    // Should still not have console errors
    consoleMonitor.assertNoErrors()

    await page.close()
    await context.close()
  })

  // Test page performance - more lenient for CI
  test('Dashboard loads within performance budget', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const startTime = Date.now()

    await page.goto(`${testData.testConfig.baseUrl}/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const loadTime = Date.now() - startTime

    // Page should load within reasonable time (very relaxed for CI)
    const isCI = !!process.env.CI
    expect(loadTime).toBeLessThan(isCI ? 30000 : 10000)

    await page.close()
    await context.close()
  })
})
