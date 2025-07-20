# Configuration Quick Start

This guide helps you quickly configure Claude Nexus Proxy. For a complete reference of all environment variables, see the [Environment Variables Reference](../06-Reference/environment-vars.md).

## Essential Configuration

To get started, you need to configure these essential settings:

### 1. Database Connection

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/claude_nexus
```

### 2. Dashboard Authentication

```bash
# Generate a secure key
DASHBOARD_API_KEY=$(openssl rand -hex 32)
```

### 3. Create a Basic .env File

```bash
# Essential configuration
DATABASE_URL=postgresql://localhost:5432/claude_nexus
DASHBOARD_API_KEY=your-secure-dashboard-key

# Enable storage (recommended)
STORAGE_ENABLED=true

# Service ports (defaults shown)
PROXY_PORT=3000
DASHBOARD_PORT=3001
```

## Setting Up Domain Credentials

Each domain needs its own credential file in the `credentials/` directory:

### 1. Generate a Secure Client API Key

```bash
bun run scripts/auth/generate-api-key.ts
```

### 2. Create Credential File

Create `credentials/yourdomain.com.credentials.json`:

```json
{
  "type": "api_key",
  "accountId": "acc_unique_identifier",
  "api_key": "sk-ant-...",
  "client_api_key": "cnp_live_..."
}
```

**Important:**

- The filename must match the domain used in API requests
- `accountId` is used for tracking token usage per account
- `client_api_key` authenticates clients to your proxy
- `api_key` is your Claude API key

For OAuth setup and other authentication methods, see the [Authentication Guide](../02-User-Guide/authentication.md).

## Database Setup

### Initialize the Database

```bash
# Create the database
createdb claude_nexus

# Run the initial schema
psql claude_nexus < scripts/init-database.sql

# Run migrations (if upgrading)
for file in scripts/db/migrations/*.ts; do bun run "$file"; done
```

For advanced database configuration and migration details, see the [Database Guide](../03-Operations/database.md).

## Docker Quick Start

### Using Docker Compose

```bash
# Clone the repository
git clone https://github.com/your-org/claude-nexus-proxy.git
cd claude-nexus-proxy

# Create .env file with your configuration
cp .env.example .env

# Start all services
./docker-up.sh up -d

# View logs
./docker-up.sh logs -f
```

### Production Deployment

For production environments, ensure you:

1. Use strong authentication keys
2. Enable HTTPS (via reverse proxy)
3. Configure proper database backups
4. Set appropriate resource limits

See the [Docker Deployment Guide](../03-Operations/deployment/docker.md) for detailed instructions.

## Next Steps

After basic configuration:

1. **Set up authentication** - See the [Authentication Guide](../02-User-Guide/authentication.md)
2. **Configure monitoring** - Enable Slack notifications and metrics
3. **Deploy to production** - Follow the [Deployment Guide](../03-Operations/deployment/)
4. **Enable advanced features** - AI analysis, MCP server, etc.

## Common Configuration Scenarios

### Development Environment

```bash
# Minimal setup for local development
DATABASE_URL=postgresql://localhost:5432/claude_nexus_dev
DASHBOARD_API_KEY=dev-key
DEBUG=true
STORAGE_ENABLED=true
ENABLE_CLIENT_AUTH=false
```

### Production with All Features

```bash
# Full-featured production setup
DATABASE_URL=postgresql://prod-db:5432/claude_nexus
DASHBOARD_API_KEY=$(openssl rand -hex 32)
STORAGE_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Enable AI analysis
AI_WORKER_ENABLED=true
GEMINI_API_KEY=your-gemini-key

# Enable MCP server
MCP_ENABLED=true
MCP_PROMPTS_DIR=./prompts
```

## Troubleshooting

Common issues:

- **Database connection fails** - Check DATABASE_URL format and network access
- **Dashboard auth fails** - Ensure DASHBOARD_API_KEY matches in requests
- **Domain not found** - Verify credential filename matches request domain

For detailed troubleshooting, see the [Common Issues Guide](../05-Troubleshooting/common-issues.md).

## Complete Reference

For all available configuration options, see:

- [Environment Variables Reference](../06-Reference/environment-vars.md) - Complete list of all variables
- [Security Configuration](../03-Operations/security.md) - Security best practices
- [Performance Tuning](../05-Troubleshooting/performance.md) - Optimization guidelines
