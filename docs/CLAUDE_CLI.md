# Claude CLI Integration

This document describes how to use Claude CLI with the Claude Nexus Proxy.

## Overview

The Claude Nexus Proxy includes a Docker service that runs Claude CLI connected to your local proxy. This allows you to:
- Use Claude CLI with your proxy configuration
- Track usage through the proxy's monitoring
- Apply any proxy-level features (rate limiting, logging, etc.)

## Setup

### Prerequisites

- Docker and Docker Compose
- Claude API key configured in your environment

### Running Claude CLI

1. Start the proxy and Claude CLI services:
```bash
docker compose --profile dev --profile claude up -d
```

2. Access Claude CLI interactively:
```bash
docker compose exec claude-cli claude
```

3. Or run a single command:
```bash
docker compose exec claude-cli claude "Write a hello world in Python"
```

## Configuration

The Claude CLI service is configured to:
- Connect to the proxy at `http://proxy:3000/v1`
- Use Bearer token authentication with your `CLAUDE_API_KEY`
- Mount the project directory as `/workspace` for file access

### Environment Variables

- `CLAUDE_API_KEY` - Your Claude API key (used as Bearer token)

## How It Works

1. The Claude CLI Docker container starts with the official `@anthropic-ai/claude-code` package
2. A setup script configures Claude to use the proxy endpoint
3. Authentication is handled via Bearer token using your API key
4. All requests go through the proxy, enabling monitoring and tracking

## File Access

The entire project directory is mounted at `/workspace` in the container, allowing Claude to:
- Read and analyze your code
- Generate files
- Access project documentation

## Examples

### Interactive Session
```bash
docker compose exec claude-cli claude
```

### Single Command
```bash
docker compose exec claude-cli claude "Explain the proxy architecture"
```

### With File Context
```bash
docker compose exec claude-cli claude "Review the code in /workspace/services/proxy/src/app.ts"
```

## Troubleshooting

### Claude CLI not connecting
- Ensure the proxy service is running: `docker compose ps`
- Check logs: `docker compose logs claude-cli`
- Verify your `CLAUDE_API_KEY` is set correctly

### Authentication errors
- Ensure your API key is valid
- Check proxy logs for authentication issues: `docker compose logs proxy`