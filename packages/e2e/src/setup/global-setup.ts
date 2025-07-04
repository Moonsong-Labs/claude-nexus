import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { config } from 'dotenv'
import { resolve } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { Pool } from 'pg'
import { readFile } from 'fs/promises'
import { createMockClaudeServer } from './mock-claude.js'
import type { Server } from 'bun'

// Find root directory by looking for package.json
const findRootDir = () => {
  let dir = process.cwd()
  while (!dir.endsWith('claude-nexus-proxy')) {
    const parent = resolve(dir, '..')
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return dir
}

const rootDir = findRootDir()

config()

let postgresContainer: StartedPostgreSqlContainer
let proxyProcess: ChildProcess
let mockClaudeServer: Server
let dbPool: Pool

export default async function globalSetup() {
  console.log('🚀 Starting E2E test environment...')

  // Start PostgreSQL container
  console.log('📦 Starting PostgreSQL container...')
  postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('claude_nexus_test')
    .withUsername('test_user')
    .withPassword('test_pass')
    .withExposedPorts(5432)
    .start()

  const databaseUrl = `postgresql://test_user:test_pass@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(
    5432
  )}/claude_nexus_test`

  // Initialize database schema
  console.log('🗄️ Initializing database schema...')
  dbPool = new Pool({ connectionString: databaseUrl })

  const initSql = await readFile(resolve(rootDir, 'scripts/init-database.sql'), 'utf-8')
  await dbPool.query(initSql)

  // Note: The init-database.sql already contains the full schema
  // so we don't need to run individual migrations for E2E tests
  console.log('✅ Database schema initialized from init script')

  // Start mock Claude API server
  console.log('🤖 Starting mock Claude API server...')
  const mockPort = 3101
  mockClaudeServer = createMockClaudeServer(mockPort)
  console.log(`✅ Mock Claude API server running on port ${mockPort}`)

  // Start proxy server
  console.log('🔧 Starting proxy server...')
  const proxyPort = 3100 // Use a different port for E2E tests

  proxyProcess = spawn('bun', ['run', resolve(rootDir, 'services/proxy/src/main.ts')], {
    env: {
      ...process.env,
      PORT: String(proxyPort),
      DATABASE_URL: databaseUrl,
      STORAGE_ENABLED: 'true',
      DEBUG: 'false',
      ENABLE_CLIENT_AUTH: 'false', // Disable auth for E2E tests
      CLAUDE_API_URL: 'http://localhost:3101/mock-claude', // Mock Claude API
    },
    stdio: 'pipe',
  })

  // Capture proxy output for debugging
  proxyProcess.stdout?.on('data', data => {
    console.log(`[Proxy] ${data.toString().trim()}`)
  })

  proxyProcess.stderr?.on('data', data => {
    console.error(`[Proxy Error] ${data.toString().trim()}`)
  })

  proxyProcess.on('error', error => {
    console.error('Failed to start proxy process:', error)
    throw error
  })

  // Wait for proxy to be ready
  await waitForServer(`http://localhost:${proxyPort}/health`, 30000)

  // Store values in global for tests
  ;(global as any).__E2E__ = {
    databaseUrl,
    proxyUrl: `http://localhost:${proxyPort}`,
    dbPool,
  }

  // Store references for teardown
  ;(global as any).__POSTGRES_CONTAINER__ = postgresContainer
  ;(global as any).__PROXY_PROCESS__ = proxyProcess
  ;(global as any).__MOCK_CLAUDE_SERVER__ = mockClaudeServer

  console.log('✅ E2E test environment ready!')
}

async function waitForServer(url: string, timeout: number): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch (_error) {
      // Server not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`Server did not start within ${timeout}ms`)
}
