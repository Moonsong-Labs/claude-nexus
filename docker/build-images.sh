#!/bin/bash
# Build both proxy and dashboard Docker images

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Parse command line arguments
TAG="${1:-latest}"

# Show usage if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [TAG]"
    echo "  TAG: Additional version tag to apply (optional)"
    echo ""
    echo "Build Process:"
    echo "  - Always builds images with 'latest' tag"
    echo "  - If TAG is provided, also tags images with that version"
    echo ""
    echo "Examples:"
    echo "  $0          # Builds with 'latest' tag only"
    echo "  $0 v9       # Builds with 'latest' and tags as 'v9'"
    echo "  $0 1.2.3    # Builds with 'latest' and tags as '1.2.3'"
    exit 0
fi

echo -e "${BLUE}Building Claude Nexus Docker Images...${NC}"
if [ "$TAG" != "latest" ]; then
    echo -e "${YELLOW}Will tag images as: latest and ${TAG}${NC}"
else
    echo -e "${YELLOW}Building with tag: latest${NC}"
fi

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Build proxy image (always build as latest first)
echo -e "\n${BLUE}Building Proxy Service...${NC}"
docker build -f docker/proxy/Dockerfile -t moonsonglabs/claude-nexus-proxy:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Proxy image built successfully${NC}"
    # Tag with specific version if provided
    if [ "$TAG" != "latest" ]; then
        docker tag moonsonglabs/claude-nexus-proxy:latest moonsonglabs/claude-nexus-proxy:${TAG}
        echo -e "${GREEN}✓ Also tagged as '${TAG}'${NC}"
    fi
else
    echo -e "${RED}✗ Failed to build proxy image${NC}"
    exit 1
fi

# Build dashboard image (always build as latest first)
echo -e "\n${BLUE}Building Dashboard Service...${NC}"
docker build -f docker/dashboard/Dockerfile -t moonsonglabs/claude-nexus-dashboard:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dashboard image built successfully${NC}"
    # Tag with specific version if provided
    if [ "$TAG" != "latest" ]; then
        docker tag moonsonglabs/claude-nexus-dashboard:latest moonsonglabs/claude-nexus-dashboard:${TAG}
        echo -e "${GREEN}✓ Also tagged as '${TAG}'${NC}"
    fi
else
    echo -e "${RED}✗ Failed to build dashboard image${NC}"
    exit 1
fi

# Build all-in-one image (always build as latest first)
echo -e "\n${BLUE}Building All-in-One Service...${NC}"
docker build -f docker/all-in/claude-nexus-all-in.Dockerfile -t moonsonglabs/claude-nexus-all-in:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ All-in-One image built successfully${NC}"
    # Tag with specific version if provided
    if [ "$TAG" != "latest" ]; then
        docker tag moonsonglabs/claude-nexus-all-in:latest moonsonglabs/claude-nexus-all-in:${TAG}
        echo -e "${GREEN}✓ Also tagged as '${TAG}'${NC}"
    fi
else
    echo -e "${RED}✗ Failed to build all-in-one image${NC}"
    exit 1
fi

# Show image sizes
echo -e "\n${BLUE}Image Sizes:${NC}"
docker images | grep -E "claude-nexus-(proxy|dashboard|all-in)|REPOSITORY" | grep -E "${TAG}|REPOSITORY" | head -7

echo -e "\n${GREEN}Build completed successfully!${NC}"
echo -e "\nImages built:"
echo -e "  ${YELLOW}moonsonglabs/claude-nexus-proxy:latest${NC}"
echo -e "  ${YELLOW}moonsonglabs/claude-nexus-dashboard:latest${NC}"
echo -e "  ${YELLOW}moonsonglabs/claude-nexus-all-in:latest${NC}"

if [ "$TAG" != "latest" ]; then
    echo -e "\nAlso tagged as:"
    echo -e "  ${YELLOW}moonsonglabs/claude-nexus-proxy:${TAG}${NC}"
    echo -e "  ${YELLOW}moonsonglabs/claude-nexus-dashboard:${TAG}${NC}"
    echo -e "  ${YELLOW}moonsonglabs/claude-nexus-all-in:${TAG}${NC}"
fi

echo -e "\nTo run the services:"
echo -e "${YELLOW}Using Docker Compose (recommended):${NC}"
echo -e "  ${BLUE}# Copy environment file (in project root)${NC}"
echo -e "  ${BLUE}cp .env.example .env${NC}"
echo -e "  ${BLUE}# Edit .env with your API keys${NC}"
echo -e "  ${BLUE}nano .env${NC}"
echo -e "  ${BLUE}# Run both services${NC}"
echo -e "  ${BLUE}./docker-up.sh up -d${NC}     # From project root"
echo -e "  ${BLUE}# Or: cd docker && docker-compose --env-file ../.env up -d${NC}"

if [ "$TAG" != "latest" ]; then
    echo -e "\n  ${YELLOW}Note: docker-compose.yml uses the 'latest' tag by default${NC}"
    echo -e "  ${YELLOW}To use version ${TAG}, either:${NC}"
    echo -e "  ${BLUE}1. Edit docker/docker-compose.yml to use :${TAG} instead of :latest${NC}"
    echo -e "  ${BLUE}2. Or use docker-compose.override.yml in the docker folder${NC}"
fi

echo -e "\n${YELLOW}Using Docker Run:${NC}"
echo -e "  ${BLUE}# All-in-One (recommended for demos)${NC}"
echo -e "  ${BLUE}docker run -d -p 3000:3000 -p 3001:3001 moonsonglabs/claude-nexus-all-in:${TAG}${NC}"
echo -e "  ${BLUE}# Or run services separately:${NC}"
echo -e "  ${BLUE}# Proxy service${NC}"
echo -e "  ${BLUE}docker run -d -p 3000:3000 moonsonglabs/claude-nexus-proxy:${TAG}${NC}"
echo -e "  ${BLUE}# Dashboard service${NC}"
echo -e "  ${BLUE}docker run -d -p 3001:3001 -e DASHBOARD_API_KEY=your-key moonsonglabs/claude-nexus-dashboard:${TAG}${NC}"

# Add push instructions
echo -e "\n${YELLOW}To push to Docker Hub:${NC}"
if [ "$TAG" != "latest" ]; then
    echo -e "  ${BLUE}# Push both latest and version tags:${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-proxy:latest${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-proxy:${TAG}${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-dashboard:latest${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-dashboard:${TAG}${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-all-in:latest${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-all-in:${TAG}${NC}"
    echo -e "\n  ${YELLOW}Or use the push script:${NC}"
    echo -e "  ${BLUE}./docker/push-images.sh ${TAG}${NC}"
else
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-proxy:latest${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-dashboard:latest${NC}"
    echo -e "  ${BLUE}docker push moonsonglabs/claude-nexus-all-in:latest${NC}"
    echo -e "\n  ${YELLOW}Or use the push script:${NC}"
    echo -e "  ${BLUE}./docker/push-images.sh${NC}"
fi

echo -e "\n${YELLOW}Services will be available at:${NC}"
echo -e "  Proxy API: ${GREEN}http://localhost:3000${NC}"
echo -e "  Dashboard: ${GREEN}http://localhost:3001${NC}"