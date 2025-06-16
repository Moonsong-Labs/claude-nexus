#!/bin/bash

# Start the proxy with dashboard enabled
echo "Starting Claude Nexus Proxy with dashboard..."
docker run -d --name test-proxy -p 3000:3000 \
  -e CLAUDE_API_KEY=test-key \
  -e STORAGE_ENABLED=true \
  -e DATABASE_URL="postgresql://postgres:mslpasswordmslpassword@aurora-serverless-nexus-logs-instance.canjjr6w3qne.us-east-1.rds.amazonaws.com:5432/nexus_query_logs" \
  -e DASHBOARD_API_KEY=test123 \
  claude-nexus-proxy

echo "Waiting for server to start..."
sleep 3

echo -e "\n📊 Dashboard is available at: http://localhost:3000/dashboard"
echo "🔑 Login with API key: test123"
echo -e "\nTesting dashboard endpoints..."

# Test login page
echo -e "\n1. Login page:"
curl -s http://localhost:3000/dashboard/login | grep -o "<title>.*</title>" || echo "Failed to load login page"

# Test API with header authentication
echo -e "\n2. API endpoint with header auth:"
curl -s -H "X-Dashboard-Key: test123" http://localhost:3000/dashboard/api/stats | jq '.' 2>/dev/null || echo "Failed to access API"

# Show container logs
echo -e "\n3. Container logs:"
docker logs test-proxy | tail -10

echo -e "\n✅ Dashboard is running. Visit http://localhost:3000/dashboard to login."
echo "Press Enter to stop and clean up..."
read

docker stop test-proxy
docker rm test-proxy
echo "Cleaned up test container."