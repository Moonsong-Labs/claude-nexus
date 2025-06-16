// Preload script to ensure .env is loaded before ES modules
const { config } = require('dotenv');
const { join } = require('path');
const { existsSync } = require('fs');

// Try to load .env from root directory
const rootEnv = join(__dirname, '..', '..', '.env');
if (existsSync(rootEnv)) {
  const result = config({ path: rootEnv });
  if (!result.error) {
    console.log(`Loaded environment from ${rootEnv}`);
  }
} else {
  // Fallback to current directory
  config();
}