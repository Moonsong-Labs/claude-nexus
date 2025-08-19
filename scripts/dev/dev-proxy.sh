#!/bin/bash
# Load root .env safely
set -a; . ./.env; set +a

# Run the proxy service on its own port
cd services/proxy && bun run dev