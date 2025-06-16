#!/bin/bash

echo "Testing Phase 1 Integration"
echo "=========================="

# Test Proxy Health
echo -e "\n1. Testing Proxy Health:"
curl -s http://localhost:3000/health | jq .

# Test Proxy API Stats
echo -e "\n2. Testing Proxy API Stats:"
curl -s http://localhost:3000/api/stats | jq .

# Test Proxy API Requests
echo -e "\n3. Testing Proxy API Requests:"
curl -s "http://localhost:3000/api/requests?limit=5" | jq .

# Test Proxy API Domains
echo -e "\n4. Testing Proxy API Domains:"
curl -s http://localhost:3000/api/domains | jq .

# Test Dashboard Health (if running)
echo -e "\n5. Testing Dashboard Health:"
curl -s http://localhost:3001/health 2>/dev/null | jq . || echo "Dashboard not running"

echo -e "\nIntegration test complete!"