#!/bin/bash
# docker-up.sh - Convenience wrapper for docker-compose operations
#
# This script simplifies running docker-compose commands for the Claude Nexus Proxy project
# by automatically handling environment file loading and directory navigation.
#
# Usage: ./docker-up.sh [docker-compose-command] [options]
# Examples:
#   ./docker-up.sh up -d        # Start all services in detached mode
#   ./docker-up.sh logs -f      # Follow logs from all services
#   ./docker-up.sh down         # Stop and remove containers
#   ./docker-up.sh --help       # Show this help message

set -euo pipefail

# Script configuration
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly PROJECT_NAME="claude-nexus-local"
readonly ENV_FILE="$SCRIPT_DIR/.env"
readonly DOCKER_DIR="$SCRIPT_DIR/docker"

# Color codes (disabled if not in terminal)
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
    readonly RED='\033[0;31m'
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly NC='\033[0m' # No Color
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly NC=''
fi

# Helper functions
error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

warning() {
    echo -e "${YELLOW}Warning: $1${NC}" >&2
}

success() {
    echo -e "${GREEN}$1${NC}"
}

show_help() {
    head -n 13 "$0" | tail -n 11 | sed 's/^# //'
    exit 0
}

# Check for help flag
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    show_help
fi

# Prerequisite checks
check_prerequisites() {
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! docker compose version &> /dev/null 2>&1; then
        missing_deps+=("docker compose plugin")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install the missing dependencies and try again."
        exit 1
    fi
}

# Environment file check
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        error ".env file not found in project root!"
        echo "Please create it first:"
        echo "  cp .env.example .env"
        echo "  nano .env  # Add your API keys"
        exit 1
    fi
}

# Docker directory check
check_docker_directory() {
    if [ ! -d "$DOCKER_DIR" ]; then
        error "Docker directory not found at: $DOCKER_DIR"
        echo "Please ensure you're running this script from the project root."
        exit 1
    fi
}

# Main execution
main() {
    # Run all checks
    check_prerequisites
    check_env_file
    check_docker_directory
    
    # Run docker compose from the docker directory with the project .env file
    cd "$DOCKER_DIR" && docker compose \
        --project-name "$PROJECT_NAME" \
        --env-file "$ENV_FILE" \
        "$@"
}

# Execute main function with all arguments
main "$@"