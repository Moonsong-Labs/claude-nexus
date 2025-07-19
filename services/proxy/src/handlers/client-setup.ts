import type { Context } from 'hono'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../middleware/logger.js'
import { createErrorResponse } from '../utils/error-response.js'
import { 
  CONTENT_TYPES, 
  DEFAULT_CACHE_CONTROL, 
  ERROR_MESSAGES, 
  HTTP_STATUS 
} from '../constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function handleClientSetup(c: Context): Promise<Response> {
  const filename = c.req.param('filename')

  // Validate filename to prevent directory traversal
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return c.text(ERROR_MESSAGES.INVALID_FILENAME, HTTP_STATUS.BAD_REQUEST)
  }

  try {
    // Navigate from services/proxy/src/handlers to project root, then to client-setup
    const projectRoot = path.join(__dirname, '..', '..', '..', '..')
    const filePath = path.join(projectRoot, 'client-setup', filename)

    if (!fs.existsSync(filePath)) {
      return c.text(ERROR_MESSAGES.FILE_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const contentType = getContentType(filename)

    return c.text(content, HTTP_STATUS.OK, {
      'Content-Type': contentType,
      'Cache-Control': DEFAULT_CACHE_CONTROL,
    })
  } catch (error) {
    logger.error('Failed to serve client setup file', {
      metadata: {
        filename,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    return createErrorResponse(c, ERROR_MESSAGES.INTERNAL_SERVER_ERROR)
  }
}

function getContentType(filename: string): string {
  if (filename.endsWith('.json')) return CONTENT_TYPES.JSON
  if (filename.endsWith('.js')) return CONTENT_TYPES.JAVASCRIPT
  if (filename.endsWith('.sh')) return CONTENT_TYPES.SHELL
  return CONTENT_TYPES.PLAIN
}