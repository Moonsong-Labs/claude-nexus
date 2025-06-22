#!/bin/bash

# Script to run Claude queries and automatically show relevant logs
# Usage: ./scripts/claude-with-logs.sh "your query here"

set -e

# Check if query is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 \"your Claude query\""
    echo "Example: $0 \"What is 2+2?\""
    exit 1
fi

QUERY="$1"

echo "🤖 Sending query to Claude: $QUERY"
echo ""

# Start following logs in background
docker compose logs -f proxy --tail=0 > /tmp/claude-proxy-logs.txt 2>&1 &
LOG_PID=$!

# Give logs a moment to start
sleep 1

# Run the Claude query
echo "📤 Executing query..."
docker compose exec claude-cli claude "$QUERY"

# Give logs a moment to capture everything
sleep 2

# Stop following logs
kill $LOG_PID 2>/dev/null || true

echo ""
echo "📋 Proxy logs for this request:"
echo "================================"

# Show the captured logs
if [ -s /tmp/claude-proxy-logs.txt ]; then
    cat /tmp/claude-proxy-logs.txt
else
    echo "No logs captured. Make sure the proxy service is running."
fi

# Clean up
rm -f /tmp/claude-proxy-logs.txt

echo ""
echo "💡 Tip: For more detailed logs, enable debug mode:"
echo "   DEBUG=true docker compose --profile dev --profile claude up -d"