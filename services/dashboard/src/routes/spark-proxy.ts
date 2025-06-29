import { Hono } from 'hono'

export const sparkProxyRoutes = new Hono<{
  Variables: {
    apiClient?: any
  }
}>()

/**
 * Proxy Spark feedback requests to the proxy service
 * This avoids CORS and authentication issues for browser-based requests
 */
sparkProxyRoutes.post('/spark/feedback', async c => {
  const apiClient = c.get('apiClient')
  if (!apiClient) {
    return c.json({ error: 'API client not available' }, 503)
  }

  try {
    const body = await c.req.json()
    const response = await apiClient.post('/api/spark/feedback', body)
    return c.json(response)
  } catch (error: any) {
    console.error('Failed to submit Spark feedback:', error)
    return c.json({ error: error.message || 'Failed to submit feedback' }, error.status || 500)
  }
})
