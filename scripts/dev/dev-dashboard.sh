#!/bin/bash
#
# dev-dashboard.sh
#
# Description:
#   Starts the Claude Nexus Dashboard service in development mode.
#   Loads environment variables from the project root .env file
#   and launches the dashboard service using bun.
#
# Usage:
#   ./scripts/dev/dev-dashboard.sh
#   # or via npm/bun script:
#   bun run dev:dashboard
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

# Navigate to dashboard service directory
DASHBOARD_DIR="$PROJECT_ROOT/services/dashboard"
if [ ! -d "$DASHBOARD_DIR" ]; then
    echo "Error: Dashboard service directory not found: $DASHBOARD_DIR" >&2
    exit 1
fi

cd "$DASHBOARD_DIR" || {
    echo "Error: Failed to change to dashboard directory: $DASHBOARD_DIR" >&2
    exit 1
}

# Start the dashboard service
echo "Starting Claude Nexus Dashboard service in development mode..."
exec bun run dev