#!/bin/bash
# Build both proxy and dashboard Docker images

set -euo pipefail

# Configuration
readonly DOCKER_REGISTRY_USER="${DOCKER_REGISTRY_USER:-alanpurestake}"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly BUILD_START_TIME=$(date +%s)

# Services to build
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

# Show usage if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [TAG]"
    echo "  TAG: Additional version tag to apply (default: latest)"
    echo ""
    echo "Environment Variables:"
    echo "  DOCKER_REGISTRY_USER: Docker Hub username (default: alanpurestake)"
    echo ""
    echo "Examples:"
    echo "  $0              # Builds with 'latest' tag only"
    echo "  $0 v9           # Builds with 'latest' and tags as 'v9'"
    echo "  $0 1.2.3        # Builds with 'latest' and tags as '1.2.3'"
    echo "  DOCKER_REGISTRY_USER=myuser $0    # Use different Docker Hub user"
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

# Check prerequisites
check_prerequisites() {
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install the missing dependencies and try again."
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        echo "Please start Docker and try again."
        exit 1
    fi
    
    # Verify Dockerfiles exist
    for service in "${SERVICES[@]}"; do
        if [ ! -f "${SCRIPT_DIR}/${service}/Dockerfile" ]; then
            error "Dockerfile not found: ${SCRIPT_DIR}/${service}/Dockerfile"
            exit 1
        fi
    done
}

# Build and tag a Docker image
build_image() {
    local service="$1"
    local image_name="${DOCKER_REGISTRY_USER}/claude-nexus-${service}"
    
    info "Building ${service} service..."
    
    if docker build -f "${SCRIPT_DIR}/${service}/Dockerfile" -t "${image_name}:latest" .; then
        success "${service} image built successfully"
        
        # Tag with specific version if provided
        if [ "$TAG" != "latest" ]; then
            if docker tag "${image_name}:latest" "${image_name}:${TAG}"; then
                success "Also tagged as '${TAG}'"
            else
                error "Failed to tag ${service} image as '${TAG}'"
                return 1
            fi
        fi
    else
        error "Failed to build ${service} image"
        return 1
    fi
}

# Main execution
main() {
    cd "$PROJECT_ROOT"
    
    info "Building Claude Nexus Docker Images..."
    info "Docker version: $(docker --version)"
    
    if [ "$TAG" != "latest" ]; then
        warning "Will tag images as: latest and ${TAG}"
    else
        info "Building with tag: latest"
    fi
    
    check_prerequisites
    
    # Build all services
    for service in "${SERVICES[@]}"; do
        echo # Empty line for readability
        build_image "$service" || exit 1
    done
    
    # Calculate build time
    local build_end_time=$(date +%s)
    local build_duration=$((build_end_time - BUILD_START_TIME))
    
    # Show image sizes
    echo
    info "Image Sizes:"
    docker images | grep -E "claude-nexus-(proxy|dashboard)|REPOSITORY" | grep -E "${TAG}|REPOSITORY|latest" | head -$((${#SERVICES[@]} * 2 + 1))
    
    echo
    success "Build completed successfully in ${build_duration} seconds!"
    
    echo
    info "Images built:"
    for service in "${SERVICES[@]}"; do
        echo -e "  ${YELLOW}${DOCKER_REGISTRY_USER}/claude-nexus-${service}:latest${NC}"
    done
    
    if [ "$TAG" != "latest" ]; then
        echo
        info "Also tagged as:"
        for service in "${SERVICES[@]}"; do
            echo -e "  ${YELLOW}${DOCKER_REGISTRY_USER}/claude-nexus-${service}:${TAG}${NC}"
        done
    fi
    
    # Show next steps
    echo
    info "To run the services:"
    echo -e "${YELLOW}Using Docker Compose (recommended):${NC}"
    echo "  # From project root:"
    echo "  ./docker-up.sh up -d"
    echo
    echo -e "${YELLOW}Using Docker Run:${NC}"
    echo "  # Proxy service"
    echo "  docker run -d -p 3000:3000 ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:${TAG}"
    echo "  # Dashboard service"
    echo "  docker run -d -p 3001:3001 -e DASHBOARD_API_KEY=your-key ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:${TAG}"
    
    # Add push instructions
    echo
    info "To push to Docker Hub:"
    if [ "$TAG" != "latest" ]; then
        echo "  # Push both latest and version tags:"
        echo "  docker push ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:latest"
        echo "  docker push ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:${TAG}"
        echo "  docker push ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:latest"
        echo "  docker push ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:${TAG}"
        echo
        echo "  # Or use the push script:"
        echo "  ./docker/push-images.sh ${TAG}"
    else
        echo "  docker push ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:latest"
        echo "  docker push ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:latest"
        echo
        echo "  # Or use the push script:"
        echo "  ./docker/push-images.sh"
    fi
}

# Run main function
main