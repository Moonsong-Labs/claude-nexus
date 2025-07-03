// Combined setup for Bun test runner
import globalSetup from './global-setup.js'
import globalTeardown from './global-teardown.js'

// Run setup before all tests
await globalSetup()

// Register teardown to run after all tests
process.on('beforeExit', async () => {
  await globalTeardown()
})
