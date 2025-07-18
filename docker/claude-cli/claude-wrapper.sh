#!/bin/bash
# Claude CLI Wrapper Script
#
# Purpose:
#   Extracts API key from Claude credentials file and executes the Claude CLI
#   with appropriate authentication. Supports both OAuth access tokens and
#   standard API keys.
#
# Usage:
#   claude-wrapper.sh [claude_args...]
#
# Environment Variables:
#   CLAUDE_HOME - Claude configuration directory (default: /home/claude/.claude)
#   ANTHROPIC_API_KEY - Will be set from credentials file if found
#
# Dependencies:
#   - jq (for JSON parsing)
#   - claude (the Claude CLI tool)
#
# Security Notes:
#   - Credentials file should have restricted permissions (600)
#   - API key is exported to environment for claude process only
#   - No sensitive data is logged or printed

set -euo pipefail

# Configuration
CLAUDE_HOME="${CLAUDE_HOME:-/home/claude/.claude}"
CREDENTIALS_FILE="$CLAUDE_HOME/.credentials.json"

# Validate dependencies
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed or not found in PATH." >&2
    echo "Please install 'jq' to use this script." >&2
    exit 1
fi

# Extract API key if credentials file exists
if [ -f "$CREDENTIALS_FILE" ]; then
    # Extract API key with fallback: OAuth access token preferred over standard API key
    # This handles both oauth.accessToken and api_key formats
    API_KEY=$(jq -r '.oauth.accessToken // .api_key // empty' < "$CREDENTIALS_FILE" 2>/dev/null || echo "")
    
    if [ -n "$API_KEY" ]; then
        export ANTHROPIC_API_KEY="$API_KEY"
    else
        # Credentials file exists but no valid key found
        echo "Warning: No valid API key found in '$CREDENTIALS_FILE'." >&2
        echo "Expected 'oauth.accessToken' or 'api_key' field." >&2
    fi
else
    # No credentials file - claude may use other auth methods
    # This is not necessarily an error condition
    :
fi

# Execute claude CLI with all provided arguments
# Using exec replaces this process, ensuring clean process management
exec claude "$@"