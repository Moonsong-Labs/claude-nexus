# Environment Variables Reference

Complete reference for all environment variables used in Claude Nexus Proxy.

## Essential Configuration

### Database

| Variable       | Description                  | Default | Required |
| -------------- | ---------------------------- | ------- | -------- |
| `DATABASE_URL` | PostgreSQL connection string | -       | ✅       |

Example:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/claude_nexus
```

### Authentication

| Variable             | Description                          | Default | Required |
| -------------------- | ------------------------------------ | ------- | -------- |
| `DASHBOARD_API_KEY`  | API key for dashboard authentication | -       | ✅       |
| `ENABLE_CLIENT_AUTH` | Enable client API key authentication | `true`  | ❌       |

## Feature Flags

| Variable               | Description                         | Default |
| ---------------------- | ----------------------------------- | ------- |
| `STORAGE_ENABLED`      | Enable request/response storage     | `false` |
| `DEBUG`                | Enable debug logging                | `false` |
| `COLLECT_TEST_SAMPLES` | Collect request samples for testing | `false` |

## Performance Configuration

### Timeouts

| Variable                  | Description                          | Default           |
| ------------------------- | ------------------------------------ | ----------------- |
| `CLAUDE_API_TIMEOUT`      | Timeout for Claude API requests (ms) | `600000` (10 min) |
| `PROXY_SERVER_TIMEOUT`    | Server-level timeout (ms)            | `660000` (11 min) |
| `SLOW_QUERY_THRESHOLD_MS` | Log queries slower than this (ms)    | `5000`            |

### Caching

| Variable              | Description                   | Default |
| --------------------- | ----------------------------- | ------- |
| `DASHBOARD_CACHE_TTL` | Dashboard cache TTL (seconds) | `30`    |

## Service Configuration

### Proxy Service

| Variable     | Description            | Default       |
| ------------ | ---------------------- | ------------- |
| `PROXY_PORT` | Port for proxy service | `3000`        |
| `NODE_ENV`   | Node environment       | `development` |
| `LOG_LEVEL`  | Logging level          | `info`        |

### Dashboard Service

| Variable                | Description                | Default                 |
| ----------------------- | -------------------------- | ----------------------- |
| `DASHBOARD_PORT`        | Port for dashboard service | `3001`                  |
| `DASHBOARD_TIMEZONE`    | Display timezone           | `UTC`                   |
| `DASHBOARD_DATE_FORMAT` | Date format                | `ISO`                   |
| `PROXY_BASE_URL`        | Base URL for proxy API     | `http://localhost:3000` |
| `DASHBOARD_DOMAIN`      | Domain for dashboard auth  | `localhost`             |
| `PROXY_API_KEY`         | Fallback API key for proxy | -                       |

## Integration Configuration

### Slack Integration

| Variable            | Description                     | Default |
| ------------------- | ------------------------------- | ------- |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | -       |

Example:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### OAuth Configuration

| Variable                 | Description                | Default                                |
| ------------------------ | -------------------------- | -------------------------------------- |
| `CLAUDE_OAUTH_CLIENT_ID` | OAuth client ID for Claude | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` |

## Directory Configuration

| Variable           | Description                    | Default          |
| ------------------ | ------------------------------ | ---------------- |
| `CREDENTIALS_DIR`  | Directory for credential files | `./credentials`  |
| `TEST_SAMPLES_DIR` | Directory for test samples     | `./test-samples` |

## Development Configuration

### Debug Options

| Variable       | Description                    | Default |
| -------------- | ------------------------------ | ------- |
| `AUTH_DEBUG`   | Extra authentication debugging | `false` |
| `SQL_DEBUG`    | Log all SQL queries            | `false` |
| `STREAM_DEBUG` | Debug streaming responses      | `false` |

### Test Configuration

| Variable       | Description         | Default |
| -------------- | ------------------- | ------- |
| `TEST_MODE`    | Enable test mode    | `false` |
| `TEST_API_KEY` | API key for testing | -       |

## Docker Configuration

When running in Docker, additional variables may be needed:

| Variable            | Description       | Default        |
| ------------------- | ----------------- | -------------- |
| `DATABASE_HOST`     | Database hostname | `postgres`     |
| `DATABASE_PORT`     | Database port     | `5432`         |
| `DATABASE_NAME`     | Database name     | `claude_nexus` |
| `DATABASE_USER`     | Database username | `postgres`     |
| `DATABASE_PASSWORD` | Database password | -              |

## Production Configuration

### Security

| Variable         | Description             | Default |
| ---------------- | ----------------------- | ------- |
| `FORCE_HTTPS`    | Force HTTPS connections | `false` |
| `CORS_ORIGIN`    | Allowed CORS origins    | `*`     |
| `SECURE_COOKIES` | Use secure cookies      | `false` |

### Monitoring

| Variable                      | Description             | Default |
| ----------------------------- | ----------------------- | ------- |
| `METRICS_ENABLED`             | Enable metrics endpoint | `false` |
| `METRICS_PORT`                | Port for metrics        | `9090`  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint  | -       |

## Example .env File

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/claude_nexus

# Authentication
DASHBOARD_API_KEY=your-secure-dashboard-key
ENABLE_CLIENT_AUTH=true

# Features
STORAGE_ENABLED=true
DEBUG=false

# Performance
CLAUDE_API_TIMEOUT=600000
PROXY_SERVER_TIMEOUT=660000
SLOW_QUERY_THRESHOLD_MS=5000
DASHBOARD_CACHE_TTL=30

# Services
PROXY_PORT=3000
DASHBOARD_PORT=3001

# Integrations
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Directories
CREDENTIALS_DIR=./credentials
TEST_SAMPLES_DIR=./test-samples

# Production (uncomment for production)
# NODE_ENV=production
# LOG_LEVEL=warn
# FORCE_HTTPS=true
# SECURE_COOKIES=true
```

## Environment-Specific Configurations

### Development

```bash
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
STORAGE_ENABLED=true
```

### Staging

```bash
NODE_ENV=staging
DEBUG=false
LOG_LEVEL=info
STORAGE_ENABLED=true
METRICS_ENABLED=true
```

### Production

```bash
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
STORAGE_ENABLED=true
METRICS_ENABLED=true
FORCE_HTTPS=true
SECURE_COOKIES=true
```

## Loading Environment Variables

### From .env File

The project automatically loads `.env` files using dotenv:

```typescript
import { config } from 'dotenv'
config()
```

### From Docker

Pass environment variables to Docker:

```bash
docker run -e DATABASE_URL=postgresql://... claude-nexus-proxy
```

Or use env file:

```bash
docker run --env-file .env claude-nexus-proxy
```

### From Docker Compose

```yaml
services:
  proxy:
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - STORAGE_ENABLED=true
    env_file:
      - .env
```

## Validation

The proxy validates required environment variables on startup:

```typescript
const requiredVars = ['DATABASE_URL', 'DASHBOARD_API_KEY']

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`)
  }
}
```

## Best Practices

1. **Never commit .env files** - Add to .gitignore
2. **Use strong values** - Generate secure keys and passwords
3. **Document changes** - Update this reference when adding variables
4. **Validate early** - Check required variables on startup
5. **Use defaults wisely** - Provide sensible defaults for optional vars
6. **Separate by environment** - Use .env.development, .env.production
7. **Secure production** - Use secret management tools in production

## Troubleshooting

### Variable Not Loading

1. Check file location: `.env` should be in project root
2. Verify format: `KEY=value` without spaces around `=`
3. Check for typos in variable names
4. Ensure no quotes unless value contains spaces

### Docker Variables

1. Use `docker compose config` to verify resolution
2. Check precedence: CLI > docker-compose.yml > .env
3. Use `printenv` inside container to debug

### Production Issues

1. Verify secrets are properly injected
2. Check for environment-specific overrides
3. Ensure no hardcoded values in code
4. Review logs for validation errors

## Next Steps

- [Configuration Guide](../01-Getting-Started/configuration.md)
- [Deployment Guide](../03-Operations/deployment/docker.md)
- [Security Best Practices](../03-Operations/security.md)
