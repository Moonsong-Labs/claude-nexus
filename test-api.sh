#!/bin/bash

echo "Testing Proxy API Endpoints"
echo "==========================="

# Test health first
echo -e "\n1. Health Check:"
curl -s http://localhost:3000/health | jq .

# Test API stats
echo -e "\n2. API Stats:"
curl -s http://localhost:3000/api/stats | jq .

# Test API requests
echo -e "\n3. API Requests (limit=5):"
curl -s "http://localhost:3000/api/requests?limit=5" | jq .

# Test API domains
echo -e "\n4. API Domains:"
curl -s http://localhost:3000/api/domains | jq .

# Check if dashboard can reach proxy
echo -e "\n5. Dashboard Health Check:"
curl -s http://localhost:3001/health 2>/dev/null | jq . || echo "Dashboard not running"

echo -e "\nNote: If you see 'Database not configured', restart the proxy service."