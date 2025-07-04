import { describe, test, beforeAll, afterAll, beforeEach } from 'bun:test'
import { readdir, readFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { spawn, type Subprocess } from 'bun'
import { ApiClient } from './apiClient'
import { DatabaseClient } from './dbClient'
import { TestRunner, type TestFixture } from './runner'

// Test configuration from environment
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://testuser:testpassword@localhost:5433/testdb'
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
const PROXY_PORT = process.env.PROXY_PORT || '3000'

// Global test resources
let dbClient: DatabaseClient
let apiClient: ApiClient
let testRunner: TestRunner
let proxyProcess: Subprocess | null = null
let dockerComposeProcess: Subprocess | null = null

async function checkDockerAvailable(): Promise<void> {
  try {
    const result = spawn(['docker', '--version'], { stdout: 'pipe', stderr: 'pipe' })
    await result.exited
    if (result.exitCode !== 0) {
      throw new Error('Docker command failed')
    }
  } catch (error) {
    throw new Error(
      'Docker is required to run E2E tests. Please install Docker and ensure it is running.'
    )
  }
}

async function startDockerCompose(): Promise<void> {
  await checkDockerAvailable()

  console.log('Starting Docker Compose for PostgreSQL and Mock Claude API...')

  dockerComposeProcess = spawn(
    [
      'docker-compose',
      '-f',
      join(import.meta.dir, '../docker-compose.e2e.yml'),
      'up',
      '-d',
      '--build',
    ],
    {
      cwd: join(import.meta.dir, '..'),
      stdout: 'inherit',
      stderr: 'inherit',
    }
  )

  await dockerComposeProcess.exited

  // Wait for both services to be ready
  console.log('Containers started, waiting for services to be ready...')
}

async function stopDockerCompose(): Promise<void> {
  if (dockerComposeProcess) {
    console.log('Stopping Docker Compose...')
    const stopProcess = spawn(
      ['docker-compose', '-f', join(import.meta.dir, '../docker-compose.e2e.yml'), 'down', '-v'],
      {
        cwd: join(import.meta.dir, '..'),
        stdout: 'inherit',
        stderr: 'inherit',
      }
    )
    await stopProcess.exited
  }
}

async function startProxyServer(): Promise<void> {
  console.log('Starting proxy server...')

  // Create test credentials directory and file
  const credentialsDir = join(import.meta.dir, '../test-credentials')
  await mkdir(credentialsDir, { recursive: true })

  const testCredentials = {
    type: 'api_key',
    accountId: 'acc_e2e_test',
    api_key: process.env.TEST_CLAUDE_API_KEY || 'sk-ant-test-key',
    client_api_key: process.env.TEST_CLIENT_API_KEY || 'cnp_test_1234567890',
  }

  await Bun.write(
    join(credentialsDir, 'e2e-test.com.credentials.json'),
    JSON.stringify(testCredentials, null, 2)
  )

  // Start the proxy server
  proxyProcess = spawn(['bun', 'run', 'dev:proxy'], {
    cwd: join(import.meta.dir, '../..'),
    env: {
      ...process.env,
      DATABASE_URL,
      STORAGE_ENABLED: 'true',
      CREDENTIALS_DIR: credentialsDir,
      PORT: PROXY_PORT,
      DEBUG: 'false',
      CLAUDE_API_BASE_URL: 'http://localhost:8081', // Point to mock service
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Wait for server to be ready with timeout
  const PROXY_STARTUP_TIMEOUT = 30000 // 30 seconds
  const startTime = Date.now()

  if (proxyProcess.stdout) {
    const reader = proxyProcess.stdout.getReader()
    const decoder = new TextDecoder()

    while (true) {
      // Check timeout
      if (Date.now() - startTime > PROXY_STARTUP_TIMEOUT) {
        reader.releaseLock()
        proxyProcess.kill()
        throw new Error(
          `Proxy server failed to start within ${PROXY_STARTUP_TIMEOUT / 1000} seconds`
        )
      }

      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      console.log('[PROXY]', text)

      if (text.includes('Listening on') || text.includes('Server started successfully')) {
        reader.releaseLock()
        console.log('Proxy server is ready')
        break
      }
    }
  }

  // Give it a bit more time to fully initialize
  await new Promise(resolve => setTimeout(resolve, 1000))
}

async function stopProxyServer(): Promise<void> {
  if (proxyProcess) {
    console.log('Stopping proxy server...')
    proxyProcess.kill()
    await proxyProcess.exited
  }
}

// Setup and teardown
beforeAll(async () => {
  // Start Docker Compose
  await startDockerCompose()

  // Initialize database client with retry
  dbClient = new DatabaseClient(DATABASE_URL)
  await dbClient.connectWithRetry()

  // Start proxy server
  await startProxyServer()

  // Initialize API client and test runner
  apiClient = new ApiClient(PROXY_URL)
  testRunner = new TestRunner(apiClient, dbClient)
})

async function cleanupTestCredentials(): Promise<void> {
  try {
    const credentialsDir = join(import.meta.dir, '../test-credentials')
    await rm(credentialsDir, { recursive: true, force: true })
    console.log('Cleaned up test credentials')
  } catch (error) {
    console.warn('Failed to cleanup test credentials:', error)
  }
}

afterAll(async () => {
  try {
    // Stop proxy server
    await stopProxyServer()

    // Disconnect database
    if (dbClient) {
      await dbClient.disconnect()
    }
  } finally {
    // Cleanup test credentials
    await cleanupTestCredentials()

    // Stop Docker Compose
    await stopDockerCompose()
  }
})

// Load and run test fixtures
const fixturesDir = join(import.meta.dir, '../fixtures')

describe('E2E Proxy Tests', async () => {
  let fixtureFiles: string[] = []

  try {
    const files = await readdir(fixturesDir)
    fixtureFiles = files.filter(f => f.endsWith('.json'))
  } catch (error) {
    console.warn('No fixtures directory found:', error)
  }

  for (const file of fixtureFiles) {
    const fixturePath = join(fixturesDir, file)
    const fixtureContent = await readFile(fixturePath, 'utf-8')
    const fixture: TestFixture = JSON.parse(fixtureContent)

    describe(fixture.name, () => {
      let context: Record<string, any> = {}

      beforeEach(async () => {
        // Clean database before each test file
        await dbClient.cleanDatabase()
        // Reset context for each test file
        context = {}
      })

      // Run each step as a separate test
      for (let i = 0; i < fixture.steps.length; i++) {
        const step = fixture.steps[i]

        test(step.stepName, async () => {
          const newContext = await testRunner.executeTestStep(step, context, fixture.authentication)
          // Merge new context
          context = { ...context, ...newContext }
        })
      }
    })
  }
})
