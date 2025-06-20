#!/bin/bash
# Load root .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run the dashboard service
cd services/dashboard && bun run dev