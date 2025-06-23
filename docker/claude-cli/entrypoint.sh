#!/bin/bash

# Copy Claude configuration files from client-setup if they exist
if [ -f "/workspace/client-setup/.claude.json" ]; then
    cp /workspace/client-setup/.claude.json /root/.claude.json
fi

if [ -f "/workspace/client-setup/.credentials.json" ]; then
    mkdir -p /root/.claude
    cp /workspace/client-setup/.credentials.json /root/.claude/.credentials.json
fi

# Execute command or start interactive shell
exec "${@:-/bin/bash}"