#!/bin/bash
# Push Claude Nexus Docker images to Docker Hub

set -euo pipefail

# Configuration
readonly DOCKER_REGISTRY_USER="${DOCKER_REGISTRY_USER:-alanpurestake}"

# Services to push
readonly -a SERVICES=("proxy" "dashboard")

# Colors for output (disabled if not in terminal)
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
    readonly GREEN='\033[0;32m'
    readonly BLUE='\033[0;34m'
    readonly RED='\033[0;31m'
    readonly YELLOW='\033[0;33m'
    readonly NC='\033[0m' # No Color
else
    readonly GREEN=''
    readonly BLUE=''
    readonly RED=''
    readonly YELLOW=''
    readonly NC=''
fi

# Parse command line arguments
TAG="${1:-latest}"
PUSH_LATEST="${2:-yes}"

# Show usage if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [TAG] [PUSH_LATEST]"
    echo "  TAG: Docker image tag to push (default: latest)"
    echo "  PUSH_LATEST: Also push 'latest' tag when pushing version tag (yes/no, default: yes)"
    echo ""
    echo "Environment Variables:"
    echo "  DOCKER_REGISTRY_USER: Docker Hub username (default: alanpurestake)"
    echo ""
    echo "Examples:"
    echo "  $0                  # Push images with 'latest' tag"
    echo "  $0 v9               # Push images with 'v9' tag and 'latest'"
    echo "  $0 v9 no            # Push images with 'v9' tag only"
    echo "  DOCKER_REGISTRY_USER=myuser $0    # Use different Docker Hub user"
    echo ""
    echo "Note: You must be logged in to Docker Hub first:"
    echo "  docker login"
    exit 0
fi

# Helper functions
error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${BLUE}$1${NC}"
}

warning() {
    echo -e "${YELLOW}$1${NC}"
}

# Push a Docker image
push_image() {
    local service="$1"
    local tag="$2"
    local image_name="${DOCKER_REGISTRY_USER}/claude-nexus-${service}:${tag}"
    
    info "Pushing ${service} service (${tag})..."
    
    if docker push "${image_name}"; then
        success "${service} image (${tag}) pushed successfully"
    else
        error "Failed to push ${service} image (${tag})"
        return 1
    fi
}

# Main execution
main() {
    info "Pushing Claude Nexus Docker Images..."
    warning "Tag: ${TAG}"
    
    # Check if user is logged in to Docker Hub
    if ! docker info 2>/dev/null | grep -q "Username"; then
        warning "You may not be logged in to Docker Hub"
        echo "Run 'docker login' first if push fails"
        echo
    fi
    
    # Push specified tag for all services
    for service in "${SERVICES[@]}"; do
        echo # Empty line for readability
        push_image "$service" "$TAG" || exit 1
    done

    
    # Also push latest tags if requested and not already pushing latest
    if [ "$TAG" != "latest" ] && [ "$PUSH_LATEST" = "yes" ]; then
        echo
        info "Also pushing 'latest' tags..."
        
        for service in "${SERVICES[@]}"; do
            echo # Empty line for readability
            push_image "$service" "latest" || exit 1
        done
    fi
    
    echo
    success "Push completed successfully!"
    
    echo
    info "Images available at:"
    echo "  ${YELLOW}https://hub.docker.com/r/${DOCKER_REGISTRY_USER}/claude-nexus-proxy${NC}"
    echo "  ${YELLOW}https://hub.docker.com/r/${DOCKER_REGISTRY_USER}/claude-nexus-dashboard${NC}"
    
    echo
    info "To pull and run:"
    echo "  docker pull ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:${TAG}"
    echo "  docker pull ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:${TAG}"
}

# Run main function
main