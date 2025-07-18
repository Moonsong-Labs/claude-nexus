# Docker Quick Reference

Quick Docker commands for Claude Nexus Proxy services.

For detailed documentation, see:

- [Docker Deployment Guide](../docs/03-Operations/deployment/docker.md) - Comprehensive deployment options
- [Docker Compose Guide](../docs/03-Operations/deployment/docker-compose.md) - Full stack setup
- [Main Documentation](../README.md) - Project overview

## Quick Start

```bash
# Start all services (proxy, dashboard, database, Claude CLI)
./docker-up.sh up -d

# View logs
./docker-up.sh logs -f

# Stop all services
./docker-up.sh down
```

## Essential Commands

### Service Management

```bash
# Start specific service
./docker-up.sh up -d proxy      # Just the proxy
./docker-up.sh up -d dashboard  # Just the dashboard

# Restart a service
./docker-up.sh restart proxy

# View service status
./docker-up.sh ps
```

### Building Images

```bash
# Build all images locally
./docker-up.sh build

# Build specific image
./build-images.sh               # Build and tag as 'latest'
./build-images.sh v1.2.3        # Build and tag with version
```

### Common Operations

```bash
# Access Claude CLI
./docker-up.sh exec claude-cli claude "your prompt here"

# Run usage monitor
./docker-up.sh exec claude-cli monitor

# Execute commands in containers
./docker-up.sh exec proxy sh
./docker-up.sh exec dashboard sh

# View real-time logs for specific service
./docker-up.sh logs -f proxy
```

## Architecture

- **Proxy** (Port 3000): API proxy with auth, token tracking, AI analysis
- **Dashboard** (Port 3001): Web UI for monitoring and analytics
- **Database**: PostgreSQL for persistence
- **Claude CLI**: Optional CLI integration

See [Architecture Documentation](../docs/04-Architecture/) for details.

## Troubleshooting

- Ensure `.env` file exists (copy from `.env.example`)
- Check credentials in `credentials/` directory
- For detailed troubleshooting: [Operations Guide](../docs/03-Operations/)
