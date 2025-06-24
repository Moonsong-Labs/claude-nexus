#!/bin/bash
# Wrapper script for Claude Usage Monitor

# Ensure ccusage is available in PATH
export PATH="/usr/local/bin:$PATH"

# Set Claude home directory if not set
export CLAUDE_HOME="${CLAUDE_HOME:-/home/claude/.claude}"

# Ensure Python can find the system packages
export PYTHONPATH="/usr/lib/python3.12/site-packages:$PYTHONPATH"

# Run the Claude Usage Monitor
cd /app/claude-monitor
exec python3 claude_monitor.py "$@"