#!/bin/bash
# Set API key from credentials file if available
[ -f "/root/.claude/.credentials.json" ] && export ANTHROPIC_API_KEY=$(jq -r '.oauth.accessToken // .api_key // empty' < /root/.claude/.credentials.json)
exec claude "$@"