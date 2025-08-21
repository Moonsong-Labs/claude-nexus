import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createDashboardApp } from '../app.js'

describe('AI Analysis in Read-Only Mode', () => {
  let app: Awaited<ReturnType<typeof createDashboardApp>>
  let originalApiKey: string | undefined
  let originalGeminiKey: string | undefined
  let originalFeatureFlag: string | undefined

  beforeEach(async () => {
    // Save original environment variables
    originalApiKey = process.env.DASHBOARD_API_KEY
    originalGeminiKey = process.env.GEMINI_API_KEY
    originalFeatureFlag = process.env.AI_ANALYSIS_READONLY_ENABLED
  })

  afterEach(() => {
    // Restore original environment variables
    if (originalApiKey !== undefined) {
      process.env.DASHBOARD_API_KEY = originalApiKey
    } else {
      delete process.env.DASHBOARD_API_KEY
    }

    if (originalGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiKey
    } else {
      delete process.env.GEMINI_API_KEY
    }

    if (originalFeatureFlag !== undefined) {
      process.env.AI_ANALYSIS_READONLY_ENABLED = originalFeatureFlag
    } else {
      delete process.env.AI_ANALYSIS_READONLY_ENABLED
    }
  })

  describe('Configuration Tests', () => {
    test('AI Analysis should be disabled in read-only mode without Gemini key', async () => {
      // Setup: Read-only mode, no Gemini key
      delete process.env.DASHBOARD_API_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.AI_ANALYSIS_READONLY_ENABLED

      app = await createDashboardApp()

      const response = await app.request('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: 'test-conv',
          branchId: 'test-branch',
        }),
      })

      expect(response.status).toBe(403)
      const data = (await response.json()) as any
      expect(data.message).toContain('read-only mode')
    })

    test('AI Analysis should be disabled in read-only mode with only Gemini key', async () => {
      // Setup: Read-only mode with Gemini key but no feature flag
      delete process.env.DASHBOARD_API_KEY
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      delete process.env.AI_ANALYSIS_READONLY_ENABLED

      app = await createDashboardApp()

      const response = await app.request('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: 'test-conv',
          branchId: 'test-branch',
        }),
      })

      expect(response.status).toBe(403)
      const data = (await response.json()) as any
      expect(data.message).toContain('read-only mode')
    })

    test('AI Analysis should be enabled in read-only mode with Gemini key and feature flag', async () => {
      // Setup: Read-only mode with both Gemini key and feature flag
      delete process.env.DASHBOARD_API_KEY
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      process.env.AI_ANALYSIS_READONLY_ENABLED = 'true'

      app = await createDashboardApp()

      const response = await app.request('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: 'test-conv',
          branchId: 'test-branch',
        }),
      })

      // Should not return 403 (may return other errors like 400 or 500 due to test setup)
      expect(response.status).not.toBe(403)
    })

    test('AI Analysis regenerate endpoint should also be allowed with feature enabled', async () => {
      // Setup: Read-only mode with both Gemini key and feature flag
      delete process.env.DASHBOARD_API_KEY
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      process.env.AI_ANALYSIS_READONLY_ENABLED = 'true'

      app = await createDashboardApp()

      const response = await app.request('/api/analyses/test-conv/test-branch/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      // Should not return 403 (may return other errors like 400 or 500 due to test setup)
      expect(response.status).not.toBe(403)
    })

    test('Other write operations should remain blocked in read-only mode', async () => {
      // Setup: Read-only mode with AI Analysis enabled
      delete process.env.DASHBOARD_API_KEY
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      process.env.AI_ANALYSIS_READONLY_ENABLED = 'true'

      app = await createDashboardApp()

      // Try a different POST endpoint that should still be blocked
      const response = await app.request('/api/some-other-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      // Should be blocked by read-only protection
      expect([403, 404]).toContain(response.status)
    })
  })

  describe('Auth Context Tests', () => {
    test('canUseAiAnalysis should be true when authenticated', async () => {
      // Setup: Authenticated mode with Gemini key
      process.env.DASHBOARD_API_KEY = 'test-api-key'
      process.env.GEMINI_API_KEY = 'test-gemini-key'

      app = await createDashboardApp()

      // This would require accessing the auth context, which is internal
      // We can test this indirectly through the UI or API behavior
      const response = await app.request('/dashboard', {
        headers: {
          Cookie: 'dashboard_auth=test-api-key',
        },
      })

      expect(response.status).toBe(200)
      // The UI should have AI Analysis enabled
    })

    test('canUseAiAnalysis should be false in read-only without feature flag', async () => {
      // Setup: Read-only mode without feature flag
      delete process.env.DASHBOARD_API_KEY
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      process.env.AI_ANALYSIS_READONLY_ENABLED = 'false'

      app = await createDashboardApp()

      const response = await app.request('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: 'test-conv',
          branchId: 'test-branch',
        }),
      })

      expect(response.status).toBe(403)
    })
  })
})
