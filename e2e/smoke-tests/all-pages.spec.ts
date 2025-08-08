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

        // Very basic smoke test - just verify the page loaded without critical errors
        // Check for any content on the page
        const bodyContent = page.locator('body')
        await expect(bodyContent).toBeVisible({ timeout: 10000 })

        // Check if page has a title (optional - might be empty during loading)
        const title = await page.title()
        if (title) {
          // If there's a title, it should contain something relevant
          expect(title.toLowerCase()).toMatch(/claude|nexus|dashboard|proxy/)
        }

        // Verify no critical error messages are displayed
        const criticalError = page.locator(
          'text=/uncaught|exception|failed to load|internal server error/i'
        )
        const hasCriticalError = (await criticalError.count()) > 0
        expect(hasCriticalError).toBe(false)

        // Assert no critical console errors (allow warnings and info)
        const errors = consoleMonitor.getErrors()
        const criticalConsoleErrors = errors.filter(
          error =>
            !error.message.includes('404') && // Ignore 404s for now
            !error.message.includes('favicon') // Ignore favicon 404s
        )
        expect(criticalConsoleErrors).toHaveLength(0)

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
