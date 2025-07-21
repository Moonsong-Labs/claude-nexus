# Backup and Recovery Guide

Protect your Claude Nexus Proxy data with comprehensive backup and disaster recovery procedures.

## Overview

This guide is organized into two main sections:

1. **Available Tools** - Backup utilities that are implemented and ready to use
2. **Implementation Templates** - Shell script examples and patterns for building comprehensive backup strategies

### What's Currently Available

✅ **Database Backup Utility** (`scripts/db/backup-database.ts`)

- Full database backups to SQL files or backup databases
- Time-based filtering for recent data
- Secure TypeScript implementation

✅ **Copy Conversation Utility** (`scripts/copy-conversation.ts`)

- Selective conversation copying between databases
- Dry-run mode for safety
- Cross-database migration support

❌ **Not Yet Implemented** (see templates below)

- Automated daily backup scripts
- Backup monitoring and alerting
- Automated recovery scripts
- Disaster recovery orchestration

### Critical Data to Backup

- PostgreSQL database (requests, responses, conversations)
- Credential files (API keys, OAuth tokens)
- Configuration files (.env, custom configs)
- Docker volumes (if using Docker)

## Available Backup Tools

### Database Backup Utility

The project includes a TypeScript-based database backup utility that provides:

- Full database backups to SQL files or backup databases
- Time-based filtering for recent data
- Secure implementation without shell injection risks

#### Usage Examples

```bash
# Create a backup database with timestamp
bun run scripts/db/backup-database.ts

# Create backup with custom name
bun run scripts/db/backup-database.ts --name=backup_prod_20240120

# Export to SQL file
bun run scripts/db/backup-database.ts --file
bun run scripts/db/backup-database.ts --file=backup.sql

# Backup recent data only
bun run scripts/db/backup-database.ts --since="1 day"
bun run scripts/db/backup-database.ts --since="2024-01-01" --file
```

### Copy Conversation Utility

For selective data migration:

```bash
# Copy specific conversation to another database
bun run scripts/copy-conversation.ts \
  --conversation-id=123e4567-e89b-12d3-a456-426614174000 \
  --dest-db="postgresql://user:pass@backup-server:5432/backup_db"

# Dry run to preview
bun run scripts/copy-conversation.ts \
  --conversation-id=123e4567-e89b-12d3-a456-426614174000 \
  --dest-db="postgresql://backup-db-url" \
  --dry-run
```

See [Copy Conversation Documentation](./utilities/copy-conversation.md) for details.

## Manual Backup Commands

### Direct PostgreSQL Commands

```bash
# Direct PostgreSQL backup
pg_dump -h localhost -U postgres -d claude_nexus > backup-$(date +%Y%m%d-%H%M%S).sql

# Docker environment backup
docker compose exec -T postgres pg_dump -U postgres claude_nexus > backup-$(date +%Y%m%d-%H%M%S).sql

# Compressed backup
docker compose exec -T postgres pg_dump -U postgres claude_nexus | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

## Implementation Templates

> **Note**: The following sections provide shell script templates for implementing comprehensive backup strategies. These scripts are examples that you can adapt to your specific environment and requirements.

### Automated Daily Backup Template

Create a backup script based on this template:

```bash
#!/bin/bash
# backup-daily.sh - Template for automated daily backups

BACKUP_DIR="/backups/daily"
RETENTION_DAYS=7
DB_NAME="claude_nexus"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database using the TypeScript utility
echo "Starting database backup..."
bun run scripts/db/backup-database.ts --file=$BACKUP_DIR/db-$TIMESTAMP.sql
gzip $BACKUP_DIR/db-$TIMESTAMP.sql

# Backup credentials (ensure encryption!)
echo "Backing up credentials..."
tar -czf - ./credentials/ | openssl enc -aes-256-cbc -salt -out $BACKUP_DIR/credentials-$TIMESTAMP.tar.gz.enc

# Backup configuration
echo "Backing up configuration..."
cp .env $BACKUP_DIR/env-$TIMESTAMP

# Remove old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_DIR/*-$TIMESTAMP.*"
```

Schedule with cron:

```bash
# Add to crontab
0 2 * * * /path/to/backup-daily.sh >> /var/log/claude-backup.log 2>&1
```

### PostgreSQL WAL Configuration

For point-in-time recovery, configure PostgreSQL's Write-Ahead Logging:

```bash
# postgresql.conf example settings
archive_mode = on
archive_command = 'cp %p /backup/wal/%f'
wal_level = replica
```

> **Note**: This requires PostgreSQL server configuration access and additional setup.

### Credential Security

**⚠️ IMPORTANT**: Never store credentials in plain text backups. Always encrypt sensitive data.

#### Secure Credential Backup Template

```bash
#!/bin/bash
# secure-backup-credentials.sh - Template for encrypted credential backup

BACKUP_FILE="credentials-backup-$(date +%Y%m%d).tar.gz.enc"

# Create encrypted backup
tar -czf - credentials/ | openssl enc -aes-256-cbc -salt -out $BACKUP_FILE

# Store encryption key separately
echo "Backup created: $BACKUP_FILE"
echo "⚠️  Store encryption password in a secure password manager!"
```

#### Version Control for Credentials (Local Only)

```bash
# NEVER push credentials to remote repositories
cd credentials/
git init
echo "*.credentials.json" >> .gitignore
echo "*.enc" >> .gitignore
git add .gitignore
git commit -m "Initial commit - gitignore only"

# Track changes locally
git add -A
git commit -m "Updated credentials $(date)"
```

### Configuration Backup Template

```bash
#!/bin/bash
# backup-config.sh - Template for configuration backup

CONFIG_BACKUP_DIR="/backups/config"
mkdir -p $CONFIG_BACKUP_DIR

# Backup files
cp .env $CONFIG_BACKUP_DIR/.env.$(date +%Y%m%d)
cp docker-compose.yml $CONFIG_BACKUP_DIR/
cp -r docker/ $CONFIG_BACKUP_DIR/

# Create manifest
cat > $CONFIG_BACKUP_DIR/manifest.txt << EOF
Backup Date: $(date)
Environment: $(hostname)
Services: proxy, dashboard
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "not in git repo")
EOF
```

## Backup Storage

### Local Storage

```bash
# Dedicated backup directory structure
/backups/
├── daily/           # Daily automated backups
├── weekly/          # Weekly full backups
├── monthly/         # Monthly archives
├── credentials/     # Encrypted credential backups
└── config/         # Configuration backups
```

### Remote Storage

#### S3 Backup

```bash
#!/bin/bash
# Upload to S3
aws s3 cp $BACKUP_FILE s3://your-bucket/claude-nexus/backups/
aws s3 ls s3://your-bucket/claude-nexus/backups/
```

#### rsync to Remote Server

```bash
# Sync backups to remote server
rsync -avz --delete /backups/ user@backup-server:/remote/backups/claude-nexus/
```

## Recovery Procedures

### Database Recovery

#### Full Recovery from TypeScript Backup

```bash
# If you created a backup database
# 1. Stop services
docker compose down

# 2. Connect to the backup database
export DATABASE_URL="postgresql://user:pass@localhost:5432/claude_nexus_backup_20240120_143022"

# 3. Or restore from SQL file
gunzip -c claude_nexus_backup_20240120_143022.sql.gz | \
  docker compose exec -T postgres psql -U postgres claude_nexus

# 4. Restart services
docker compose up -d
```

#### Selective Recovery

Use the copy-conversation utility for selective data recovery:

```bash
# Copy specific conversations from backup
bun run scripts/copy-conversation.ts \
  --conversation-id=<uuid> \
  --dest-db="$DATABASE_URL"
```

#### Manual Recovery Commands

```bash
# Extract specific tables
pg_restore -t api_requests -d claude_nexus backup.sql

# Export specific time range
psql claude_nexus -c "
  COPY (
    SELECT * FROM api_requests
    WHERE created_at BETWEEN '2024-01-01' AND '2024-01-02'
  ) TO '/tmp/partial_backup.csv' CSV HEADER;
"
```

### Credential Recovery

```bash
# Decrypt credential backup (you'll be prompted for password)
openssl enc -d -aes-256-cbc -in credentials-backup-20240101.tar.gz.enc | tar -xzf -

# Restore to credentials directory
cp -i credentials/*.json ./credentials/

# Verify permissions
chmod 600 ./credentials/*.json

# Verify structure
ls -la ./credentials/
```

### Point-in-Time Recovery (Advanced)

> **Note**: This is an advanced PostgreSQL feature requiring WAL archiving setup.

```bash
# Example PITR process (requires WAL archives)
# 1. Stop PostgreSQL and restore base backup
# 2. Configure recovery parameters
# 3. PostgreSQL will replay WAL files to target time

# See PostgreSQL documentation for complete PITR setup:
# https://www.postgresql.org/docs/current/continuous-archiving.html
```

## Disaster Recovery Guidelines

### Recovery Objectives

- **RTO** (Recovery Time Objective): Target based on your SLA
- **RPO** (Recovery Point Objective): Depends on backup frequency

### Basic Recovery Steps

1. **Assess the Situation**
   - Check service health: `docker compose ps`
   - Check database connectivity: `psql $DATABASE_URL -c "SELECT 1"`
   - Review logs: `docker compose logs --tail=100`

2. **Identify Recovery Path**

   ```
   Is database accessible?
   ├── Yes: Check service configuration
   └── No:
       ├── Recent backup available?
       │   ├── Yes: Restore from backup
       │   └── No: Check for WAL/transaction logs
       └── Credentials intact?
           ├── Yes: Continue recovery
           └── No: Restore encrypted credentials
   ```

3. **Execute Recovery**

   ```bash
   # Stop services
   docker compose down

   # Restore database from latest backup
   bun run scripts/db/backup-database.ts --file=latest_backup.sql
   gunzip -c latest_backup.sql.gz | psql $DATABASE_URL

   # Restore credentials if needed
   # (decrypt from secure backup)

   # Restart services
   docker compose up -d

   # Verify
   docker compose ps
   curl http://localhost:3000/health
   ```

### Recovery Automation Templates

> **Note**: These are templates for creating your own automated recovery scripts.

#### Health Check Template

```bash
#!/bin/bash
# health-check.sh - Template for service health monitoring

SERVICES=("proxy" "dashboard" "postgres")
FAILED=0

for service in "${SERVICES[@]}"; do
    if ! docker compose ps | grep -q "$service.*Up"; then
        echo "❌ $service is down"
        FAILED=$((FAILED + 1))
    else
        echo "✅ $service is running"
    fi
done

if [ $FAILED -gt 0 ]; then
    echo "⚠️  $FAILED services need attention"
    exit 1
fi
```

## Testing Your Backups

### Testing Database Backups

```bash
# Create a test backup
bun run scripts/db/backup-database.ts --name=test_backup

# Verify backup was created
psql $DATABASE_URL -c "SELECT datname FROM pg_database WHERE datname LIKE '%test_backup%'"

# Test restoration to a new database
export TEST_DB_URL="postgresql://user:pass@localhost:5432/claude_nexus_test"
bun run scripts/db/backup-database.ts --file=test_backup.sql
psql $TEST_DB_URL < test_backup.sql

# Verify data
psql $TEST_DB_URL -c "SELECT COUNT(*) FROM api_requests"

# Cleanup
psql $DATABASE_URL -c "DROP DATABASE IF EXISTS claude_nexus_test"
```

### Recovery Testing Template

```bash
#!/bin/bash
# test-recovery.sh - Template for testing recovery procedures

# Test backup creation
echo "Testing backup creation..."
bun run scripts/db/backup-database.ts --file=test_backup.sql

if [ -f test_backup.sql ]; then
    echo "✅ Backup created successfully"
    # Test file size
    SIZE=$(stat -f%z test_backup.sql 2>/dev/null || stat -c%s test_backup.sql)
    echo "📊 Backup size: $((SIZE / 1024 / 1024)) MB"
else
    echo "❌ Backup creation failed"
    exit 1
fi

# Cleanup
rm -f test_backup.sql
```

### Recommended Testing Schedule

1. **Weekly**: Verify backup script execution
2. **Monthly**: Test restoration to development environment
3. **Quarterly**: Full disaster recovery drill
4. **Annually**: Review and update recovery procedures

## Backup Monitoring Templates

### Backup History Tracking

> **Note**: If you want to track backup history in the database, you can create this table:

```sql
-- Optional: Track backup history
CREATE TABLE IF NOT EXISTS backup_history (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(50),
    backup_path TEXT,
    size_bytes BIGINT,
    duration_seconds INTEGER,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Monitoring Script Template

```bash
#!/bin/bash
# monitor-backups.sh - Template for backup monitoring

# Check for recent backups
BACKUP_DIR="/backups/daily"
MAX_AGE_HOURS=26  # Alert if no backup in 26 hours

# Find backups created in the last MAX_AGE_HOURS
RECENT_BACKUPS=$(find $BACKUP_DIR -name "*.sql.gz" -mmin -$((MAX_AGE_HOURS * 60)) 2>/dev/null | wc -l)

if [ $RECENT_BACKUPS -eq 0 ]; then
    echo "⚠️  WARNING: No backups found in the last $MAX_AGE_HOURS hours!"

    # Send alert (implement your notification method)
    # Example with Slack webhook:
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST $SLACK_WEBHOOK_URL \
            -H 'Content-type: application/json' \
            -d '{"text":"⚠️ Claude Nexus: No recent backups found!"}'
    fi
else
    echo "✅ Found $RECENT_BACKUPS recent backup(s)"
fi
```

## Best Practices

1. **3-2-1 Rule**
   - 3 copies of data
   - 2 different storage media
   - 1 offsite backup

2. **Regular Testing**
   - Test recovery monthly
   - Document recovery times
   - Update procedures based on tests

3. **Security**
   - Encrypt sensitive backups
   - Restrict backup access
   - Audit backup access logs

4. **Documentation**
   - Keep recovery runbooks updated
   - Document environment-specific details
   - Train team on procedures

## Recovery Checklist

- [ ] Identify failure type and scope
- [ ] Notify stakeholders
- [ ] Locate appropriate backups
- [ ] Prepare recovery environment
- [ ] Execute recovery procedure
- [ ] Verify data integrity
- [ ] Test service functionality
- [ ] Document lessons learned
- [ ] Update recovery procedures based on experience

## Next Steps

### Immediate Actions

1. **Test the backup utility**: Run `bun run scripts/db/backup-database.ts --help`
2. **Create your first backup**: Use the TypeScript utility to create a backup
3. **Set up automated backups**: Adapt the templates above for your environment
4. **Test recovery**: Practice restoring from backup in a test environment

### Related Documentation

- [Copy Conversation Utility](./utilities/copy-conversation.md) - For selective data migration
- [Security Best Practices](./security.md) - Secure your backups
- [Monitoring Setup](./monitoring.md) - Monitor backup health
- [Database Schema](../04-Architecture/internals.md#database-schema) - Understand data structure
