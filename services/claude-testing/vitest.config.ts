import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for AI-generated tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    setupFiles: ['./test/setup.ts'],
    reporters: ['verbose', 'junit'],
    outputFile: {
      junit: './artifacts/test-results.xml'
    }
  }
});