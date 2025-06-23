# Claude CLI Docker Integration

Minimal setup for using Claude CLI through the proxy.

## Architecture

```
Claude CLI Container
    ↓ (ANTHROPIC_BASE_URL=http://proxy:3000)
Proxy Service
    ↓ (Bearer token auth)
Claude API
```

## Files

- `Dockerfile` - Builds Claude CLI container with Node.js
- `entrypoint.sh` - Copies credentials on startup
- `claude-wrapper.sh` - Sets API key from credentials file
- `../../claude` - Helper script to run Claude from project root

## Configuration

The container expects credentials at:
- `/workspace/client-setup/.credentials.json` - OAuth/API credentials

Environment:
- `ANTHROPIC_BASE_URL=http://proxy:3000` - Routes through proxy

## Usage

```bash
# From project root
./claude "Your question here"

# From docker directory  
docker compose exec claude-cli /usr/local/bin/claude-cli "Hello"
```