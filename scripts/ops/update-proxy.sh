#!/usr/bin/env bash
#
# update-proxy.sh - Update Claude Nexus Proxy Docker containers
#
# This script safely updates running Docker containers to new versions with
# rollback support and health checks.
#
# Usage: ./update-proxy.sh <version> [service]
#
# Arguments:
#   version  - Docker image tag to deploy (e.g., v8, latest)
#   service  - Optional: 'proxy' or 'dashboard' (default: both)
#
# Examples:
#   ./update-proxy.sh v8          # Updates both containers
#   ./update-proxy.sh v8 proxy    # Updates only proxy
#   ./update-proxy.sh v8 dashboard # Updates only dashboard
#
# Environment Variables:
#   PROXY_IMAGE       - Proxy Docker image (default: alanpurestake/claude-nexus-proxy)
#   DASHBOARD_IMAGE   - Dashboard Docker image (default: alanpurestake/claude-nexus-dashboard)
#   NETWORK_NAME      - Docker network name (default: claude-nexus-network)
#   ENV_FILE          - Path to .env file (default: ./.env)
#   CREDENTIALS_DIR   - Path to credentials directory (default: ~/credentials)
#   HEALTH_CHECK_RETRIES - Number of health check attempts (default: 30)
#   HEALTH_CHECK_DELAY   - Delay between health checks in seconds (default: 2)

set -euo pipefail

# Trap signals for cleanup on exit
trap 'cleanup_on_exit' EXIT INT TERM

# Configuration with defaults
readonly SCRIPT_NAME=$(basename "$0")
readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly PROJECT_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

# Image configuration
readonly PROXY_IMAGE="${PROXY_IMAGE:-alanpurestake/claude-nexus-proxy}"
readonly DASHBOARD_IMAGE="${DASHBOARD_IMAGE:-alanpurestake/claude-nexus-dashboard}"

# Container and network names
readonly PROXY_CONTAINER="${PROXY_CONTAINER:-claude-nexus-proxy}"
readonly DASHBOARD_CONTAINER="${DASHBOARD_CONTAINER:-claude-nexus-dashboard}"
readonly NETWORK_NAME="${NETWORK_NAME:-claude-nexus-network}"

# Path configuration
readonly ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
readonly CREDENTIALS_DIR="${CREDENTIALS_DIR:-${HOME}/credentials}"

# Health check configuration
readonly HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-30}"
readonly HEALTH_CHECK_DELAY="${HEALTH_CHECK_DELAY:-2}"

# Script state
CLEANUP_REQUIRED=false
OLD_CONTAINER_ID=""
SERVICE_TYPE=""

# Arguments
readonly VERSION="${1:-}"
readonly SERVICE="${2:-}"

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Cleanup function
cleanup_on_exit() {
    if [[ "${CLEANUP_REQUIRED}" == "true" ]] && [[ -n "${OLD_CONTAINER_ID}" ]]; then
        log "Cleanup: Rolling back to previous container"
        docker start "${OLD_CONTAINER_ID}" 2>/dev/null || true
    fi
}

# Validation functions
validate_arguments() {
    if [[ -z "${VERSION}" ]]; then
        error "Version not specified"
        echo "Usage: ${SCRIPT_NAME} <version> [proxy|dashboard]"
        echo "Example: ${SCRIPT_NAME} v8"
        exit 1
    fi

    if [[ -n "${SERVICE}" ]] && [[ "${SERVICE}" != "proxy" ]] && [[ "${SERVICE}" != "dashboard" ]]; then
        error "Invalid service: ${SERVICE}"
        echo "Service must be 'proxy' or 'dashboard'"
        exit 1
    fi
}

validate_environment() {
    local errors=0

    # Check if .env file exists
    if [[ ! -f "${ENV_FILE}" ]]; then
        error "Environment file not found: ${ENV_FILE}"
        ((errors++))
    fi

    # Check if credentials directory exists for proxy
    if [[ "${SERVICE}" != "dashboard" ]] && [[ ! -d "${CREDENTIALS_DIR}" ]]; then
        error "Credentials directory not found: ${CREDENTIALS_DIR}"
        ((errors++))
    fi

    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running or not accessible"
        ((errors++))
    fi

    if [[ ${errors} -gt 0 ]]; then
        error "Environment validation failed with ${errors} error(s)"
        exit 1
    fi
}

# Network management
ensure_network_exists() {
    if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK_NAME}$"; then
        log "Creating Docker network: ${NETWORK_NAME}"
        docker network create "${NETWORK_NAME}"
    fi
}

# Health check function
wait_for_health() {
    local container_name="$1"
    local port="$2"
    local retries="${HEALTH_CHECK_RETRIES}"
    
    log "Waiting for ${container_name} to be healthy (port ${port})..."
    
    while [[ ${retries} -gt 0 ]]; do
        if docker exec "${container_name}" wget -q --spider "http://localhost:${port}/health" 2>/dev/null; then
            log "✓ ${container_name} is healthy"
            return 0
        fi
        
        ((retries--))
        sleep "${HEALTH_CHECK_DELAY}"
    done
    
    error "Health check failed for ${container_name} after ${HEALTH_CHECK_RETRIES} attempts"
    return 1
}

# Generic container update function
update_container() {
    local container_name="$1"
    local image="$2"
    local port="$3"
    local service_name="$4"
    local extra_volumes="$5"
    local new_container_name="${container_name}-new"
    
    # Pull the new image
    log "Pulling ${image}:${VERSION}..."
    if ! docker pull "${image}:${VERSION}"; then
        error "Failed to pull image ${image}:${VERSION}"
        return 1
    fi
    
    # Check if old container exists
    if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        OLD_CONTAINER_ID=$(docker ps -aq -f "name=^${container_name}$")
        CLEANUP_REQUIRED=true
    fi
    
    # Build docker run command
    local docker_cmd=(
        docker run -d
        --name "${new_container_name}"
        --network "${NETWORK_NAME}"
        --restart unless-stopped
        -p "${port}:${port}"
        -e "SERVICE=${service_name}"
        -v "${ENV_FILE}:/app/.env:ro"
    )
    
    # Add extra volumes if provided
    if [[ -n "${extra_volumes}" ]]; then
        docker_cmd+=(-v "${extra_volumes}")
    fi
    
    docker_cmd+=("${image}:${VERSION}")
    
    # Start new container
    log "Starting new ${service_name} container..."
    if ! "${docker_cmd[@]}"; then
        error "Failed to start new ${service_name} container"
        CLEANUP_REQUIRED=false
        return 1
    fi
    
    # Health check
    if ! wait_for_health "${new_container_name}" "${port}"; then
        log "Removing unhealthy container ${new_container_name}"
        docker stop "${new_container_name}" 2>/dev/null
        docker rm "${new_container_name}" 2>/dev/null
        CLEANUP_REQUIRED=false
        return 1
    fi
    
    # Success - replace old container
    if [[ -n "${OLD_CONTAINER_ID}" ]]; then
        log "Stopping old ${service_name} container..."
        docker stop "${container_name}" 2>/dev/null
        docker rm "${container_name}" 2>/dev/null
    fi
    
    log "Renaming new container to ${container_name}"
    docker rename "${new_container_name}" "${container_name}"
    
    CLEANUP_REQUIRED=false
    log "✓ ${service_name} updated successfully to ${VERSION}"
    return 0
}

# Service-specific update functions
update_proxy() {
    SERVICE_TYPE="proxy"
    local extra_volumes="${CREDENTIALS_DIR}:/app/credentials:ro"
    update_container "${PROXY_CONTAINER}" "${PROXY_IMAGE}" "3000" "proxy" "${extra_volumes}"
}

update_dashboard() {
    SERVICE_TYPE="dashboard"
    update_container "${DASHBOARD_CONTAINER}" "${DASHBOARD_IMAGE}" "3001" "dashboard" ""
}

# Show final status
show_status() {
    log ""
    log "Container status:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" | grep -E "(NAMES|${PROXY_CONTAINER}|${DASHBOARD_CONTAINER})" || true
}

# Main execution
main() {
    # Validate inputs first
    validate_arguments
    
    log "Starting ${SCRIPT_NAME} for version ${VERSION}"
    
    # Validate environment
    validate_environment
    
    # Ensure network exists
    ensure_network_exists
    
    # Update based on service parameter
    local update_success=true
    
    case "${SERVICE}" in
        proxy)
            if ! update_proxy; then
                update_success=false
            fi
            ;;
        dashboard)
            if ! update_dashboard; then
                update_success=false
            fi
            ;;
        *)
            # Update both if no service specified
            if ! update_proxy; then
                update_success=false
            fi
            if ! update_dashboard; then
                update_success=false
            fi
            ;;
    esac
    
    # Show final status
    show_status
    
    if [[ "${update_success}" == "false" ]]; then
        error "Update failed. Check logs above for details."
        exit 1
    fi
    
    log "Update completed successfully!"
}

# Execute main function
main "$@"