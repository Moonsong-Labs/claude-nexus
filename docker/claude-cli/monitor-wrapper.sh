#!/bin/bash
# Claude Usage Monitor Wrapper Script
#
# Purpose:
#   Configures environment and executes the Claude Usage Monitor Python script
#   to provide real-time token usage tracking and predictions for Claude CLI.
#
# Usage:
#   monitor-wrapper.sh [monitor_args...]
#
# Environment Variables:
#   CLAUDE_HOME - Claude configuration directory (default: /home/claude/.claude)
#   MONITOR_APP_DIR - Monitor application directory (default: /app/claude-monitor)
#   MONITOR_SCRIPT - Monitor script name (default: claude_monitor.py)
#
# Dependencies:
#   - python3 (for running the monitor script)
#   - claude_monitor.py (from Claude-Code-Usage-Monitor repository)
#
# Security Notes:
#   - All arguments are passed through to the Python script
#   - Directory and file existence are validated before execution
#   - No sensitive data is logged or exposed

set -euo pipefail

# Configuration
CLAUDE_HOME="${CLAUDE_HOME:-/home/claude/.claude}"
MONITOR_APP_DIR="${MONITOR_APP_DIR:-/app/claude-monitor}"
MONITOR_SCRIPT="${MONITOR_SCRIPT:-claude_monitor.py}"
MONITOR_SCRIPT_PATH="$MONITOR_APP_DIR/$MONITOR_SCRIPT"

# Export environment
export PATH="/usr/local/bin:$PATH"
export CLAUDE_HOME
export PYTHONPATH="/usr/lib/python3.12/site-packages:${PYTHONPATH:-}"

# Validate dependencies
if ! command -v python3 &> /dev/null; then
    echo "Error: 'python3' is not installed or not found in PATH." >&2
    echo "The Claude Usage Monitor requires Python 3 to run." >&2
    exit 1
fi

# Validate monitor directory exists
if [ ! -d "$MONITOR_APP_DIR" ]; then
    echo "Error: Monitor directory '$MONITOR_APP_DIR' not found." >&2
    echo "Please ensure the Claude Usage Monitor is properly installed." >&2
    exit 1
fi

# Validate monitor script exists
if [ ! -f "$MONITOR_SCRIPT_PATH" ]; then
    echo "Error: Monitor script '$MONITOR_SCRIPT_PATH' not found." >&2
    echo "Please ensure the Claude Usage Monitor is properly installed." >&2
    exit 1
fi

# Change to monitor directory and execute script
# Using cd && exec pattern for better error handling
cd "$MONITOR_APP_DIR" || {
    echo "Error: Failed to change directory to '$MONITOR_APP_DIR'." >&2
    exit 1
}

# Execute the monitor script with all provided arguments
# Using exec replaces this process, ensuring clean process management
exec python3 "$MONITOR_SCRIPT" "$@"