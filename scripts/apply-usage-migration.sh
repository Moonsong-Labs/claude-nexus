#!/bin/bash
# Script to apply the full usage data migration

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set"
  echo "Please set DATABASE_URL environment variable or add it to .env file"
  exit 1
fi

echo "Applying migration to add full usage data columns..."

# Apply the migration
psql "$DATABASE_URL" < scripts/migrations/add-full-usage-data.sql

if [ $? -eq 0 ]; then
  echo "Migration applied successfully!"
  echo ""
  echo "New columns added:"
  echo "  - cache_creation_input_tokens: Tracks tokens written to cache"
  echo "  - cache_read_input_tokens: Tracks tokens read from cache"
  echo "  - usage_data: Stores complete usage object from Claude API"
  echo ""
  echo "The materialized view 'hourly_stats' has been updated to include cache token statistics."
else
  echo "Error: Migration failed"
  exit 1
fi