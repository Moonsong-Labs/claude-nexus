#!/bin/bash
# Push Claude Nexus Docker images to Docker Hub

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Parse command line arguments
TAG="${1:-latest}"
PUSH_LATEST="${2:-yes}"

# Show usage if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [TAG] [PUSH_LATEST]"
    echo "  TAG: Docker image tag to push (default: latest)"
    echo "  PUSH_LATEST: Also push 'latest' tag when pushing version tag (yes/no, default: yes)"
    echo ""
    echo "Examples:"
    echo "  $0                  # Push images with 'latest' tag"
    echo "  $0 v9               # Push images with 'v9' tag and 'latest'"
    echo "  $0 v9 no            # Push images with 'v9' tag only"
    echo ""
    echo "Note: You must be logged in to Docker Hub first:"
    echo "  docker login"
    exit 0
fi

echo -e "${BLUE}Pushing Claude Nexus Docker Images...${NC}"
echo -e "${YELLOW}Tag: ${TAG}${NC}"

# Check if user is logged in to Docker Hub
if ! docker info 2>/dev/null | grep -q "Username"; then
    echo -e "${YELLOW}Warning: You may not be logged in to Docker Hub${NC}"
    echo -e "Run '${BLUE}docker login${NC}' first if push fails"
    echo ""
fi

# Push proxy image
echo -e "\n${BLUE}Pushing Proxy Service...${NC}"
docker push moonsonglabs/claude-nexus-proxy:${TAG}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Proxy image pushed successfully${NC}"
else
    echo -e "${RED}✗ Failed to push proxy image${NC}"
    exit 1
fi

# Push dashboard image
echo -e "\n${BLUE}Pushing Dashboard Service...${NC}"
docker push moonsonglabs/claude-nexus-dashboard:${TAG}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dashboard image pushed successfully${NC}"
else
    echo -e "${RED}✗ Failed to push dashboard image${NC}"
    exit 1
fi

# Push all-in-one image
echo -e "\n${BLUE}Pushing All-in-One Service...${NC}"
docker push moonsonglabs/claude-nexus-all-in:${TAG}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ All-in-One image pushed successfully${NC}"
else
    echo -e "${RED}✗ Failed to push all-in-one image${NC}"
    exit 1
fi

# Also push latest tags if requested and not already pushing latest
if [ "$TAG" != "latest" ] && [ "$PUSH_LATEST" = "yes" ]; then
    echo -e "\n${BLUE}Also pushing 'latest' tags...${NC}"
    
    docker push moonsonglabs/claude-nexus-proxy:latest
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Proxy 'latest' pushed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to push proxy 'latest'${NC}"
        exit 1
    fi
    
    docker push moonsonglabs/claude-nexus-dashboard:latest
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Dashboard 'latest' pushed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to push dashboard 'latest'${NC}"
        exit 1
    fi
    
    docker push moonsonglabs/claude-nexus-all-in:latest
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ All-in-One 'latest' pushed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to push all-in-one 'latest'${NC}"
        exit 1
    fi
fi

echo -e "\n${GREEN}Push completed successfully!${NC}"
echo -e "\nImages available at:"
echo -e "  ${YELLOW}https://hub.docker.com/r/moonsonglabs/claude-nexus-proxy${NC}"
echo -e "  ${YELLOW}https://hub.docker.com/r/moonsonglabs/claude-nexus-dashboard${NC}"
echo -e "  ${YELLOW}https://hub.docker.com/r/moonsonglabs/claude-nexus-all-in${NC}"

echo -e "\nTo pull and run:"
echo -e "  ${BLUE}# All-in-One (recommended for demos)${NC}"
echo -e "  ${BLUE}docker pull moonsonglabs/claude-nexus-all-in:${TAG}${NC}"
echo -e "  ${BLUE}docker run -d -p 3000:3000 -p 3001:3001 moonsonglabs/claude-nexus-all-in:${TAG}${NC}"
echo -e "  ${BLUE}# Or pull services separately:${NC}"
echo -e "  ${BLUE}docker pull moonsonglabs/claude-nexus-proxy:${TAG}${NC}"
echo -e "  ${BLUE}docker pull moonsonglabs/claude-nexus-dashboard:${TAG}${NC}"