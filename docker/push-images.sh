#!/bin/bash
# Push Claude Nexus Docker images to Docker Hub

set -euo pipefail

# Configuration
readonly DOCKER_REGISTRY_USER="${DOCKER_REGISTRY_USER:-alanpurestake}"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly PUSH_START_TIME=$(date +%s)

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

# Default values
TAG=""
PUSH_LATEST="yes"
DRY_RUN=false

# Show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [TAG]"
    echo ""
    echo "Push Claude Nexus Docker images to Docker Hub"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message and exit"
    echo "  -v, --version       Show version information"
    echo "  --dry-run           Preview what would be pushed without actually pushing"
    echo "  --no-latest         Don't push 'latest' tag when pushing version tag"
    echo ""
    echo "Arguments:"
    echo "  TAG                 Docker image tag to push (default: latest)"
    echo ""
    echo "Environment Variables:"
    echo "  DOCKER_REGISTRY_USER    Docker Hub username (default: alanpurestake)"
    echo "  NO_COLOR               Disable colored output"
    echo ""
    echo "Examples:"
    echo "  $0                      # Push images with 'latest' tag"
    echo "  $0 v9                   # Push images with 'v9' tag and 'latest'"
    echo "  $0 v9 --no-latest       # Push images with 'v9' tag only"
    echo "  $0 --dry-run v9         # Preview what would be pushed"
    echo "  DOCKER_REGISTRY_USER=myuser $0    # Use different Docker Hub user"
    echo ""
    echo "Note: You must be logged in to Docker Hub first:"
    echo "  docker login"
}

# Show version
show_version() {
    echo "Claude Nexus Push Images Script v1.0"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-latest)
                PUSH_LATEST="no"
                shift
                ;;
            -*)
                error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [ -z "$TAG" ]; then
                    TAG="$1"
                else
                    error "Unexpected argument: $1"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Default tag if not specified
    if [ -z "$TAG" ]; then
        TAG="latest"
    fi
}

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

# Check if Docker is logged in to a registry
check_docker_login() {
    info "Checking Docker Hub authentication..."
    
    # Try to get auth config from docker config
    local docker_config="${HOME}/.docker/config.json"
    if [ -f "$docker_config" ]; then
        if grep -q "\"auths\"" "$docker_config" && grep -q "docker.io\|index.docker.io" "$docker_config"; then
            success "Docker Hub authentication found"
            return 0
        fi
    fi
    
    # Alternative: try a minimal API call
    if docker manifest inspect alpine:latest &> /dev/null; then
        success "Docker Hub authentication verified"
        return 0
    fi
    
    warning "Docker Hub authentication not detected"
    echo "Please run 'docker login' if push fails"
    echo
    return 1
}

# Check if image exists locally
check_image_exists() {
    local image="$1"
    
    if docker image inspect "$image" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Get image size
get_image_size() {
    local image="$1"
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^${image}" | awk '{print $2}'
}

# Push a Docker image
push_image() {
    local service="$1"
    local tag="$2"
    local image_name="${DOCKER_REGISTRY_USER}/claude-nexus-${service}:${tag}"
    
    # Check if image exists
    if ! check_image_exists "${image_name}"; then
        error "Image not found locally: ${image_name}"
        echo "Available images:"
        docker images | grep -E "claude-nexus-(proxy|dashboard)|REPOSITORY" | head -10
        return 1
    fi
    
    # Get image size
    local size=$(get_image_size "${image_name}")
    
    if [ "$DRY_RUN" = true ]; then
        info "[DRY RUN] Would push ${service} service (${tag}) - Size: ${size}"
        return 0
    fi
    
    info "Pushing ${service} service (${tag}) - Size: ${size}..."
    
    local push_start=$(date +%s)
    
    if docker push "${image_name}"; then
        local push_end=$(date +%s)
        local push_duration=$((push_end - push_start))
        success "${service} image (${tag}) pushed successfully in ${push_duration}s"
    else
        error "Failed to push ${service} image (${tag})"
        echo "Troubleshooting tips:"
        echo "  1. Check Docker Hub login: docker login"
        echo "  2. Verify registry permissions for: ${DOCKER_REGISTRY_USER}"
        echo "  3. Check network connectivity"
        echo "  4. Ensure image exists: docker images | grep ${image_name}"
        return 1
    fi
}

# Main execution
main() {
    # For backward compatibility, check if using old positional syntax
    if [ $# -ge 2 ] && [ "$2" = "no" ] && [[ "$1" != -* ]]; then
        warning "Deprecation Notice: Please use --no-latest flag instead of positional argument"
        warning "Example: $0 $1 --no-latest"
        PUSH_LATEST="no"
        TAG="$1"
        shift 2  # Remove the old positional args
        parse_args "$@"
    else
        parse_args "$@"
    fi
    
    info "Claude Nexus Docker Image Push Tool"
    
    if [ "$DRY_RUN" = true ]; then
        warning "DRY RUN MODE - No images will be pushed"
    fi
    
    info "Configuration:"
    echo "  Registry User: ${DOCKER_REGISTRY_USER}"
    echo "  Tag: ${TAG}"
    echo "  Push Latest: ${PUSH_LATEST}"
    echo
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        echo "Please start Docker and try again."
        exit 1
    fi
    
    # Check if user is logged in to Docker Hub (unless dry-run)
    if [ "$DRY_RUN" = false ]; then
        check_docker_login || true
    fi
    
    local failed=false
    
    # Push specified tag for all services
    info "Pushing images with tag: ${TAG}"
    for service in "${SERVICES[@]}"; do
        echo
        if ! push_image "$service" "$TAG"; then
            failed=true
            if [ "$DRY_RUN" = false ]; then
                exit 1
            fi
        fi
    done
    
    # Also push latest tags if requested and not already pushing latest
    if [ "$TAG" != "latest" ] && [ "$PUSH_LATEST" = "yes" ]; then
        echo
        info "Also pushing 'latest' tags..."
        
        for service in "${SERVICES[@]}"; do
            echo
            if ! push_image "$service" "latest"; then
                failed=true
                if [ "$DRY_RUN" = false ]; then
                    exit 1
                fi
            fi
        done
    fi
    
    # Calculate total time
    local push_end_time=$(date +%s)
    local push_duration=$((push_end_time - PUSH_START_TIME))
    
    echo
    if [ "$DRY_RUN" = true ]; then
        if [ "$failed" = false ]; then
            success "Dry run completed successfully in ${push_duration}s"
        else
            warning "Dry run completed with errors in ${push_duration}s"
        fi
    else
        success "Push completed successfully in ${push_duration}s!"
        
        echo
        info "Images available at:"
        for service in "${SERVICES[@]}"; do
            echo "  ${YELLOW}https://hub.docker.com/r/${DOCKER_REGISTRY_USER}/claude-nexus-${service}${NC}"
        done
        
        echo
        info "To pull and run:"
        echo "  docker pull ${DOCKER_REGISTRY_USER}/claude-nexus-proxy:${TAG}"
        echo "  docker pull ${DOCKER_REGISTRY_USER}/claude-nexus-dashboard:${TAG}"
    fi
}

# Run main function
main "$@"