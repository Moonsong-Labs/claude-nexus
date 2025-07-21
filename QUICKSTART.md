# Quick Start (5-Minute Docker Setup)

Get Claude Nexus Proxy running locally in under 5 minutes using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Claude API key from Anthropic

## 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/moonsong-labs/claude-nexus-proxy.git
cd claude-nexus-proxy

# Create environment file
cp .env.example .env
```

## 2. Set Essential Variables

Edit `.env` and configure these required values:

```bash
# Database (default values work for Docker)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/claude_proxy

# Dashboard authentication (generate a secure key)
DASHBOARD_API_KEY=your-secure-dashboard-key

# Enable storage
STORAGE_ENABLED=true
```

## 3. Create Domain Credentials

```bash
# Generate a secure client API key
bun run scripts/auth/generate-api-key.ts

# Create credential file (replace 'example.com' with your domain)
cp credentials/example-api-key.com.credentials.json credentials/example.com.credentials.json
```

Edit `credentials/example.com.credentials.json`:

- Replace `YOUR-CLAUDE-API-KEY-HERE` with your Claude API key
- Replace `YOUR-CLIENT-API-KEY-HERE` with the generated key from step above

## 4. Start Services

```bash
# Build and start all services
./docker-up.sh up -d

# Check status
./docker-up.sh ps
```

## 5. Verify Installation

```bash
# Test the proxy (replace with your client API key)
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer YOUR-CLIENT-API-KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'

# Access the dashboard
open http://localhost:3001
# Use the DASHBOARD_API_KEY from .env to authenticate
```

## Next Steps

For more detailed information:

- **Local Development** (without Docker): [Installation Guide](docs/01-Getting-Started/installation.md)
- **Docker Deployment Details**: [Docker Compose Guide](docs/03-Operations/deployment/docker-compose.md)
- **Production Deployment**: [Deployment Options](docs/03-Operations/deployment/)
- **Complete Documentation**: [docs/README.md](docs/README.md)
