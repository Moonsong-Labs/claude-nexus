#!/bin/bash
# Set API key from credentials file if available
CLAUDE_HOME="${CLAUDE_HOME:-/home/claude/.claude}"
[ -f "$CLAUDE_HOME/.credentials.json" ] && export ANTHROPIC_API_KEY=$(jq -r '.oauth.accessToken // .api_key // empty' < "$CLAUDE_HOME/.credentials.json")
exec claude "$@"