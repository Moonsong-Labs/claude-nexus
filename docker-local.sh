#!/bin/bash
# Convenience script to build and run docker compose with locally built images

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if .env file exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "Warning: .env file not found in project root!"
    echo "Please create it first:"
    echo "  cp .env.example .env"
    echo "  nano .env  # Add your API keys"
    echo ""
fi

# Run docker compose with the local build configuration
cd "$SCRIPT_DIR/docker" && docker compose -f docker-compose.local.yml --project-name claude-nexus-local --env-file "$SCRIPT_DIR/.env" "$@"