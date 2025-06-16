#!/bin/bash

# Start services based on SERVICE environment variable
# Default to starting both services if not specified

SERVICE=${SERVICE:-both}

case "$SERVICE" in
  proxy)
    echo "Starting Proxy Service..."
    if [ -f "services/proxy/dist/index.js" ]; then
      exec bun services/proxy/dist/index.js
    else
      echo "⚠️  No production build found, running from source..."
      exec bun services/proxy/src/main.ts
    fi
    ;;
  dashboard)
    echo "Starting Dashboard Service..."
    # Set PORT for dashboard from DASHBOARD_PORT if provided
    if [ -n "$DASHBOARD_PORT" ]; then
      export PORT=$DASHBOARD_PORT
    fi
    if [ -f "services/dashboard/dist/index.js" ]; then
      exec bun services/dashboard/dist/index.js
    else
      echo "⚠️  No production build found, running from source..."
      exec bun services/dashboard/src/main.ts
    fi
    ;;
  both)
    echo "Starting both services..."
    # Check if production builds exist
    if [ -f "services/proxy/dist/index.js" ] && [ -f "services/dashboard/dist/index.js" ]; then
      exec bun x concurrently -k -p "[{name}]" -n "proxy,dashboard" -c "blue,green" \
        "bun services/proxy/dist/index.js" \
        "PORT=3001 bun services/dashboard/dist/index.js"
    else
      echo "⚠️  No production builds found, running from source..."
      exec bun x concurrently -k -p "[{name}]" -n "proxy,dashboard" -c "blue,green" \
        "bun services/proxy/src/main.ts" \
        "PORT=3001 bun services/dashboard/src/main.ts"
    fi
    ;;
  *)
    echo "Unknown service: $SERVICE"
    echo "Valid options: proxy, dashboard, both"
    exit 1
    ;;
esac