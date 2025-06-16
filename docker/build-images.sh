#!/bin/bash
# Build both proxy and dashboard Docker images

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building Claude Nexus Docker Images...${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Build proxy image
echo -e "\n${BLUE}Building Proxy Service...${NC}"
docker build -f docker/proxy/Dockerfile -t alanpurestake/claude-nexus-proxy:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Proxy image built successfully${NC}"
else
    echo -e "${RED}✗ Failed to build proxy image${NC}"
    exit 1
fi

# Build dashboard image
echo -e "\n${BLUE}Building Dashboard Service...${NC}"
docker build -f docker/dashboard/Dockerfile -t alanpurestake/claude-nexus-dashboard:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dashboard image built successfully${NC}"
else
    echo -e "${RED}✗ Failed to build dashboard image${NC}"
    exit 1
fi

# Show image sizes
echo -e "\n${BLUE}Image Sizes:${NC}"
docker images | grep -E "claude-nexus-(proxy|dashboard)|REPOSITORY" | head -3

echo -e "\n${GREEN}Build completed successfully!${NC}"
echo -e "\nTo run the services:"
echo -e "  ${BLUE}docker-compose up${NC}"
echo -e "\nTo run individually:"
echo -e "  ${BLUE}docker run -p 3000:3000 alanpurestake/claude-nexus-proxy:latest${NC}"
echo -e "  ${BLUE}docker run -p 3001:3001 alanpurestake/claude-nexus-dashboard:latest${NC}"