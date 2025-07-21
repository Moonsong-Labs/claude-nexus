# Environment Variables Reference

Complete reference for all environment variables used in Claude Nexus Proxy.

## Essential Configuration

| Variable            | Description                          | Default | Required |
| ------------------- | ------------------------------------ | ------- | -------- |
| `DATABASE_URL`      | PostgreSQL connection string         | -       | ✅       |
| `DASHBOARD_API_KEY` | API key for dashboard authentication | -       | ✅       |

## Server Configuration

| Variable               | Description                                       | Default           |
| ---------------------- | ------------------------------------------------- | ----------------- |
| `PORT`                 | Port for the server                               | `3000`            |
| `HOST`                 | Host binding for the server                       | `0.0.0.0`         |
| `NODE_ENV`             | Node environment (development/staging/production) | `development`     |
| `PROXY_SERVER_TIMEOUT` | Server-level timeout in milliseconds              | `660000` (11 min) |

## Claude API Configuration

| Variable                 | Description                                     | Default                     |
| ------------------------ | ----------------------------------------------- | --------------------------- |
| `CLAUDE_API_BASE_URL`    | Base URL for Claude API                         | `https://api.anthropic.com` |
| `CLAUDE_API_TIMEOUT`     | Timeout for Claude API requests in milliseconds | `600000` (10 min)           |
| `CLAUDE_OAUTH_CLIENT_ID` | OAuth client ID for Claude                      | -                           |

## Storage & Database

| Variable                       | Description                            | Default                      |
| ------------------------------ | -------------------------------------- | ---------------------------- |
| `STORAGE_ENABLED`              | Enable request/response storage        | `false`                      |
| `STORAGE_BATCH_SIZE`           | Batch size for storage operations      | `100`                        |
| `STORAGE_BATCH_INTERVAL`       | Batch interval in milliseconds         | `5000`                       |
| `STORAGE_ADAPTER_CLEANUP_MS`   | Cleanup interval for orphaned mappings | `300000` (5 min)             |
| `STORAGE_ADAPTER_RETENTION_MS` | Retention time for request ID mappings | `3600000` (1 hour)           |
| `DB_HOST`                      | Database hostname                      | `localhost`                  |
| `DB_PORT`                      | Database port                          | `5432`                       |
| `DB_NAME`                      | Database name                          | `claude_proxy`               |
| `DB_USER`                      | Database username                      | `postgres`                   |
| `DB_PASSWORD`                  | Database password                      | -                            |
| `DB_SSL`                       | Enable SSL for database connections    | `false` (true in production) |
| `DB_POOL_SIZE`                 | Database connection pool size          | `20`                         |

## Authentication & Security

| Variable             | Description                                  | Default                           |
| -------------------- | -------------------------------------------- | --------------------------------- |
| `ENABLE_CLIENT_AUTH` | Enable client API key authentication         | `true`                            |
| `CREDENTIALS_DIR`    | Directory containing domain credential files | `credentials`                     |
| `API_KEY_SALT`       | Salt for hashing API keys in database        | `claude-nexus-proxy-default-salt` |

## Rate Limiting

| Variable                         | Description                       | Default            |
| -------------------------------- | --------------------------------- | ------------------ |
| `RATE_LIMIT_WINDOW_MS`           | Rate limit window in milliseconds | `3600000` (1 hour) |
| `RATE_LIMIT_MAX_REQUESTS`        | Max requests per window           | `1000`             |
| `RATE_LIMIT_MAX_TOKENS`          | Max tokens per window             | `1000000`          |
| `DOMAIN_RATE_LIMIT_WINDOW_MS`    | Domain rate limit window          | `3600000` (1 hour) |
| `DOMAIN_RATE_LIMIT_MAX_REQUESTS` | Max domain requests per window    | `5000`             |
| `DOMAIN_RATE_LIMIT_MAX_TOKENS`   | Max domain tokens per window      | `5000000`          |

## Circuit Breaker

| Variable                            | Description                             | Default          |
| ----------------------------------- | --------------------------------------- | ---------------- |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | Consecutive failures before opening     | `5`              |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | Successes needed to close circuit       | `3`              |
| `CIRCUIT_BREAKER_TIMEOUT`           | Timeout before retrying in milliseconds | `120000` (2 min) |
| `CIRCUIT_BREAKER_VOLUME_THRESHOLD`  | Min requests before evaluation          | `10`             |
| `CIRCUIT_BREAKER_ERROR_PERCENTAGE`  | Error percentage threshold              | `50`             |

## Request Validation

| Variable             | Description                   | Default           |
| -------------------- | ----------------------------- | ----------------- |
| `MAX_REQUEST_SIZE`   | Maximum request size in bytes | `10485760` (10MB) |
| `MAX_MESSAGE_COUNT`  | Maximum messages per request  | `100`             |
| `MAX_SYSTEM_LENGTH`  | Maximum system prompt length  | `10000`           |
| `MAX_MESSAGE_LENGTH` | Maximum message length        | `100000`          |
| `MAX_TOTAL_LENGTH`   | Maximum total request length  | `500000`          |

## Logging & Debugging

| Variable                  | Description                           | Default                      |
| ------------------------- | ------------------------------------- | ---------------------------- |
| `LOG_LEVEL`               | Logging level (debug/info/warn/error) | `info`                       |
| `LOG_JSON`                | Use JSON format for logs              | `false` (true in production) |
| `DEBUG`                   | Enable comprehensive debug logging    | `false`                      |
| `DEBUG_SQL`               | Enable SQL query logging              | `false`                      |
| `SLOW_QUERY_THRESHOLD_MS` | Log queries slower than this (ms)     | `5000`                       |

## Caching

| Variable                | Description                          | Default            |
| ----------------------- | ------------------------------------ | ------------------ |
| `MESSAGE_CACHE_SIZE`    | Message cache size                   | `1000`             |
| `CREDENTIAL_CACHE_TTL`  | Credential cache TTL in milliseconds | `3600000` (1 hour) |
| `CREDENTIAL_CACHE_SIZE` | Credential cache size                | `100`              |
| `DASHBOARD_CACHE_TTL`   | Dashboard cache TTL in seconds       | `30`               |

## Integrations

### Slack Integration

| Variable            | Description                         | Default        |
| ------------------- | ----------------------------------- | -------------- |
| `SLACK_WEBHOOK_URL` | Slack webhook URL for notifications | -              |
| `SLACK_CHANNEL`     | Slack channel override              | -              |
| `SLACK_USERNAME`    | Slack username                      | `Claude Proxy` |
| `SLACK_ICON_EMOJI`  | Slack icon emoji                    | `:robot_face:` |

### Spark Integration

| Variable        | Description                      | Default                 |
| --------------- | -------------------------------- | ----------------------- |
| `SPARK_API_URL` | Spark API base URL               | `http://localhost:8000` |
| `SPARK_API_KEY` | API key for Spark authentication | -                       |

### Telemetry

| Variable             | Description            | Default |
| -------------------- | ---------------------- | ------- |
| `TELEMETRY_ENDPOINT` | Telemetry endpoint URL | -       |
| `TELEMETRY_ENABLED`  | Enable telemetry       | `true`  |

## AI Analysis Configuration

### Background Worker

| Variable                        | Description                          | Default |
| ------------------------------- | ------------------------------------ | ------- |
| `AI_WORKER_ENABLED`             | Enable AI analysis background worker | `false` |
| `AI_WORKER_POLL_INTERVAL_MS`    | Worker polling interval              | `5000`  |
| `AI_WORKER_MAX_CONCURRENT_JOBS` | Max concurrent jobs per worker       | `3`     |
| `AI_WORKER_JOB_TIMEOUT_MINUTES` | Job timeout in minutes               | `5`     |

### Gemini API

| Variable            | Description           | Default                                                   |
| ------------------- | --------------------- | --------------------------------------------------------- |
| `GEMINI_API_KEY`    | Google Gemini API key | -                                                         |
| `GEMINI_API_URL`    | Gemini API base URL   | `https://generativelanguage.googleapis.com/v1beta/models` |
| `GEMINI_MODEL_NAME` | Gemini model name     | `gemini-2.0-flash-exp`                                    |

### Analysis Settings

| Variable                                         | Description                              | Default |
| ------------------------------------------------ | ---------------------------------------- | ------- |
| `AI_ANALYSIS_MAX_RETRIES`                        | Max retry attempts for failed jobs       | `3`     |
| `AI_ANALYSIS_GEMINI_REQUEST_TIMEOUT_MS`          | Gemini API request timeout               | `60000` |
| `AI_ANALYSIS_RATE_LIMIT_CREATION`                | Analysis creation rate limit per minute  | `15`    |
| `AI_ANALYSIS_RATE_LIMIT_RETRIEVAL`               | Analysis retrieval rate limit per minute | `100`   |
| `AI_ANALYSIS_ENABLE_PII_REDACTION`               | Enable PII redaction                     | `true`  |
| `AI_ANALYSIS_ENABLE_PROMPT_INJECTION_PROTECTION` | Enable prompt injection protection       | `true`  |
| `AI_ANALYSIS_ENABLE_OUTPUT_VALIDATION`           | Enable output validation                 | `true`  |
| `AI_ANALYSIS_ENABLE_AUDIT_LOGGING`               | Enable audit logging                     | `true`  |

### Prompt Configuration

| Variable                                     | Description                      | Default   |
| -------------------------------------------- | -------------------------------- | --------- |
| `AI_MAX_CONTEXT_TOKENS`                      | Maximum context window size      | `1000000` |
| `AI_MAX_PROMPT_TOKENS`                       | Override calculated token limit  | `855000`  |
| `AI_MAX_PROMPT_TOKENS_BASE`                  | Base tokens before safety margin | `900000`  |
| `AI_TOKENIZER_SAFETY_MARGIN`                 | Safety margin multiplier         | `0.95`    |
| `AI_HEAD_MESSAGES`                           | Messages to keep from start      | `5`       |
| `AI_TAIL_MESSAGES`                           | Messages to keep from end        | `20`      |
| `AI_ESTIMATED_CHARS_PER_TOKEN`               | Estimated characters per token   | `12`      |
| `AI_ANALYSIS_INPUT_TRUNCATION_TARGET_TOKENS` | Target tokens for truncation     | `8192`    |
| `AI_ANALYSIS_TRUNCATE_FIRST_N_TOKENS`        | Tokens from conversation start   | `1000`    |
| `AI_ANALYSIS_TRUNCATE_LAST_M_TOKENS`         | Tokens from conversation end     | `4000`    |
| `AI_ANALYSIS_PROMPT_VERSION`                 | Prompt version to use            | `v1`      |

## MCP (Model Context Protocol) Server

| Variable          | Description                            | Default     |
| ----------------- | -------------------------------------- | ----------- |
| `MCP_ENABLED`     | Enable MCP server                      | `false`     |
| `MCP_PROMPTS_DIR` | Directory containing prompt YAML files | `./prompts` |
| `MCP_WATCH_FILES` | Enable hot-reloading of prompt files   | `true`      |

### GitHub Synchronization

| Variable                    | Description                  | Default    |
| --------------------------- | ---------------------------- | ---------- |
| `MCP_GITHUB_OWNER`          | GitHub organization/user     | -          |
| `MCP_GITHUB_REPO`           | GitHub repository name       | -          |
| `MCP_GITHUB_BRANCH`         | Git branch to sync from      | `main`     |
| `MCP_GITHUB_TOKEN`          | GitHub personal access token | -          |
| `MCP_GITHUB_PATH`           | Path within repository       | `prompts/` |
| `MCP_SYNC_INTERVAL`         | Sync interval in seconds     | `300`      |
| `MCP_GITHUB_WEBHOOK_SECRET` | GitHub webhook secret        | -          |

### MCP Cache

| Variable         | Description           | Default |
| ---------------- | --------------------- | ------- |
| `MCP_CACHE_TTL`  | Cache TTL in seconds  | `300`   |
| `MCP_CACHE_SIZE` | Maximum cache entries | `1000`  |

## Feature Flags

| Variable               | Description                         | Default        |
| ---------------------- | ----------------------------------- | -------------- |
| `ENABLE_HEALTH_CHECKS` | Enable health check endpoints       | `true`         |
| `ENABLE_METRICS`       | Enable metrics endpoints            | `true`         |
| `ENABLE_NOTIFICATIONS` | Enable notifications                | `true`         |
| `ENABLE_DASHBOARD`     | Enable dashboard                    | `true`         |
| `COLLECT_TEST_SAMPLES` | Collect request samples for testing | `false`        |
| `TEST_SAMPLES_DIR`     | Directory for test samples          | `test-samples` |

## Quick Start

Create a `.env` file in the project root:

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/claude_nexus
DASHBOARD_API_KEY=your-secure-api-key

# Enable features
STORAGE_ENABLED=true
AI_WORKER_ENABLED=true
MCP_ENABLED=true
```

## Security Notes

1. **Never commit `.env` files** to version control
2. **Use strong values** for API keys and passwords
3. **Rotate credentials** regularly
4. **Use environment-specific** configurations
5. **Enable SSL** in production (`DB_SSL=true`)

## See Also

- [Configuration Guide](../01-Getting-Started/configuration.md)
- [Deployment Guide](../03-Operations/deployment/docker.md)
- [Security Best Practices](../03-Operations/security.md)
