# Operational Scripts

This document provides an overview of the operational scripts used to manage Claude Nexus Proxy deployments.

## Prerequisites

- **AWS CLI**: Installed and configured with appropriate credentials
- **SSH Access**: SSH key access to EC2 instances as `ubuntu` user
- **Docker**: Installed on target servers
- **Git**: Repository cloned at `~/claude-nexus-proxy` on each server
- **Environment Files**:
  - `.env` file located at `~/.env` (user's home directory)
  - `credentials` directory at `~/credentials` (if using credential files)

## Available Scripts

### manage-nexus-proxies.sh

Manages Claude Nexus Proxy Docker containers across EC2 instances tagged with "Nexus Proxy" in their name.

**Key Features:**

- Automatic EC2 instance discovery using AWS tags
- Environment-based filtering (production/staging)
- Automatic git pull before updates
- Parallel execution across multiple servers
- Color-coded output for better visibility

**Common Workflows:**

```bash
# Check status on all servers
./manage-nexus-proxies.sh status

# Deploy to production servers
./manage-nexus-proxies.sh --env prod up

# Stop staging servers
./manage-nexus-proxies.sh --env staging down

# Update specific server
./manage-nexus-proxies.sh up server-name
```

For detailed command options, run:

```bash
./manage-nexus-proxies.sh --help
```

### update-proxy.sh

Updates Claude Nexus Proxy Docker containers to specific versions with rollback support and health checks.

**Usage:**

```bash
./update-proxy.sh <version> [service]
```

**Arguments:**

- `version` - Docker image tag (e.g., v8, latest)
- `service` - Optional: 'proxy' or 'dashboard' (default: both)

**Common Workflows:**

```bash
# Update both services to latest version
./update-proxy.sh latest

# Update only proxy service to specific version
./update-proxy.sh v8 proxy

# Update only dashboard to specific version
./update-proxy.sh v9 dashboard
```

## AWS Infrastructure Requirements

EC2 instances must be tagged appropriately for the `manage-nexus-proxies.sh` script:

1. **Name Tag** (Required): Must contain "Nexus Proxy"
2. **env Tag** (Optional): Should be "prod" or "staging" for environment filtering

Example tags:

```
Name: "Nexus Proxy Server 1"
env: "prod"
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to EC2 instances

- Verify AWS CLI credentials: `aws sts get-caller-identity`
- Check EC2 instance tags: `aws ec2 describe-instances --filters "Name=tag:Name,Values=*Nexus Proxy*"`
- Ensure SSH key permissions: `chmod 600 ~/.ssh/your-key.pem`

### Docker Issues

**Problem**: Container fails to start

- Check Docker service: `ssh ubuntu@server "sudo systemctl status docker"`
- Verify `.env` file exists: `ssh ubuntu@server "ls -la ~/.env"`
- Check container logs: `ssh ubuntu@server "docker logs claude-nexus-proxy"`

### Git Issues

**Problem**: Git pull fails during update

- Verify git credentials are configured on server
- Check for uncommitted changes: `ssh ubuntu@server "cd ~/claude-nexus-proxy && git status"`
- Ensure origin/main branch exists and is accessible

## Security Considerations

- Scripts use `StrictHostKeyChecking=no` for automation - ensure this aligns with your security policies
- AWS CLI should have minimal required permissions (ec2:DescribeInstances)
- Regularly rotate SSH keys and AWS credentials
- Consider using AWS Systems Manager Session Manager for enhanced security

## Related Documentation

- [AWS Infrastructure Setup](./aws-infrastructure.md)
- [Docker Deployment Guide](./docker.md)
- [Docker Compose Environment](./docker-compose.md)
