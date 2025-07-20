# Local Development Installation Guide

This guide walks you through setting up Claude Nexus Proxy for local development.

> **Note**: For production deployment, see the [Docker Deployment Guide](../03-Operations/deployment/docker.md) or [AWS Infrastructure Guide](../03-Operations/deployment/aws-infrastructure.md).

## Prerequisites

Before you begin, ensure you have:

- **[Bun](https://bun.sh)** runtime v1.0 or higher
- **PostgreSQL** database (v12 or higher recommended)
- **Claude API key** from Anthropic
- **Docker** (optional, for using docker-compose setup)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/moonsong-labs/claude-nexus-proxy.git
cd claude-nexus-proxy
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your settings
nano .env  # or use your preferred editor
```

Required environment variables:

```bash
# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/claude_nexus

# Dashboard authentication
DASHBOARD_API_KEY=your-secure-dashboard-key

# Enable storage (recommended)
STORAGE_ENABLED=true
```

### 4. Set Up the Database

```bash
# Create the database (if not exists)
createdb claude_nexus

# Initialize the database schema
# The proxy will automatically create tables on first startup using:
# scripts/init-database.sql

# For manual initialization (optional):
psql -d claude_nexus -f scripts/init-database.sql

# Run any additional migrations:
for file in scripts/db/migrations/*.ts; do bun run "$file"; done
```

### 5. Create Domain Credentials

```bash
# Create credentials directory
mkdir -p credentials

# Generate a secure client API key
bun run scripts/generate-api-key.ts

# Copy an example credential file
cp credentials/example.com.credentials.json credentials/localhost.credentials.json

# Edit the file with your Claude API key
# Replace 'sk-ant-your-claude-api-key' with your actual key
# Replace 'cnp_live_generated_key' with the key from generate-api-key.ts
```

### 6. Start the Services

```bash
# Start both proxy and dashboard
bun run dev

# Or start individually
bun run dev:proxy      # Proxy on port 3000
bun run dev:dashboard  # Dashboard on port 3001
```

## Alternative: Docker Compose Setup

For a complete environment with PostgreSQL, proxy, dashboard, and Claude CLI:

```bash
# Navigate to docker directory
cd docker

# Build and start all services
./docker-up.sh build
./docker-up.sh up -d

# View logs
./docker-up.sh logs -f

# Test with Claude CLI
./docker-up.sh exec claude-cli claude "Hello!"
```

See the [Docker Compose Guide](../03-Operations/deployment/docker-compose.md) for detailed instructions.

## Verification

After installation, verify everything is working:

### 1. Check Proxy Health

```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

### 2. Check Dashboard

Open http://localhost:3001 in your browser. You should see the login page.

### 3. Test API Call

```bash
# Replace with your domain and client API key
curl -X POST http://localhost:3000/v1/messages \
  -H "Host: your-domain.com" \
  -H "Authorization: Bearer cnp_live_your_client_key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "model": "claude-3-opus-20240229",
    "max_tokens": 100
  }'
```

## Troubleshooting Installation

### Common Issues

1. **Database Connection Failed**
   - Ensure PostgreSQL is running
   - Check DATABASE_URL format
   - Verify database exists: `createdb claude_nexus`

2. **Port Already in Use**
   - Change ports in .env:
     ```bash
     PROXY_PORT=3000
     DASHBOARD_PORT=3001
     ```

3. **Bun Not Found**
   - Install Bun: `curl -fsSL https://bun.sh/install | bash`
   - Add to PATH: `export PATH="$HOME/.bun/bin:$PATH"`

4. **Database Initialization Failed**
   - Check database permissions
   - Initialize manually:
     ```bash
     psql -d claude_nexus -f scripts/init-database.sql
     ```

### Getting Help

- Check the [Troubleshooting Guide](../05-Troubleshooting/common-issues.md)
- Review [Configuration Reference](./configuration.md)
- Open an issue on GitHub

## Next Steps

- [Configure your domains](./configuration.md)
- [Set up authentication](../02-User-Guide/authentication.md)
- [Use the dashboard](../02-User-Guide/dashboard-guide.md)
- [Read the development guide](./development.md)

## Production Deployment

For production deployment options:

- [Docker Deployment Guide](../03-Operations/deployment/docker.md)
- [AWS Infrastructure Guide](../03-Operations/deployment/aws-infrastructure.md)
- [Docker Compose Guide](../03-Operations/deployment/docker-compose.md)
