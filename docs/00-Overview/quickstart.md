# Quick Start - Docker Setup

Get Claude Nexus Proxy running in 5 minutes with Docker.

## Prerequisites

- Docker and Docker Compose installed
- Claude OAuth token or API key ready

## 5 Essential Commands

### 1. `git clone https://github.com/moonsong-labs/claude-nexus-proxy.git && cd claude-nexus-proxy`

**Why**: Get the code and enter project directory  
**Decision**: Single command for faster setup

### 2. `cp .env.example .env && nano .env`

**Why**: Configure environment, especially DASHBOARD_API_KEY for security  
**Decision**: Dashboard runs unauthenticated without API key (ADR-019)  
**Critical**: Set `DASHBOARD_API_KEY=your-secure-key-here`

### 3. `./scripts/setup-credentials.sh`

**Why**: Create OAuth credentials for Claude API access  
**Decision**: Centralized credentials prevent duplication

```bash
# Or manually create credentials/localhost:3000.credentials.json with your OAuth token
```

### 4. `cd docker && docker compose --profile dev up -d`

**Why**: Start all services (proxy, dashboard, PostgreSQL)  
**Decision**: Docker Compose for consistent environments  
**Services**:

- Proxy: http://localhost:3000
- Dashboard: http://localhost:3001 (requires DASHBOARD_API_KEY)
- PostgreSQL: localhost:5432

### 5. `docker compose logs -f proxy`

**Why**: Monitor proxy logs for debugging and verification  
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
