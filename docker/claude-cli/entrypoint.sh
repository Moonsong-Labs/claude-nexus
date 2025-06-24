#!/bin/bash

# Claude home directory for non-root user
CLAUDE_HOME="/home/claude/.claude"

# Copy Claude configuration files from client-setup if they exist
if [ -f "/workspace/client-setup/.claude.json" ]; then
    cp /workspace/client-setup/.claude.json /home/claude/.claude.json
    chown claude:claude /home/claude/.claude.json
fi

if [ -f "/workspace/client-setup/.credentials.json" ]; then
    mkdir -p "$CLAUDE_HOME"
    cp /workspace/client-setup/.credentials.json "$CLAUDE_HOME/.credentials.json"
    chown -R claude:claude "$CLAUDE_HOME"
    chmod 700 "$CLAUDE_HOME"
fi

# Handle different commands
case "$1" in
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
        # Default to claude CLI if no specific command
        exec /usr/local/bin/claude-cli "$@"
        ;;
esac