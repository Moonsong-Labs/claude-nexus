export const SERVICE_NAME = 'claude-nexus-proxy'
export const SERVICE_VERSION = process.env.npm_package_version || 'unknown'
export const DEFAULT_CACHE_CONTROL = 'public, max-age=3600'

export const CONTENT_TYPES = {
  JSON: 'application/json',
  JAVASCRIPT: 'application/javascript',
  SHELL: 'text/x-shellscript',
  PLAIN: 'text/plain',
} as const

export const ERROR_TYPES = {
  INTERNAL_ERROR: 'internal_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
} as const

export const ERROR_MESSAGES = {
  INTERNAL_SERVER_ERROR: 'Internal server error',
  DATABASE_UNAVAILABLE: 'Database service is not available',
  INVALID_FILENAME: 'Invalid filename',
  FILE_NOT_FOUND: 'File not found',
} as const

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const