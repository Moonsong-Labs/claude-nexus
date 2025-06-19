#!/bin/bash
# Script to copy database nexus_query_logs to nexus_query_test

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set"
    echo "Please set it to your PostgreSQL connection string"
    exit 1
fi

# Extract connection parameters from DATABASE_URL
# Expected format: postgresql://username:password@host:port/database
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    echo "Error: Could not parse DATABASE_URL"
    echo "Expected format: postgresql://username:password@host:port/database"
    exit 1
fi

SOURCE_DB="nexus_query_logs"
TARGET_DB="nexus_query_test"

echo "==================================="
echo "Database Copy Script"
echo "==================================="
echo "Source database: $SOURCE_DB"
echo "Target database: $TARGET_DB"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# Set PGPASSWORD for authentication
export PGPASSWORD=$DB_PASS

# Check if target database already exists
echo "Checking if target database exists..."
EXISTS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB'")

if [ "$EXISTS" = "1" ]; then
    echo "Warning: Target database '$TARGET_DB' already exists!"
    read -p "Do you want to drop and recreate it? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Operation cancelled."
        exit 0
    fi
    
    echo "Dropping existing database..."
    # Terminate existing connections
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '$TARGET_DB' AND pid <> pg_backend_pid();"
    # Drop database
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $TARGET_DB;"
fi

# Create target database
echo "Creating target database..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $TARGET_DB;"

if [ $? -ne 0 ]; then
    echo "Error: Failed to create target database"
    exit 1
fi

# Copy database using pg_dump and psql
echo "Copying database (this may take a while)..."
pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $SOURCE_DB | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database copied successfully!"
    echo ""
    
    # Show some statistics
    echo "Verifying copy..."
    echo ""
    echo "Table row counts in $TARGET_DB:"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -c "
    SELECT 
        'api_requests' as table_name, 
        COUNT(*) as row_count 
    FROM api_requests
    UNION ALL
    SELECT 
        'streaming_chunks' as table_name, 
        COUNT(*) as row_count 
    FROM streaming_chunks
    ORDER BY table_name;"
    
else
    echo ""
    echo "❌ Error: Database copy failed"
    exit 1
fi

# Clean up
unset PGPASSWORD