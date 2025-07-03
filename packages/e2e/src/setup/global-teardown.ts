import type { ChildProcess } from 'child_process'
import type { Pool } from 'pg'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Server } from 'bun'

export default async function globalTeardown() {
  console.log('🧹 Cleaning up E2E test environment...')

  const globals = (global as any).__E2E__

  // Close database pool
  if (globals?.dbPool) {
    await (globals.dbPool as Pool).end()
  }

  // Stop mock Claude server
  if ((global as any).__MOCK_CLAUDE_SERVER__) {
    const mockServer = (global as any).__MOCK_CLAUDE_SERVER__ as Server
    mockServer.stop()
  }

  // Stop proxy server
  if ((global as any).__PROXY_PROCESS__) {
    const proxyProcess = (global as any).__PROXY_PROCESS__ as ChildProcess
    proxyProcess.kill('SIGTERM')

    // Wait for graceful shutdown
    await new Promise<void>(resolve => {
      proxyProcess.on('exit', () => resolve())
      setTimeout(() => {
        proxyProcess.kill('SIGKILL')
        resolve()
      }, 5000)
    })
  }

  // Stop PostgreSQL container
  if ((global as any).__POSTGRES_CONTAINER__) {
    const container = (global as any).__POSTGRES_CONTAINER__ as StartedPostgreSqlContainer
    await container.stop()
  }

  console.log('✅ E2E test environment cleaned up!')
}
