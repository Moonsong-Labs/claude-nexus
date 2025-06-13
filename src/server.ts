import { serve } from "@hono/node-server";
import app from './index'
import * as process from 'node:process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDomainCredentialMapping, validateCredentialMapping } from './credentials';
import { config as dotenvConfig } from 'dotenv';
import { tokenTracker } from './tokenTracker';

// Load .env file from multiple possible locations
const envPaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '.env.local'),
  join(dirname(process.argv[1]), '.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    const result = dotenvConfig({ path: envPath });
    if (!result.error) {
      console.log(`Loaded configuration from ${envPath}`);
      break;
    }
  }
}

const args = process.argv.slice(2);

// Check for --env-file argument
const envFileIndex = args.findIndex(arg => arg === '--env-file' || arg === '-e');
if (envFileIndex !== -1 && args[envFileIndex + 1]) {
  const customEnvPath = args[envFileIndex + 1];
  if (existsSync(customEnvPath)) {
    const result = dotenvConfig({ path: customEnvPath });
    if (!result.error) {
      console.log(`Loaded configuration from ${customEnvPath}`);
    } else {
      console.error(`Error loading env file ${customEnvPath}:`, result.error);
    }
  } else {
    console.error(`Env file not found: ${customEnvPath}`);
  }
  // Remove the env-file args so they don't interfere with other parsing
  args.splice(envFileIndex, 2);
}

function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Try multiple possible paths for package.json
    const possiblePaths = [
      join(__dirname, '..', 'package.json'),  // Development
      join(__dirname, 'package.json'),        // npm install
      join(__dirname, '..', '..', 'package.json')  // Other scenarios
    ];

    for (const packagePath of possiblePaths) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
        return packageJson.version;
      } catch {
        continue;
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}


function showHelp() {
  console.log(`Claude Nexus Proxy v${getPackageVersion()}

Usage: claude-nexus-proxy [options]

Options:
  -v, --version              Show version number
  -h, --help                 Show this help message
  -p, --port PORT            Set server port (default: 3000)
  -H, --host HOST            Set server hostname (default: 0.0.0.0)
  -e, --env-file FILE        Load environment from specific file

Environment Variables:
  PORT                        Server port (default: 3000)
  HOST                        Server hostname (default: 0.0.0.0)
  CLAUDE_CODE_PROXY_API_KEY   Bearer token for upstream API
  ANTHROPIC_PROXY_BASE_URL    Upstream API URL (default: https://models.github.ai/inference)
  REASONING_MODEL             Model for reasoning requests (default: openai/gpt-4.1)
  COMPLETION_MODEL            Model for completion requests (default: openai/gpt-4.1)
  REASONING_MAX_TOKENS        Max tokens for reasoning model (optional)
  COMPLETION_MAX_TOKENS       Max tokens for completion model (optional)
  PROXY_MODE                  Proxy mode: 'translation' or 'passthrough' (default: translation)
  CLAUDE_API_KEY              Claude API key for passthrough mode (optional)
  DOMAIN_CREDENTIAL_MAPPING   JSON mapping of domains to credential files (optional)
  TELEMETRY_ENDPOINT          URL to send telemetry data (optional)
  DEBUG                       Enable debug logging (default: false)
  SLACK_WEBHOOK_URL           Slack webhook URL for notifications (optional)
  SLACK_CHANNEL               Slack channel override (optional)
  SLACK_USERNAME              Slack bot username (default: Claude Nexus Proxy)
  SLACK_ICON_EMOJI            Slack bot icon (default: :robot_face:)
  SLACK_ENABLED               Enable/disable Slack notifications (default: true if webhook provided)

Examples:
  claude-nexus-proxy
  claude-nexus-proxy --port 8080
  claude-nexus-proxy --host localhost --port 3000
  claude-nexus-proxy --env-file .env.production
  PORT=8787 HOST=127.0.0.1 claude-nexus-proxy

Note: The proxy automatically loads .env file from the current directory.
Use --env-file to specify a different configuration file.`);
}

if (args.includes('-v') || args.includes('--version')) {
  console.log(getPackageVersion());
  process.exit(0);
}

if (args.includes('-h') || args.includes('--help')) {
  showHelp();
  process.exit(0);
}

let port = parseInt(process.env.PORT || '3000', 10);
let hostname = process.env.HOST || '0.0.0.0';

const portIndex = args.findIndex(arg => arg === '-p' || arg === '--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  port = parseInt(args[portIndex + 1], 10);
  if (isNaN(port)) {
    console.error('Error: Invalid port number');
    process.exit(1);
  }
}

const hostIndex = args.findIndex(arg => arg === '-H' || arg === '--host');
if (hostIndex !== -1 && args[hostIndex + 1]) {
  hostname = args[hostIndex + 1];
}

// Validate credential mapping at startup
if (process.env.DOMAIN_CREDENTIAL_MAPPING) {
  const domainMapping = parseDomainCredentialMapping(process.env.DOMAIN_CREDENTIAL_MAPPING);
  const validationErrors = validateCredentialMapping(domainMapping);
  
  if (validationErrors.length > 0) {
    console.error('⚠️  Credential validation errors:');
    validationErrors.forEach(error => console.error(`   - ${error}`));
    console.error('\nThe proxy will start, but affected domains may not work properly.\n');
  } else if (Object.keys(domainMapping).length > 0) {
    console.log(`✓ Validated ${Object.keys(domainMapping).length} domain credential mapping(s)`);
  }
  
  // Print supported hosts
  if (Object.keys(domainMapping).length > 0) {
    console.log('\nSupported hosts:');
    Object.entries(domainMapping).forEach(([domain, credPath]) => {
      // Show the path as configured (not resolved)
      console.log(`  - ${domain} → ${credPath}`);
    });
    console.log('');
  }
}

// Print proxy mode and configuration
const proxyMode = process.env.PROXY_MODE || 'translation';
console.log(`Claude Nexus Proxy v${getPackageVersion()}`);
console.log(`Mode: ${proxyMode}`);

if (proxyMode === 'translation') {
  console.log(`Upstream: ${process.env.ANTHROPIC_PROXY_BASE_URL || 'https://models.github.ai/inference'}`);
  if (process.env.REASONING_MODEL || process.env.COMPLETION_MODEL) {
    console.log('Models:');
    if (process.env.REASONING_MODEL) console.log(`  - Reasoning: ${process.env.REASONING_MODEL}`);
    if (process.env.COMPLETION_MODEL) console.log(`  - Completion: ${process.env.COMPLETION_MODEL}`);
  }
} else if (proxyMode === 'passthrough') {
  console.log('Target: Claude API (https://api.anthropic.com)');
  if (process.env.TELEMETRY_ENDPOINT) {
    console.log(`Telemetry: ${process.env.TELEMETRY_ENDPOINT}`);
  }
}

// Show Slack configuration if enabled
if (process.env.SLACK_WEBHOOK_URL) {
  console.log('\nSlack Integration:');
  console.log(`  - Webhook: Configured`);
  if (process.env.SLACK_CHANNEL) console.log(`  - Channel: ${process.env.SLACK_CHANNEL}`);
  if (process.env.SLACK_USERNAME) console.log(`  - Username: ${process.env.SLACK_USERNAME}`);
  console.log(`  - Enabled: ${process.env.SLACK_ENABLED !== 'false' ? 'Yes' : 'No'}`);
}

// Start token usage tracking
tokenTracker.startReporting(10000) // Report every 10 seconds

const server = serve({
  port: port,
  hostname: hostname,
  fetch: app.fetch
})

console.log(`\nListening on http://${hostname}:${port}`);
console.log(`Local: http://localhost:${port}`);

// Get network interfaces to show accessible URLs
try {
  const os = await import('os');
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  if (addresses.length > 0) {
    console.log('Network:', addresses.map(addr => `http://${addr}:${port}`).join(', '));
  }
} catch (err) {
  // Ignore errors getting network interfaces
}

// Handle graceful shutdown
let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\n\nShutting down server...');
  tokenTracker.stop();
  
  // The @hono/node-server doesn't expose a close method directly
  // We'll just exit the process after cleaning up
  process.exit(0);
};

// Listen for termination signals
process.on('SIGINT', shutdown);  // CTRL+C
process.on('SIGTERM', shutdown); // Docker stop
process.on('SIGQUIT', shutdown); // Quit signal

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't call shutdown for unhandled rejections, just log them
});
