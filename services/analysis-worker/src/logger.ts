/**
 * Simple logger for analysis worker
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG === 'true') {
      console.log('[DEBUG]', ...args)
    }
  },
  info: (...args: unknown[]) => {
    console.log('[INFO]', ...args)
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args)
  },
}
