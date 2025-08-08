import { test, expect } from '@playwright/test'
import { ConsoleMonitor } from '../utils/console-monitor'
import { AuthHelper } from '../utils/auth-helper'
import { testData } from '../fixtures/test-data'

// Tag all tests as @journey for CI filtering
test.describe('@journey Critical User Journeys', () => {
  // Run tests serially to avoid auth file conflicts
  test.describe.configure({ mode: 'serial' })
  let authHelper: AuthHelper

  test.beforeAll(async ({ browser }) => {
    authHelper = new AuthHelper()
    const context = await authHelper.getAuthenticatedContext(browser)
    await context.close()
  })

  test.afterAll(() => {
    authHelper.clearAuth()
  })

  test('Journey 1: View request details flow', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const consoleMonitor = new ConsoleMonitor(page)
    await consoleMonitor.startMonitoring()

    try {
      // Step 1: Navigate to dashboard
      await page.goto(`${testData.testConfig.baseUrl}/dashboard`)
      await page.waitForLoadState('networkidle')

      // Step 2: Click on requests tab/link
      const requestsLink = page
        .locator('a[href="/requests"], [data-testid="requests-link"]')
        .first()
      await requestsLink.click()
      await page.waitForURL('**/requests')

      // Step 3: Wait for requests to load and click on first request
      await page.waitForSelector('table tbody tr, .request-item', { timeout: 10000 })
      const firstRequest = page.locator('table tbody tr, .request-item').first()
      const requestLink = firstRequest.locator('a').first()
      await requestLink.click()

      // Step 4: Verify request details page loaded
      await page.waitForURL('**/request/**')
      await expect(page.locator('h1, h2').filter({ hasText: /request|details/i })).toBeVisible()

      // Step 5: Check key elements are present
      await expect(page.locator('text=/tokens?/i')).toBeVisible()
      await expect(page.locator('text=/response/i')).toBeVisible()

      // No console errors throughout journey
      consoleMonitor.assertNoErrors()
    } finally {
      await page.close()
      await context.close()
    }
  })

  test('Journey 2: Check token usage and analytics', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const consoleMonitor = new ConsoleMonitor(page)
    await consoleMonitor.startMonitoring()

    try {
      // Step 1: Navigate to dashboard
      await page.goto(`${testData.testConfig.baseUrl}/dashboard`)
      await page.waitForLoadState('networkidle')

      // Step 2: Click on token usage
      const tokenLink = page
        .locator('a[href="/token-usage"], [data-testid="token-usage-link"]')
        .first()
      await tokenLink.click()
      await page.waitForURL('**/token-usage')

      // Step 3: Verify chart loads
      await page.waitForSelector('canvas, .chart-container', { timeout: 10000 })
      const chart = page.locator('canvas, .chart-container').first()
      await expect(chart).toBeVisible()

      // Step 4: Check for usage statistics
      await expect(page.locator('text=/total tokens/i')).toBeVisible()

      // Step 5: Verify time window selector if present
      const timeSelector = page.locator('select, [data-testid="time-window"]').first()
      if (await timeSelector.isVisible()) {
        // Try changing time window
        await timeSelector.selectOption({ index: 1 })
        // Wait for chart to update by waiting for network response
        await page
          .waitForResponse(
            resp => resp.url().includes('/token-usage') || resp.url().includes('/api'),
            { timeout: 2000 }
          )
          .catch(() => {})
      }

      // No console errors
      consoleMonitor.assertNoErrors()
    } finally {
      await page.close()
      await context.close()
    }
  })

  test('Journey 3: Navigate conversation tree', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const consoleMonitor = new ConsoleMonitor(page)
    await consoleMonitor.startMonitoring()

    try {
      // Step 1: Go to requests page
      await page.goto(`${testData.testConfig.baseUrl}/requests`)
      await page.waitForLoadState('networkidle')

      // Step 2: Find and click on a conversation link
      const conversationLink = page.locator('a[href*="/conversation/"]').first()
      if (await conversationLink.isVisible()) {
        await conversationLink.click()
        await page.waitForURL('**/conversation/**')

        // Step 3: Verify conversation view loaded
        await expect(
          page.locator('.conversation-tree, [data-testid="conversation-tree"], svg')
        ).toBeVisible()

        // Step 4: Check for message nodes
        const messageNodes = page.locator('.node, [data-testid="message-node"], circle, rect')
        await expect(messageNodes.first()).toBeVisible()

        // Step 5: Try interacting with a node if clickable
        const firstNode = messageNodes.first()
        if (await firstNode.isEnabled()) {
          await firstNode.click()
          // Wait for any detail panel or tooltip to appear
          await page
            .waitForSelector('.tooltip, .detail-panel, [data-testid="node-detail"]', {
              timeout: 1000,
            })
            .catch(() => {})
        }
      }

      // No console errors
      consoleMonitor.assertNoErrors()
    } finally {
      await page.close()
      await context.close()
    }
  })

  test('Journey 4: Search and filter requests', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const consoleMonitor = new ConsoleMonitor(page)
    await consoleMonitor.startMonitoring()

    try {
      // Step 1: Navigate to requests page
      await page.goto(`${testData.testConfig.baseUrl}/requests`)
      await page.waitForLoadState('networkidle')

      // Step 2: Find search input if available
      const searchInput = page
        .locator(
          'input[type="search"], input[placeholder*="search" i], [data-testid="search-input"]'
        )
        .first()
      if (await searchInput.isVisible()) {
        // Step 3: Enter search query
        await searchInput.fill('claude')
        await searchInput.press('Enter')

        // Wait for results to update
        await page.waitForTimeout(1000)
      }

      // Step 4: Try to apply a filter if available
      const filterSelect = page.locator('select, [data-testid="filter"]').first()
      if (await filterSelect.isVisible()) {
        const options = await filterSelect.locator('option').count()
        if (options > 1) {
          await filterSelect.selectOption({ index: 1 })
          // Wait for table to update
          await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {})
        }
      }

      // Step 5: Try sorting if available
      const sortButton = page.locator('th button, [data-testid="sort"]').first()
      if (await sortButton.isVisible()) {
        await sortButton.click()
        // Wait for sort to apply
        await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => {})
      }

      // No console errors
      consoleMonitor.assertNoErrors()
    } finally {
      await page.close()
      await context.close()
    }
  })

  test('Journey 5: View AI analysis results', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const consoleMonitor = new ConsoleMonitor(page)
    await consoleMonitor.startMonitoring()

    try {
      // Step 1: Navigate to requests
      await page.goto(`${testData.testConfig.baseUrl}/requests`)
      await page.waitForLoadState('networkidle')

      // Step 2: Look for request with analysis indicator
      const analysisIndicator = page
        .locator('.analysis-badge, [data-testid="has-analysis"], text=/analysis/i')
        .first()
      if (await analysisIndicator.isVisible()) {
        // Click on the request with analysis
        const requestRow = analysisIndicator
          .locator('xpath=ancestor::tr | ancestor::*[@class="request-item"]')
          .first()
        const requestLink = requestRow.locator('a').first()
        await requestLink.click()

        // Step 3: Wait for request details page
        await page.waitForURL('**/request/**')

        // Step 4: Check for analysis panel
        const analysisPanel = page
          .locator('.analysis-panel, [data-testid="analysis-panel"], text=/analysis/i')
          .first()
        await expect(analysisPanel).toBeVisible()

        // Step 5: Verify analysis content loaded
        const analysisContent = page
          .locator('.analysis-content, [data-testid="analysis-content"]')
          .first()
        if (await analysisContent.isVisible()) {
          await expect(analysisContent).not.toBeEmpty()
        }
      }

      // No console errors
      consoleMonitor.assertNoErrors()
    } finally {
      await page.close()
      await context.close()
    }
  })

  // Performance journey test
  test('Journey 6: Dashboard navigation performance', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser)
    const page = await context.newPage()

    const navigationTimes: number[] = []

    try {
      // Test navigation speed between main pages
      const routes = ['/dashboard', '/requests', '/token-usage', '/overview']

      for (const route of routes) {
        const startTime = Date.now()
        await page.goto(`${testData.testConfig.baseUrl}${route}`)
        await page.waitForLoadState('domcontentloaded')
        const loadTime = Date.now() - startTime

        navigationTimes.push(loadTime)

        // Each page should load within reasonable time (relaxed for CI)
        const isCI = !!process.env.CI
        expect(loadTime).toBeLessThan(isCI ? 3000 : 2000)
      }

      // Average load time should be reasonable (relaxed for CI)
      const isCI = !!process.env.CI
      const avgTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length
      expect(avgTime).toBeLessThan(isCI ? 2000 : 1500)
    } finally {
      await page.close()
      await context.close()
    }
  })
})
