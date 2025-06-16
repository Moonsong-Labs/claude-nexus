# Production Deployment Guide

This guide covers everything you need to deploy Claude Nexus Proxy v2.0 in production.

## Architecture Overview

Version 2.0 uses a microservices architecture with two separate services:
- **Proxy Service** (Port 3000): Handles API proxying
- **Dashboard Service** (Port 3001): Provides web UI monitoring

## Quick Start

### Docker Compose (Recommended)

```bash
# Clone and configure
git clone https://github.com/moonsong-labs/claude-nexus-proxy
cd claude-nexus-proxy
cp .env.example .env.production

# Edit .env.production with your settings
vim .env.production

# Deploy all services
docker-compose --env-file .env.production up -d
```

### Production docker-compose.yml

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: claude_proxy
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  proxy:
    image: ghcr.io/moonsong-labs/claude-nexus-proxy:latest
    ports:
      - "3000:3000"
    environment:
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/claude_proxy
      - STORAGE_ENABLED=true
    depends_on:
      - postgres
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  dashboard:
    image: ghcr.io/moonsong-labs/claude-nexus-dashboard:latest
    ports:
      - "3001:3001"
    environment:
      - DASHBOARD_API_KEY=${DASHBOARD_API_KEY}
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/claude_proxy
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-nexus-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-nexus-proxy
  template:
    metadata:
      labels:
        app: claude-nexus-proxy
    spec:
      containers:
      - name: proxy
        image: ghcr.io/moonsong-labs/claude-nexus-proxy:latest
        ports:
        - containerPort: 3000
        env:
        - name: CLAUDE_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-api-key
              key: api-key
        - name: STORAGE_ENABLED
          value: "false"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: claude-nexus-proxy
spec:
  selector:
    app: claude-nexus-proxy
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

## Configuration

### Environment Variables

#### Core Settings
- `CLAUDE_API_KEY` - Default Claude API key (can be overridden per request)
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `CREDENTIALS_DIR` - Directory for domain-specific credentials (default: credentials)

#### Feature Flags
- `STORAGE_ENABLED` - Enable request/response storage (default: false)
- `SLACK_ENABLED` - Enable Slack notifications (default: true if webhook configured)
- `TELEMETRY_ENABLED` - Enable telemetry collection (default: true if endpoint configured)
- `ENABLE_DASHBOARD` - Enable web dashboard (default: true)

#### Storage Configuration (if enabled)
- `DATABASE_URL` - PostgreSQL connection string
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Individual DB settings

#### Slack Configuration
- `SLACK_WEBHOOK_URL` - Slack webhook for notifications
- `SLACK_CHANNEL` - Override default channel
- `SLACK_USERNAME` - Bot username
- `SLACK_ICON_EMOJI` - Bot icon

#### Dashboard Configuration
- `DASHBOARD_USERNAME` - Basic auth username (default: admin)
- `DASHBOARD_PASSWORD` - Basic auth password (required for production)

### Domain-Specific Credentials

Create credential files in the `CREDENTIALS_DIR`:

```bash
# API Key credential
cat > credentials/api.example.com.credentials.json << EOF
{
  "type": "api_key",
  "api_key": "sk-ant-api03-...",
  "slack": {
    "webhook_url": "https://hooks.slack.com/services/...",
    "channel": "#api-logs",
    "enabled": true
  }
}
EOF

# OAuth credential
cat > credentials/oauth.example.com.credentials.json << EOF
{
  "type": "oauth",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1705123456789,
    "scopes": ["org:create_api_key", "user:profile", "user:inference"]
  }
}
EOF
```

## Production Checklist

### Security
- [ ] Set strong `DASHBOARD_PASSWORD` for web interface
- [ ] Use HTTPS termination (nginx, cloud load balancer)
- [ ] Restrict network access to trusted sources
- [ ] Rotate API keys regularly
- [ ] Enable rate limiting for public endpoints
- [ ] Use read-only filesystem where possible
- [ ] Run as non-root user (already configured)

### Performance
- [ ] Enable connection pooling for database
- [ ] Configure appropriate resource limits
- [ ] Use horizontal scaling for high traffic
- [ ] Enable caching headers for static assets
- [ ] Monitor memory usage and adjust limits

### Monitoring
- [ ] Set up health check monitoring
- [ ] Configure log aggregation
- [ ] Monitor token usage via `/token-stats`
- [ ] Set up alerts for errors
- [ ] Track response times and throughput

### Backup & Recovery
- [ ] Backup credential files regularly
- [ ] Document recovery procedures
- [ ] Test failover scenarios
- [ ] Keep previous versions available

## Scaling Considerations

### Horizontal Scaling
The proxy is stateless (except for in-memory token tracking) and can be scaled horizontally:
- Use a load balancer to distribute traffic
- Token statistics are per-instance
- Consider using Redis for shared state if needed

### Resource Requirements
- **Memory**: 256MB minimum, 512MB recommended
- **CPU**: 0.1 CPU minimum, 0.5 CPU recommended
- **Storage**: Minimal unless using database storage

### Performance Tuning
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=1024"

# Optimize for throughput
UV_THREADPOOL_SIZE=8
```

## Troubleshooting

### Common Issues

1. **Dashboard 503 Error**
   - Check if `STORAGE_ENABLED=true` requires database
   - Verify database connection if storage is enabled

2. **Memory Issues**
   - Increase container memory limits
   - Check for memory leaks in custom code
   - Monitor with `docker stats`

3. **Slow Response Times**
   - Check Claude API latency
   - Verify network connectivity
   - Look for rate limiting

### Debug Mode
Enable detailed logging:
```bash
DEBUG=true
```

### Health Checks
- `GET /` - Basic health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /token-stats` - Token usage statistics

## Migration Guide

### From v0.1.x to v0.2.x
1. Update Docker image tag
2. Migrate credential files to new format
3. Update environment variables:
   - `ENABLE_STORAGE` → `STORAGE_ENABLED`
   - `ENABLE_SLACK` → `SLACK_ENABLED`

## Support

- Issues: https://github.com/moonsong-labs/claude-nexus-proxy/issues
- Documentation: https://github.com/moonsong-labs/claude-nexus-proxy/wiki