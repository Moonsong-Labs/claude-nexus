# Claude Usage Monitor Integration

This document describes the integration of Claude Code Usage Monitor into the Claude CLI Docker image.

## Overview

The Claude Code Usage Monitor (https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) has been integrated into the Claude CLI Docker image to provide real-time token usage tracking and predictions.

## Architecture Changes

### Multi-Stage Build
- **Builder stage**: Compiles and installs all dependencies
- **Final stage**: Minimal runtime with only necessary components

### Integrated Tools
1. **Claude CLI** (`@anthropic-ai/claude-code`): Main CLI tool
2. **ccusage**: Node.js tool for analyzing Claude usage from JSONL files
3. **Claude Usage Monitor**: Python tool for real-time monitoring

### Security Enhancements
- Non-root user (`claude`, UID 1001)
- Minimal Alpine base image
- Proper file permissions

## Usage Examples

### Basic Commands

```bash
# Run Claude CLI (default)
docker run -it -v $(pwd):/workspace claude-cli

# Run usage monitor
docker run -it claude-cli monitor

# Run ccusage for daily stats
docker run -it claude-cli ccusage daily

# Run ccusage for live monitoring
docker run -it claude-cli ccusage blocks --live
```

### With Docker Compose

```bash
# Start the service
docker compose --profile claude up -d claude-cli

# Run monitor in existing container
docker compose exec claude-cli monitor

# Check daily usage
docker compose exec claude-cli ccusage daily
```

## Implementation Details

### Dockerfile Structure
- Uses `node:20-alpine` for both stages
- Installs Python 3 and pip in Alpine
- Clones Claude Usage Monitor from GitHub
- Creates proper directory structure with correct permissions

### Wrapper Scripts
- `entrypoint.sh`: Routes commands to appropriate tools
- `claude-wrapper.sh`: Sets up environment for Claude CLI
- `monitor-wrapper.sh`: Configures environment for usage monitor

### Data Persistence
- Volume mount at `/home/claude/.claude` for:
  - Configuration files
  - Credentials
  - Usage data (JSONL files)

## Dependencies

### Node.js Dependencies
- `@anthropic-ai/claude-code`: Claude CLI
- `ccusage`: Usage analysis tool

### Python Dependencies
- `pytz`: Timezone handling for monitor

## Configuration

### Environment Variables
- `ANTHROPIC_BASE_URL`: Proxy URL (default: http://proxy:3000)
- `CLAUDE_HOME`: Data directory (default: /home/claude/.claude)

### Volume Mounts
- `/workspace`: Working directory for code
- `/home/claude/.claude`: Persistent data storage