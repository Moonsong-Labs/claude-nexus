#!/bin/bash

# Script to update Claude Nexus Proxy Docker containers
# Usage: ./update-proxy.sh <version> [service]
# Examples:
#   ./update-proxy.sh v8          # Updates both containers
#   ./update-proxy.sh v8 proxy    # Updates only proxy
#   ./update-proxy.sh v8 dashboard # Updates only dashboard

VERSION=$1
SERVICE=$2
PROXY_IMAGE="alanpurestake/claude-nexus-proxy"
DASHBOARD_IMAGE="alanpurestake/claude-nexus-dashboard"

if [ -z "$VERSION" ]; then
    echo "Error: Version not specified"
    echo "Usage: $0 <version> [proxy|dashboard]"
    echo "Example: $0 v8"
    exit 1
fi

update_proxy() {
    echo "Pulling $PROXY_IMAGE:$VERSION..."
    docker pull "$PROXY_IMAGE:$VERSION"

    if [ $? -ne 0 ]; then
        echo "Error: Failed to pull image $PROXY_IMAGE:$VERSION"
        exit 1
    fi

    echo "Updating proxy container to $VERSION..."
    docker stop claude-nexus-proxy 2>/dev/null
    docker rm claude-nexus-proxy 2>/dev/null

    docker run -d --name claude-nexus-proxy \
        --network claude-nexus-network \
        --restart unless-stopped \
        -p 3000:3000 \
        -e SERVICE=proxy \
        -v $(pwd)/.env:/app/.env \
        -v ~/credentials:/app/credentials \
        "$PROXY_IMAGE:$VERSION"

    if [ $? -eq 0 ]; then
        echo "✓ Proxy updated successfully to $VERSION"
    else
        echo "✗ Failed to start proxy container"
        exit 1
    fi
}

update_dashboard() {
    echo "Pulling $DASHBOARD_IMAGE:$VERSION..."
    docker pull "$DASHBOARD_IMAGE:$VERSION"

    if [ $? -ne 0 ]; then
        echo "Error: Failed to pull image $DASHBOARD_IMAGE:$VERSION"
        exit 1
    fi

    echo "Updating dashboard container to $VERSION..."
    docker stop claude-nexus-dashboard 2>/dev/null
    docker rm claude-nexus-dashboard 2>/dev/null

    docker run -d --name claude-nexus-dashboard \
        --network claude-nexus-network \
        --restart unless-stopped \
        -p 3001:3001 \
        -e SERVICE=dashboard \
        -v $(pwd)/.env:/app/.env \
        "$DASHBOARD_IMAGE:$VERSION"

    if [ $? -eq 0 ]; then
        echo "✓ Dashboard updated successfully to $VERSION"
    else
        echo "✗ Failed to start dashboard container"
        exit 1
    fi
}

# Check if network exists, create if it doesn't
if ! docker network ls | grep -q claude-nexus-network; then
    echo "Creating Docker network claude-nexus-network..."
    docker network create claude-nexus-network
fi

# Update based on service parameter
case "$SERVICE" in
    proxy)
        update_proxy
        ;;
    dashboard)
        update_dashboard
        ;;
    *)
        # Update both if no service specified
        update_proxy
        update_dashboard
        ;;
esac

echo ""
echo "Container status:"
docker ps | grep -E "claude-nexus-proxy|claude-nexus-dashboard"