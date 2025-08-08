import { test, expect } from '@playwright/test';
import { ConsoleMonitor } from '../utils/console-monitor';
import { AuthHelper } from '../utils/auth-helper';
import { testData } from '../fixtures/test-data';

// Tag all tests as @smoke for CI filtering
test.describe('@smoke Dashboard Pages Smoke Tests', () => {
  // Run tests serially to avoid auth file conflicts
  test.describe.configure({ mode: 'serial' });
  let authHelper: AuthHelper;

  test.beforeAll(async ({ browser }) => {
    // Setup authentication once for all tests
    authHelper = new AuthHelper();
    const context = await authHelper.getAuthenticatedContext(browser);
    await context.close();
  });

  test.afterAll(() => {
    // Clean up auth file after tests
    authHelper.clearAuth();
  });

  // Test each dashboard route
  testData.dashboardRoutes.forEach(route => {
    test(`${route.name} (${route.path}) loads without console errors`, async ({ browser }) => {
      // Create authenticated context
      const context = await authHelper.getAuthenticatedContext(browser);
      const page = await context.newPage();
      
      // Setup console monitoring
      const consoleMonitor = new ConsoleMonitor(page);
      await consoleMonitor.startMonitoring();

      try {
        // Navigate to the page
        await page.goto(`${testData.testConfig.baseUrl}${route.path}`, {
          waitUntil: 'networkidle',
          timeout: testData.testConfig.defaultTimeout,
        });

        // Wait for page to be fully loaded
        await page.waitForLoadState('domcontentloaded');

        // Check page title exists
        await expect(page).toHaveTitle(/Claude Nexus/i);

        // Verify key elements are visible
        // Check for main container
        const mainContainer = page.locator('.container, [data-testid="main-container"]').first();
        await expect(mainContainer).toBeVisible({ timeout: 5000 });

        // For specific pages, check for expected elements
        switch (route.path) {
          case '/':
          case '/dashboard':
            // Check for stats grid on dashboard
            const statsGrid = page.locator('.stats-grid, [data-testid="stats-grid"]').first();
            await expect(statsGrid).toBeVisible();
            break;
          
          case '/requests':
            // Check for requests table or list
            const requestsList = page.locator('table, .request-list, [data-testid="requests-list"]').first();
            await expect(requestsList).toBeVisible();
            break;
          
          case '/token-usage':
            // Check for chart container
            const chartContainer = page.locator('canvas, .chart-container, [data-testid="token-chart"]').first();
            await expect(chartContainer).toBeVisible();
            break;

          case '/prompts':
            // Check for prompts container
            const promptsContainer = page.locator('.prompts-list, [data-testid="prompts-list"], .section').first();
            await expect(promptsContainer).toBeVisible();
            break;
        }

        // Assert no console errors
        consoleMonitor.assertNoErrors();

        // Take screenshot on success (optional, for debugging)
        if (process.env.CAPTURE_SCREENSHOTS === 'true') {
          await page.screenshot({ 
            path: `test-results/screenshots/${route.name.replace(/\s+/g, '-').toLowerCase()}-success.png`,
            fullPage: true 
          });
        }

      } catch (error) {
        // Take screenshot on failure
        await page.screenshot({ 
          path: `test-results/screenshots/${route.name.replace(/\s+/g, '-').toLowerCase()}-failure.png`,
          fullPage: true 
        });
        
        // Log console errors if any
        const errors = consoleMonitor.getErrors();
        if (errors.length > 0) {
          console.error(`Console errors on ${route.path}:`, consoleMonitor.getErrorReport());
        }

        throw error;
      } finally {
        await page.close();
        await context.close();
      }
    });
  });

  // Test error pages
  test('404 page handles gracefully', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser);
    const page = await context.newPage();
    
    const consoleMonitor = new ConsoleMonitor(page);
    await consoleMonitor.startMonitoring();

    // Navigate to non-existent page
    const response = await page.goto(`${testData.testConfig.baseUrl}/non-existent-page`, {
      waitUntil: 'networkidle',
    });

    // Should return 404 or 200 (for SPAs)
    expect([404, 200]).toContain(response?.status());
    
    // Check for 404 UI elements if applicable
    const notFoundText = page.locator('text=/not found|404|error/i').first();
    if (await notFoundText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(notFoundText).toBeVisible();
    }

    // Should still not have console errors
    consoleMonitor.assertNoErrors();

    await page.close();
    await context.close();
  });

  // Test page performance
  test('Dashboard loads within performance budget', async ({ browser }) => {
    const context = await authHelper.getAuthenticatedContext(browser);
    const page = await context.newPage();

    const startTime = Date.now();
    
    await page.goto(`${testData.testConfig.baseUrl}/dashboard`, {
      waitUntil: 'networkidle',
    });

    const loadTime = Date.now() - startTime;

    // Page should load within reasonable time (relaxed for CI)
    const isCI = !!process.env.CI;
    expect(loadTime).toBeLessThan(isCI ? 5000 : 3000);

    await page.close();
    await context.close();
  });
});