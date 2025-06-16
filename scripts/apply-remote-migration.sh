#!/bin/bash
# Script to apply migrations to the remote database

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set"
  exit 1
fi

echo "WARNING: This will apply migrations to the REMOTE database:"
echo "$DATABASE_URL"
echo ""
echo "Press ENTER to continue or CTRL+C to cancel..."
read

echo "Applying migrations..."

# First check current columns
echo "Current columns in api_requests table:"
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='api_requests' AND column_name IN ('tool_calls', 'tool_call_count', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'usage_data') ORDER BY column_name;"

# Apply the migrations
echo ""
echo "Applying column fix migration..."
psql "$DATABASE_URL" < scripts/migrations/fix-column-names.sql

echo ""
echo "Applying usage data migration..."
psql "$DATABASE_URL" < scripts/migrations/add-full-usage-data.sql

echo ""
echo "Verifying new columns..."
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='api_requests' AND column_name IN ('tool_call_count', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'usage_data') ORDER BY column_name;"

echo ""
echo "Migration complete!"