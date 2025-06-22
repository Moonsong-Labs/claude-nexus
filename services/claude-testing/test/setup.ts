import { beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Global test setup
beforeAll(async () => {
  console.log('🚀 Setting up test environment...');
  
  // Wait for services to be healthy
  await waitForServices();
  
  // Seed the database if needed
  if (process.env.SEED_DATABASE === 'true') {
    console.log('🌱 Seeding database...');
    await execAsync('bun run db:seed');
  }
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  // Add any cleanup logic here
});

async function waitForServices(maxRetries = 30, delayMs = 1000) {
  const proxyUrl = process.env.PROXY_API_URL || 'http://proxy:3000';
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${proxyUrl}/health`);
      if (response.ok) {
        console.log('✅ Proxy service is healthy');
        return;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    if (i < maxRetries - 1) {
      console.log(`⏳ Waiting for services... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error('Services failed to become healthy in time');
}