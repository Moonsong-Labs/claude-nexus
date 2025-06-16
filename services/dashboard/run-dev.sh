#!/bin/bash
# Development runner that ensures environment is loaded

# Load environment
if [ -f ../../.env ]; then
  set -a
  source ../../.env
  set +a
elif [ -f .env ]; then
  set -a
  source .env  
  set +a
fi

# Run the service
exec tsx watch src/main.ts