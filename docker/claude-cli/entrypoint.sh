#!/bin/bash
# Claude CLI Docker Container Entrypoint
#
# Purpose:
#   1. Copy Claude configuration files from mounted volumes if available
#   2. Route commands to appropriate executables (claude-cli, monitor, ccusage)
#
# Note: This script runs as the 'claude' user (non-root) for security

set -euo pipefail

# Claude home directory (already created with proper permissions in Dockerfile)
CLAUDE_HOME="${CLAUDE_HOME:-/home/claude/.claude}"

# Configuration Setup
# Copy Claude configuration files from client-setup volume if they exist
# Files will automatically have correct ownership since we run as 'claude' user
if [ -f "/workspace/client-setup/.claude.json" ]; then
    cp "/workspace/client-setup/.claude.json" "$HOME/.claude.json"
fi

if [ -f "/workspace/client-setup/.credentials.json" ]; then
    cp "/workspace/client-setup/.credentials.json" "$CLAUDE_HOME/.credentials.json"
fi

# Command Routing
# Route to appropriate executable based on the first argument
case "${1:-}" in
    claude-monitor|monitor)
        shift
        exec /usr/local/bin/claude-monitor "$@"
        ;;
    ccusage|usage)
        shift
        exec /usr/local/bin/ccusage "$@"
        ;;
    claude|cli)
        shift
        exec /usr/local/bin/claude-cli "$@"
        ;;
    *)
        # Default to claude CLI for any other command
        exec /usr/local/bin/claude-cli "$@"
        ;;
esac