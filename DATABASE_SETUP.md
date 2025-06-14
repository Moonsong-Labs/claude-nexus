# Database Setup for Claude Nexus Proxy

## Quick Start

### 1. Set Database URL

Add to your `.env` file:
```bash
DATABASE_URL=postgresql://username:password@host:port/database_name
```

### 2. Initialize Database

Run the setup script:
```bash
bun run scripts/setup-database.ts
```

This will create:
- `requests` table - Stores all API requests and responses
- `streaming_chunks` table - Stores SSE streaming data
- `hourly_stats` materialized view - Pre-aggregated stats for performance
- All necessary indexes

## Manual Setup

If you prefer to set up manually, connect to your PostgreSQL database and run:
```bash
psql $DATABASE_URL < scripts/init-database.sql
```

## Table Schema

### requests
- `request_id` - UUID primary key
- `timestamp` - When the request was made
- `domain` - Domain making the request
- `model` - Claude model used
- `input_tokens` - Input token count
- `output_tokens` - Output token count
- `response_time_ms` - Response time in milliseconds
- `request_body` - Full request as JSONB
- `response_body` - Full response as JSONB
- And more fields for tracking

### streaming_chunks
- Stores individual SSE chunks for streaming responses
- Linked to requests via `request_id`

## Maintenance

### Refresh Materialized View
For better dashboard performance, refresh the stats view periodically:
```sql
SELECT refresh_hourly_stats();
```

### Clean Old Data
To remove data older than 30 days:
```sql
DELETE FROM requests WHERE timestamp < NOW() - INTERVAL '30 days';
```

## Troubleshooting

### Connection Issues
- Ensure PostgreSQL is running
- Check firewall rules
- For AWS RDS, ensure security group allows connections
- For SSL connections, the script auto-detects AWS endpoints

### Permission Issues
Make sure your database user has permissions:
```sql
GRANT ALL PRIVILEGES ON DATABASE your_database TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Performance
If the dashboard is slow:
1. Ensure indexes exist (the setup script creates them)
2. Refresh the materialized view
3. Consider partitioning the requests table by timestamp