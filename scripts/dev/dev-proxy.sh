#!/bin/bash
#
# dev-proxy.sh
#
# Description:
#   Starts the Claude Nexus Proxy service in development mode.
#   Loads environment variables from the project root .env file
#   and launches the proxy service using bun.
#
# Usage:
#   ./scripts/dev/dev-proxy.sh
#   # or via npm/bun script:
#   bun run dev:proxy
#

# Enable strict error handling
# -e: exit on error
# -u: exit on undefined variable
# -o pipefail: exit on pipe failure
set -euo pipefail

# Set up error trap for better debugging
trap 'echo "Error occurred on line $LINENO. Exit code: $?" >&2' ERR

# Determine script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT" || {
    echo "Error: Failed to change to project root: $PROJECT_ROOT" >&2
    exit 1
}

# Check for required commands
if ! command -v bun &>/dev/null; then
    echo "Error: 'bun' is not installed or not in PATH" >&2
    echo "Please install bun from https://bun.sh" >&2
    exit 1
fi

# Load environment variables from .env file if it exists
ENV_FILE="$PROJECT_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment variables from .env..."
    # Use set -a to export all variables automatically
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
else
    echo "Warning: .env file not found at $ENV_FILE" >&2
    echo "Continuing without environment variables..." >&2
fi

# Navigate to proxy service directory
PROXY_DIR="$PROJECT_ROOT/services/proxy"
if [ ! -d "$PROXY_DIR" ]; then
    echo "Error: Proxy service directory not found: $PROXY_DIR" >&2
    exit 1
fi

cd "$PROXY_DIR" || {
    echo "Error: Failed to change to proxy directory: $PROXY_DIR" >&2
    exit 1
}

# Start the proxy service
echo "Starting Claude Nexus Proxy service in development mode..."
exec bun run dev