#!/bin/bash
# Load root .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run the proxy service
cd services/proxy && bun run dev