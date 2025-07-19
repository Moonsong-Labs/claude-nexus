import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execCallback)

// Configuration constants
const DOCKER_COMPOSE_PATH = 'docker/docker-compose.yml'
const DOCKER_COMPOSE_CMD = `docker compose -f ${DOCKER_COMPOSE_PATH}`
const PROXY_URL = 'http://localhost:3000'
const DASHBOARD_URL = 'http://localhost:3001'
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || 'test-key'

// Timeout constants (in milliseconds)
const SERVICE_STARTUP_TIMEOUT = 15000 // 15 seconds for services to start
const REQUEST_PROCESSING_TIMEOUT = 3000 // 3 seconds for request processing
const SERVICE_RESTART_TIMEOUT = 8000 // 8 seconds for service restart

// Helper types
interface ExecResult {
  stdout: string
  stderr: string
}

// Helper functions
async function waitForService(url: string, timeout: number = SERVICE_STARTUP_TIMEOUT): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 401) { // 401 means service is up but needs auth
        return
      }
    } catch (error) {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Service at ${url} did not become ready within ${timeout}ms`)
}

async function getRequestCount(): Promise<number> {
  const response = await fetch(`${DASHBOARD_URL}/api/requests?limit=1`, {
    headers: {
      'X-Dashboard-Key': DASHBOARD_API_KEY
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to get request count: ${response.statusText}`)
  }
  
  const data = await response.json()
  // The API returns { total, requests: [...] }
  return data.total || 0
}

describe('Claude CLI End-to-End Tests', () => {
  let dockerComposeUp = false

  beforeAll(async () => {
    // Check if services are already running
    try {
      const { stdout } = await exec(`${DOCKER_COMPOSE_CMD} ps --format json`)
      const services = JSON.parse(stdout || '[]')
      const proxyRunning = services.some((s: any) => 
        s.Service === 'proxy' && s.State === 'running'
      )
      
      if (!proxyRunning) {
        console.log('Starting Docker services...')
        await exec(`${DOCKER_COMPOSE_CMD} --profile dev --profile claude up -d`)
        dockerComposeUp = true
        
        // Wait for services to be ready
        await waitForService(PROXY_URL)
        await waitForService(DASHBOARD_URL)
      }
    } catch (error) {
      console.error('Failed to check/start Docker services:', error)
      throw error
    }
  }, SERVICE_STARTUP_TIMEOUT * 2) // Double timeout for startup

  afterAll(async () => {
    if (dockerComposeUp) {
      console.log('Stopping Docker services...')
      try {
        await exec(`${DOCKER_COMPOSE_CMD} down`)
      } catch (error) {
        console.error('Failed to stop Docker services:', error)
      }
    }
  })

  describe('Claude CLI Integration', () => {
    it('should connect to proxy successfully', async () => {
      const { stdout } = await exec(
        `${DOCKER_COMPOSE_CMD} exec -T claude-cli cat /root/.claude.json`
      )

      const config = JSON.parse(stdout)
      expect(config.api.endpoint).toBe('http://proxy:3000/v1')
    })

    it('should have credentials configured', async () => {
      const { stdout } = await exec(
        `${DOCKER_COMPOSE_CMD} exec -T claude-cli cat /root/.claude/.credentials.json`
      )

      const creds = JSON.parse(stdout)
      expect(creds.claudeAiOauth).toBeDefined()
      expect(creds.claudeAiOauth.accessToken).toBeDefined()
    })

    it('should send request through proxy', async () => {
      // Skip if running in CI environment without real credentials
      if (process.env.CI) {
        console.log('Skipping live API test in CI environment')
        return
      }

      try {
        const { stdout, stderr } = await exec(
          `${DOCKER_COMPOSE_CMD} exec -T claude-cli /usr/local/bin/setup-claude claude "What is 2+2?"`
        )

        // Should get a response (or at least not an auth error)
        expect(stderr).not.toContain('Invalid API key')
        
        // If we got a response, it should contain "4"
        if (stdout && !stderr) {
          expect(stdout.toLowerCase()).toContain('4')
        }
      } catch (error: any) {
        // Even if the command fails, it shouldn't be due to invalid API key
        expect(error.stderr || '').not.toContain('Invalid API key')
        
        // Log the actual error for debugging
        console.error('Claude CLI execution error:', {
          code: error.code,
          stderr: error.stderr,
          stdout: error.stdout
        })
      }
    })
  })

  describe('Proxy Logging', () => {
    let initialCount: number

    beforeEach(async () => {
      // Get initial request count from API
      initialCount = await getRequestCount()
    })

    it('should log requests through API', async () => {
      // Make a test request (ignore errors as we're testing logging)
      try {
        await exec(
          `${DOCKER_COMPOSE_CMD} exec -T claude-cli /usr/local/bin/setup-claude claude "test request"`
        )
      } catch (error) {
        // Expected to fail without valid credentials, but should still log
        console.log('Request failed as expected (testing logging functionality)')
      }

      // Wait for the request to be processed and logged
      await new Promise(resolve => setTimeout(resolve, REQUEST_PROCESSING_TIMEOUT))

      // Check request count increased via API
      const finalCount = await getRequestCount()
      expect(finalCount).toBeGreaterThan(initialCount)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid API keys gracefully', async () => {
      try {
        const { stdout, stderr } = await exec(
          `${DOCKER_COMPOSE_CMD} exec -T claude-cli /usr/local/bin/setup-claude claude "test"`
        )
        
        // If command succeeds, we have valid credentials
        expect(stdout || stderr).toBeTruthy()
      } catch (error: any) {
        // Command failed - check it failed gracefully
        expect(error.code).toBeDefined()
        expect(error.code).not.toBe(0)
        
        // Should have meaningful error output
        const errorOutput = error.stderr || error.stdout || ''
        expect(errorOutput.length).toBeGreaterThan(0)
      }
    })

    it('should handle network errors', async () => {
      // Stop proxy service
      await exec(`${DOCKER_COMPOSE_CMD} stop proxy`)

      try {
        await exec(
          `${DOCKER_COMPOSE_CMD} exec -T claude-cli /usr/local/bin/setup-claude claude "test"`
        )
        
        // Should not reach here
        expect(true).toBe(false)
      } catch (error: any) {
        // Expected to fail due to network error
        expect(error.code).not.toBe(0)
        
        const errorOutput = error.stderr || error.stdout || ''
        // Should contain network-related error message
        expect(errorOutput.toLowerCase()).toMatch(/connect|network|refused|unreachable/i)
      } finally {
        // Always restart proxy
        await exec(`${DOCKER_COMPOSE_CMD} start proxy`)
        await waitForService(PROXY_URL, SERVICE_RESTART_TIMEOUT)
      }
    })
  })
})