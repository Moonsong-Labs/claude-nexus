#!/bin/bash

# Script to view Claude proxy logs with useful filters
# Usage: ./scripts/view-claude-logs.sh [options]

set -e

# Default values
TAIL_LINES=50
FOLLOW=false
FILTER=""
DEBUG_MODE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            TAIL_LINES="$2"
            shift 2
            ;;
        -d|--debug)
            DEBUG_MODE=true
            shift
            ;;
        -e|--errors)
            FILTER="error|fail|unauthorized|forbidden"
            shift
            ;;
        -r|--requests)
            FILTER="POST /v1/messages|GET /v1"
            shift
            ;;
        -a|--auth)
            FILTER="auth|token|api_key|bearer"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -f, --follow     Follow log output"
            echo "  -n, --lines N    Show last N lines (default: 50)"
            echo "  -d, --debug      Show debug-level logs"
            echo "  -e, --errors     Show only errors"
            echo "  -r, --requests   Show API requests"
            echo "  -a, --auth       Show authentication-related logs"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 -f              # Follow logs in real-time"
            echo "  $0 -e -n 100       # Show last 100 error lines"
            echo "  $0 -r -f           # Follow API requests"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h for help"
            exit 1
            ;;
    esac
done

# Build docker compose command
CMD="docker compose logs"

if [ "$FOLLOW" = true ]; then
    CMD="$CMD -f"
fi

CMD="$CMD --tail=$TAIL_LINES proxy"

# Add timestamp
CMD="$CMD -t"

# Execute command with optional filtering
if [ -n "$FILTER" ]; then
    if [ "$FOLLOW" = true ]; then
        # For follow mode, use grep with line buffering
        $CMD | grep --line-buffered -iE "$FILTER"
    else
        $CMD | grep -iE "$FILTER"
    fi
else
    $CMD
fi