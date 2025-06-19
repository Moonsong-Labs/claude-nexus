#!/bin/bash
# One-liner commands to copy database
# Replace the connection parameters with your actual values

# Method 1: Using pg_dump and psql (recommended)
echo "Method 1: Using pg_dump and psql"
echo "================================"
echo "Run these commands in order:"
echo ""
echo "# 1. Create the target database (if it doesn't exist)"
echo "psql \$DATABASE_URL -c \"CREATE DATABASE nexus_query_test;\""
echo ""
echo "# 2. Copy the database"
echo "pg_dump \$DATABASE_URL/../nexus_query_logs | psql \$DATABASE_URL/../nexus_query_test"
echo ""
echo ""

# Method 2: Using CREATE DATABASE with TEMPLATE
echo "Method 2: Using CREATE DATABASE with TEMPLATE (faster but requires no active connections)"
echo "================================================================================="
echo "Run these commands in order:"
echo ""
echo "# 1. Terminate connections to source database"
echo "psql \$DATABASE_URL -c \"SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'nexus_query_logs' AND pid <> pg_backend_pid();\""
echo ""
echo "# 2. Create copy using template"
echo "psql \$DATABASE_URL -c \"CREATE DATABASE nexus_query_test WITH TEMPLATE nexus_query_logs;\""
echo ""
echo ""

# Method 3: If you have direct psql access
echo "Method 3: Direct psql commands (if you have the connection details)"
echo "=================================================================="
echo "# Assuming your DATABASE_URL is postgresql://user:pass@host:port/database"
echo ""
echo "# Extract connection info and run:"
echo "pg_dump -h host -p port -U user -d nexus_query_logs | psql -h host -p port -U user -d nexus_query_test"
echo ""