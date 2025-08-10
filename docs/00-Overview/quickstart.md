# Quick Start - Docker Setup

Get Claude Nexus Proxy running in 5 minutes with Docker.

## Prerequisites

- Docker and Docker Compose installed
- Claude OAuth token or API key ready

## 5 Essential Commands

### 1. `git clone https://github.com/moonsong-labs/claude-nexus-proxy.git && cd claude-nexus-proxy`

**Why**: Get the code and enter project directory  
**When**: Initial setup or getting a fresh copy  
**Decision**: Single command for faster setup

### 2. `cp .env.example .env && nano .env`

**Why**: Configure environment, especially DASHBOARD_API_KEY for security  
**When**: After cloning, before starting services  
**Decision**: Dashboard runs unauthenticated without API key (ADR-019)  
**Critical**: Set `DASHBOARD_API_KEY=your-secure-key-here`

### 3. Create credentials file

**Why**: Configure OAuth credentials for Claude API access  
**When**: First setup or when rotating tokens  
**Decision**: Centralized credentials prevent duplication  
**⚠️ CRITICAL**: Never commit credentials! Ensure credentials/ is in .gitignore

```bash
# Create credentials/localhost:3000.credentials.json with your OAuth token
mkdir -p credentials
cat > credentials/localhost:3000.credentials.json << 'EOF'
{
  "type": "oauth",
  "accountId": "your-account-id",
  "oauth": {
    "accessToken": "sk-ant-oat01-YOUR-TOKEN",
    "refreshToken": "",
    "expiresAt": 1234567890000
  }
}
EOF
chmod 600 credentials/localhost:3000.credentials.json
```

### 4. `cd docker && docker compose --profile dev up -d`

**Why**: Start all services (proxy, dashboard, PostgreSQL)  
**When**: After configuration is complete  
**Decision**: Docker Compose for consistent environments  
**Services**:

- Proxy: http://localhost:3000
- Dashboard: http://localhost:3001 (requires DASHBOARD_API_KEY)
- PostgreSQL: localhost:5432

### 5. `docker compose logs -f proxy`

**Why**: Monitor proxy logs for debugging and verification  
**When**: After starting services or when troubleshooting  
**Decision**: Real-time logs help identify issues quickly  
**Alternative**: `docker compose ps` to check service health

## Quick Test

```bash
./claude "What is 2+2?"  # Test Claude CLI
curl http://localhost:3000/health  # Check proxy health
```

## Stop Everything

```bash
cd docker && docker compose down
```

## Next Steps

- Full development setup: [development.md](../01-Getting-Started/development.md)
- Environment variables: [environment-vars.md](../06-Reference/environment-vars.md)
- Troubleshooting: [common-issues.md](../05-Troubleshooting/common-issues.md)
