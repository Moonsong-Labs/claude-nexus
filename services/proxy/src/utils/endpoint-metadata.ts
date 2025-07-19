import { config } from '@claude-nexus/shared/config'
import { SERVICE_NAME, SERVICE_VERSION } from '../constants.js'

interface EndpointMetadata {
  service: string
  version: string
  status: string
  endpoints: any
}

export function createEndpointMetadata(): EndpointMetadata {
  const endpoints: any = {
    api: '/v1/messages',
    health: '/health',
    stats: '/token-stats',
    'client-setup': '/client-setup/*',
    'dashboard-api': {
      stats: '/api/stats',
      requests: '/api/requests',
      'request-details': '/api/requests/:id',
      domains: '/api/domains',
    },
  }

  if (config.mcp.enabled) {
    endpoints.mcp = {
      discovery: '/mcp',
      rpc: '/mcp',
      'dashboard-api': {
        prompts: '/api/mcp/prompts',
        sync: '/api/mcp/sync',
        'sync-status': '/api/mcp/sync/status',
      },
    }
  }

  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    status: 'operational',
    endpoints,
  }
}