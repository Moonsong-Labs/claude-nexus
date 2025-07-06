/**
 * Proxy routes for MCP API endpoints
 */

import { Hono } from 'hono'
import { ProxyApiClient } from '../services/api-client.js'

export const mcpProxyRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>()

// Proxy MCP sync endpoint
mcpProxyRoutes.post('/mcp/sync', async c => {
  const apiClient = c.get('apiClient')

  if (!apiClient) {
    return c.json({ error: 'API client not configured' }, 500)
  }

  try {
    const response = await apiClient.fetch('/mcp/sync', {
      method: 'POST',
    })

    const data = (await response.json()) as any
    return c.json(data)
  } catch (error) {
    console.error('Error proxying MCP sync:', error)
    return c.json({ error: 'Failed to trigger sync' }, 500)
  }
})

// Proxy other MCP endpoints if needed
mcpProxyRoutes.get('/mcp/*', async c => {
  const apiClient = c.get('apiClient')
  const path = c.req.path.replace('/dashboard/api', '')

  if (!apiClient) {
    return c.json({ error: 'API client not configured' }, 500)
  }

  try {
    const response = await apiClient.fetch(path)
    const data = (await response.json()) as any
    return c.json(data)
  } catch (error) {
    console.error('Error proxying MCP request:', error)
    return c.json({ error: 'Failed to proxy request' }, 500)
  }
})
