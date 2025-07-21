# Docker Deployment Guide

This guide covers deploying Claude Nexus Proxy using standalone Docker containers in production environments.

> **Note**:
>
> - For Docker Compose deployment, see [Docker Compose Guide](./docker-compose.md)
> - For AWS EC2 deployment, see [AWS Infrastructure Guide](./aws-infrastructure.md)
> - For operational procedures (monitoring, logging, troubleshooting), see [Operations Guide](../operations.md)

## Overview

The project provides optimized Docker images for both the proxy and dashboard services. This guide focuses on building and running these services as standalone Docker containers.

## Building Docker Images

### Using the Build Script (Recommended)

```bash
# Build both images with the latest tag
./docker/build-images.sh

# Build with a specific version tag
./docker/build-images.sh v1.2.3
```

The build script:

- Builds optimized production images
- Tags images appropriately
- Shows build progress and image sizes
- Provides next steps for running containers

### Manual Build

```bash
# Build proxy image
docker build -f docker/proxy/Dockerfile -t claude-nexus-proxy:latest .

# Build dashboard image
docker build -f docker/dashboard/Dockerfile -t claude-nexus-dashboard:latest .
```

## Running Standalone Containers

### Proxy Service

```bash
docker run -d \
  --name claude-proxy \
  --restart=always \
  -p 3000:3000 \
  --env-file .env.prod \
  -v $(pwd)/credentials:/app/credentials:ro \
  --health-cmd "curl -f http://localhost:3000/health || exit 1" \
  --health-interval 30s \
  --health-timeout 3s \
  --health-retries 3 \
  claude-nexus-proxy:latest
```

### Dashboard Service

```bash
docker run -d \
  --name claude-dashboard \
  --restart=always \
  -p 3001:3001 \
  --env-file .env.prod \
  --health-cmd "curl -f http://localhost:3001/health || exit 1" \
  --health-interval 30s \
  --health-timeout 3s \
  --health-retries 3 \
  claude-nexus-dashboard:latest
```

### Key Docker Run Options Explained

- `--restart=always`: Ensures containers restart after system reboot or crashes
- `--env-file .env.prod`: Loads environment variables from production config file
- `-v`: Mounts credentials directory as read-only for security
- `--health-*`: Configures health checks for container monitoring

## Production Configuration

### Environment Variables

Create a production environment file `.env.prod`:

```bash
# Database (with connection pooling)
DATABASE_URL=postgresql://user:pass@db-host:5432/claude_nexus?pool_max=20

# Authentication
DASHBOARD_API_KEY=$(openssl rand -base64 32)
ENABLE_CLIENT_AUTH=true

# Core Features
STORAGE_ENABLED=true
DEBUG=false

# Performance Tuning
CLAUDE_API_TIMEOUT=600000  # 10 minutes
PROXY_SERVER_TIMEOUT=660000  # 11 minutes
DASHBOARD_CACHE_TTL=300
SLOW_QUERY_THRESHOLD_MS=2000

# Optional Features
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
AI_WORKER_ENABLED=false  # Enable if using AI analysis
```

For a complete list of environment variables, see [Environment Variables Reference](../../06-Reference/environment-vars.md).

### Best Practices for Production Images

#### 1. Use Multi-Stage Builds

The provided Dockerfiles use multi-stage builds to:

- Separate build dependencies from runtime
- Reduce final image size
- Improve security by excluding build tools

#### 2. Security Hardening

```bash
# Run containers as non-root user (already configured in Dockerfiles)
# Use read-only filesystem where possible
docker run --read-only --tmpfs /tmp ...

# Limit container resources
docker run --memory="1g" --cpus="1.0" ...
```

#### 3. Create a .dockerignore

Ensure sensitive files are not included in the build context:

```
# .dockerignore
.env*
credentials/
*.log
node_modules/
.git/
```

## Container Networking

### Docker Network Isolation

```bash
# Create isolated network for services
docker network create claude-nexus

# Run containers on isolated network
docker run --network claude-nexus --name proxy ...
docker run --network claude-nexus --name dashboard ...
```

### Exposing Services

For production, consider:

- Using a reverse proxy (nginx, Caddy) instead of exposing ports directly
- Implementing TLS/SSL termination at the proxy level
- Setting up proper firewall rules

Example with Docker networks:

```bash
# Only expose through reverse proxy
docker run --network claude-nexus --name proxy claude-nexus-proxy:latest
# No -p flag means not exposed to host directly
```

## Data Persistence

### Stateless Services

Both proxy and dashboard services are stateless, storing all data in PostgreSQL. This means:

- Containers can be replaced without data loss
- Easy horizontal scaling
- Simple backup strategy (database only)

### Credentials Volume

The only local state is the credentials directory:

```bash
# Create named volume for credentials
docker volume create claude-credentials

# Use named volume instead of bind mount
docker run -v claude-credentials:/app/credentials:ro ...
```

## Container Management

### Using Docker Compose

For easier management of multiple containers, see [Docker Compose Guide](./docker-compose.md).

### Using Container Orchestration

For production deployments at scale, consider:

- Docker Swarm for simple multi-host deployments
- Kubernetes for complex orchestration needs
- AWS ECS/Fargate for cloud-native deployments

## Pushing to Registry

### Docker Hub

```bash
# Login to Docker Hub
docker login

# Push images
docker push ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:latest
docker push ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:latest

# Or use the push script
./docker/push-images.sh
```

### Private Registry

```bash
# Tag for private registry
docker tag claude-nexus-proxy:latest registry.company.com/claude-nexus-proxy:latest

# Push to private registry
docker push registry.company.com/claude-nexus-proxy:latest
```

## Next Steps

- For local development with Docker Compose, see [Docker Compose Guide](./docker-compose.md)
- For monitoring and operational procedures, see [Operations Guide](../operations.md)
- For AWS deployment, see [AWS Infrastructure Guide](./aws-infrastructure.md)
- For database setup, see [Database Guide](../database.md)
