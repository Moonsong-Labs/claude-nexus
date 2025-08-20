#!/bin/bash
# Load root .env safely
set -a; . ./.env; set +a

# Run the dashboard service on its own port
cd services/dashboard && bun run dev