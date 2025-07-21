# Operations Guide

This guide covers operational procedures for monitoring, maintaining, and troubleshooting Claude Nexus Proxy in production.

## Health Monitoring

### Health Check Endpoints

Both services expose health endpoints for monitoring:

```bash
# Proxy health check
curl http://localhost:3000/health

# Dashboard health check
curl http://localhost:3001/health
```

### Container Health Status

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' claude-proxy
docker inspect --format='{{.State.Health.Status}}' claude-dashboard

# View health check logs
docker inspect --format='{{json .State.Health}}' claude-proxy | jq
```

## Logging

### View Container Logs

```bash
# Follow logs in real-time
docker logs -f claude-proxy
docker logs -f claude-dashboard

# View last 100 lines
docker logs --tail 100 claude-proxy

# View logs with timestamps
docker logs -t claude-proxy
```

### Log Drivers for Production

Configure appropriate log drivers for centralized logging:

```bash
# JSON file logging with rotation
docker run --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  claude-nexus-proxy:latest

# Syslog for system integration
docker run --log-driver syslog \
  --log-opt syslog-address=udp://logserver:514 \
  claude-nexus-proxy:latest
```

### Debug Logging

Enable debug mode for troubleshooting:

```bash
# Enable debug logging
docker run -e DEBUG=true claude-nexus-proxy:latest

# Enable SQL query logging
docker run -e DEBUG_SQL=true claude-nexus-proxy:latest
```

## Metrics and Monitoring

### Application Metrics

#### Token Usage Statistics

```bash
# Get current token usage
curl http://localhost:3000/token-stats

# Get usage for specific account
curl "http://localhost:3000/api/token-usage/current?accountId=acc_xxx" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

#### Request Metrics

Monitor request patterns through the dashboard:

- Request counts by domain
- Response times
- Error rates
- Token consumption trends

### Container Metrics

```bash
# Real-time resource usage
docker stats claude-proxy claude-dashboard

# Detailed container information
docker inspect claude-proxy | jq '.[0].State'

# Resource limits
docker inspect claude-proxy | jq '.[0].HostConfig.Memory'
```

## Troubleshooting

### Common Issues

#### Container Won't Start

1. Check logs for startup errors:

   ```bash
   docker logs claude-proxy
   ```

2. Verify environment variables:

   ```bash
   docker inspect claude-proxy | jq '.[0].Config.Env'
   ```

3. Check port availability:
   ```bash
   lsof -i :3000,3001
   ```

#### Database Connection Issues

1. Test database connectivity:

   ```bash
   docker exec claude-proxy pg_isready -h $DB_HOST
   ```

2. Verify DATABASE_URL:

   ```bash
   docker exec claude-proxy printenv DATABASE_URL
   ```

3. Check network connectivity:
   ```bash
   docker exec claude-proxy ping -c 3 postgres
   ```

#### High Memory Usage

1. Check current usage:

   ```bash
   docker stats --no-stream claude-proxy
   ```

2. Limit memory:

   ```bash
   docker update --memory="1g" claude-proxy
   ```

3. Analyze memory consumption:
   ```bash
   docker exec claude-proxy cat /proc/meminfo
   ```

#### Slow Performance

1. Enable slow query logging:

   ```bash
   docker run -e SLOW_QUERY_THRESHOLD_MS=1000 claude-nexus-proxy:latest
   ```

2. Check database performance:

   ```sql
   -- Run in PostgreSQL
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

3. Monitor response times in dashboard

### Debug Commands

#### Access Container Shell

```bash
# Access running container
docker exec -it claude-proxy /bin/sh

# Start new container with shell
docker run -it --entrypoint /bin/sh claude-nexus-proxy:latest
```

#### Network Debugging

```bash
# List container networks
docker inspect claude-proxy | jq '.[0].NetworkSettings.Networks'

# Test internal connectivity
docker exec claude-proxy wget -O- http://dashboard:3001/health

# DNS resolution
docker exec claude-proxy nslookup postgres
```

## Maintenance Tasks

### Log Rotation

```bash
# Manual log rotation
docker logs claude-proxy 2>&1 | gzip > proxy-logs-$(date +%Y%m%d).gz
echo "" | docker logs claude-proxy

# Configure automatic rotation
# Add to /etc/logrotate.d/docker-containers
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    missingok
    delaycompress
    copytruncate
}
```

### Container Updates

```bash
# Pull latest image
docker pull claude-nexus-proxy:latest

# Stop old container
docker stop claude-proxy

# Start new container with same config
docker run -d --name claude-proxy-new [same options] claude-nexus-proxy:latest

# Verify new container is healthy
docker inspect --format='{{.State.Health.Status}}' claude-proxy-new

# Remove old container
docker rm claude-proxy

# Rename new container
docker rename claude-proxy-new claude-proxy
```

### Database Maintenance

```bash
# Run vacuum from proxy container
docker exec claude-proxy psql $DATABASE_URL -c "VACUUM ANALYZE;"

# Check table sizes
docker exec claude-proxy psql $DATABASE_URL -c "
SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

## Backup Procedures

### Database Backup

```bash
# Backup from container
docker exec postgres pg_dump -U postgres claude_proxy | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore backup
gunzip < backup-20240101.sql.gz | docker exec -i postgres psql -U postgres claude_proxy
```

### Credentials Backup

```bash
# Backup credentials volume
docker run --rm -v claude-credentials:/data -v $(pwd):/backup alpine tar czf /backup/credentials-$(date +%Y%m%d).tar.gz -C /data .

# Restore credentials
docker run --rm -v claude-credentials:/data -v $(pwd):/backup alpine tar xzf /backup/credentials-20240101.tar.gz -C /data
```

## Security Operations

### Security Scanning

```bash
# Scan images for vulnerabilities
docker scan claude-nexus-proxy:latest
docker scan claude-nexus-dashboard:latest

# Detailed vulnerability report
trivy image claude-nexus-proxy:latest
```

### Access Control

```bash
# View container user
docker exec claude-proxy whoami

# Check file permissions
docker exec claude-proxy ls -la /app/credentials/

# Verify read-only mounts
docker inspect claude-proxy | jq '.[0].Mounts'
```

## Performance Tuning

### Container Resource Limits

```bash
# Set CPU and memory limits
docker update --cpus="2.0" --memory="2g" claude-proxy

# Set restart policy
docker update --restart=always claude-proxy
```

### Database Connection Pooling

Monitor and adjust connection pool settings:

```bash
# Check active connections
docker exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname='claude_proxy';"

# Adjust pool size in DATABASE_URL
DATABASE_URL=postgresql://user:pass@host/db?pool_max=50&pool_idle_timeout=10000
```

## Disaster Recovery

### Quick Recovery Steps

1. **Service Down**:

   ```bash
   # Check container status
   docker ps -a | grep claude

   # Restart container
   docker start claude-proxy

   # Check logs for errors
   docker logs --tail 50 claude-proxy
   ```

2. **Data Corruption**:

   ```bash
   # Stop services
   docker stop claude-proxy claude-dashboard

   # Restore from backup
   # See Backup Procedures section

   # Start services
   docker start claude-proxy claude-dashboard
   ```

3. **Complete Recovery**:
   ```bash
   # Re-deploy from scratch
   ./docker-up.sh down
   ./docker-up.sh up -d
   ```

## Monitoring Best Practices

1. **Set up alerts** for:
   - Container health check failures
   - High memory/CPU usage
   - Database connection errors
   - API response time degradation

2. **Regular checks**:
   - Daily: Review logs for errors
   - Weekly: Check resource usage trends
   - Monthly: Review token usage and costs

3. **Documentation**:
   - Keep runbook updated
   - Document any custom configurations
   - Maintain incident response procedures

## Related Guides

- [Docker Deployment](./deployment/docker.md) - Building and running containers
- [Docker Compose](./deployment/docker-compose.md) - Multi-container setup
- [Database Guide](./database.md) - Database setup and maintenance
- [Environment Variables](../06-Reference/environment-vars.md) - Configuration reference
