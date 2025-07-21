# AWS Infrastructure Deployment

This guide covers deploying Claude Nexus Proxy on AWS EC2 instances using the provided operational scripts.

## Overview

The Claude Nexus Proxy can be deployed across multiple AWS EC2 instances, with support for environment-based filtering (production/staging) using the `manage-nexus-proxies.sh` script.

## EC2 Instance Requirements

### Minimum Specifications

- **OS**: Ubuntu 22.04 LTS or later
- **Instance Type**: t3.medium or larger (2 vCPU, 4GB RAM minimum)
- **Storage**: 20GB EBS volume
- **Security Groups**:
  - Inbound: SSH (22), Proxy API (3000), Dashboard (3001)
  - Outbound: All traffic (required for Claude API and GitHub access)

### Required Directory Structure

Each EC2 instance must have the following setup:

```
/home/ubuntu/
├── .env                          # Environment configuration
├── claude-nexus-proxy/           # Git repository
│   └── scripts/ops/              # Operational scripts
├── credentials/                  # Domain credential files
│   ├── domain1.com.credentials.json
│   └── domain2.com.credentials.json
```

### AWS Tagging Requirements

The `manage-nexus-proxies.sh` script uses AWS tags to identify and filter instances:

1. **Name Tag** (Required)
   - Must contain "Nexus Proxy" (case-insensitive)
   - Example: `"Nexus Proxy Production Server 1"`

2. **env Tag** (Optional - for environment filtering)
   - Values: `prod` or `staging`
   - Used with `--env` flag to target specific environments

## Instance Preparation

### Manual Setup Steps

1. **Launch EC2 Instance**
   - Use Ubuntu 22.04 LTS AMI
   - Select appropriate instance type (t3.medium or larger)
   - Configure security groups as specified above
   - Add required tags

2. **Initial Server Configuration**

   ```bash
   # SSH into the instance
   ssh -i your-key.pem ubuntu@your-instance-ip

   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Docker
   curl -fsSL https://get.docker.com | bash
   sudo usermod -aG docker ubuntu

   # Install Git
   sudo apt install -y git

   # Clone the repository
   git clone <your-repository-url> /home/ubuntu/claude-nexus-proxy

   # Create credentials directory
   mkdir -p /home/ubuntu/credentials
   ```

3. **Configure Environment**
   - Copy your `.env` file to `/home/ubuntu/.env`
   - Add credential files to `/home/ubuntu/credentials/`
   - Ensure proper permissions are set

## Managing Deployments

### Using manage-nexus-proxies.sh

The primary tool for managing EC2 deployments is the `manage-nexus-proxies.sh` script. It supports the following operations:

```bash
# Check status of all Nexus Proxy servers
./scripts/ops/manage-nexus-proxies.sh status

# Update/deploy to all servers
./scripts/ops/manage-nexus-proxies.sh up

# Stop containers on all servers
./scripts/ops/manage-nexus-proxies.sh down

# Execute commands on all servers
./scripts/ops/manage-nexus-proxies.sh exec "docker ps"
```

### Environment Filtering

Use the `--env` flag to target specific environments:

```bash
# Target only production servers
./scripts/ops/manage-nexus-proxies.sh --env prod status

# Update staging servers only
./scripts/ops/manage-nexus-proxies.sh --env staging up

# Stop staging for maintenance
./scripts/ops/manage-nexus-proxies.sh --env staging down
```

### Targeting Specific Servers

You can target a specific server by name:

```bash
# Update a specific server
./scripts/ops/manage-nexus-proxies.sh up "Nexus Proxy Production 1"

# Check status of specific server with environment filter
./scripts/ops/manage-nexus-proxies.sh --env prod status "Nexus Proxy Production 1"
```

## Deployment Best Practices

### 1. Environment Separation

Maintain clear separation between environments:

- **Production**: Use separate database, credentials, and monitoring
- **Staging**: Mirror production setup but with lower resources
- **Credentials**: Never share API keys between environments

### 2. Rolling Updates

For production deployments, update servers one at a time:

```bash
# Example: Update each production server with delay
for server in "Nexus Proxy Production 1" "Nexus Proxy Production 2"; do
  ./scripts/ops/manage-nexus-proxies.sh --env prod up "$server"
  echo "Waiting 30 seconds before next update..."
  sleep 30
done
```

### 3. Health Checks

After deployment, verify services are running:

```bash
# Check container status
./scripts/ops/manage-nexus-proxies.sh exec "docker ps"

# Test proxy endpoint (from local machine)
curl -I http://your-server-ip:3000/health
```

## Configuration Examples

### Environment Variables

Each environment should have its own `.env` configuration:

**Production Example:**

```bash
DATABASE_URL=postgresql://prod-host:5432/claude_nexus
STORAGE_ENABLED=true
DEBUG=false
SLACK_WEBHOOK_URL=https://hooks.slack.com/prod-webhook
DASHBOARD_CACHE_TTL=300
```

**Staging Example:**

```bash
DATABASE_URL=postgresql://staging-host:5432/claude_nexus_staging
STORAGE_ENABLED=true
DEBUG=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/staging-webhook
DASHBOARD_CACHE_TTL=60
```

## AWS Permissions

### Required IAM Permissions

The user or role running the management script needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ec2:DescribeInstances", "ec2:DescribeTags"],
      "Resource": "*"
    }
  ]
}
```

### Security Best Practices

1. **SSH Key Management**
   - Use dedicated SSH keys per environment
   - Rotate keys regularly
   - Never commit keys to version control

2. **Network Security**
   - Restrict SSH access to known IPs
   - Use VPC security groups effectively
   - Consider bastion hosts for production

3. **Credential Protection**
   - Encrypt credential files at rest
   - Use AWS Secrets Manager for sensitive data
   - Implement least-privilege access

## Troubleshooting

### Common Issues

1. **Script Cannot Find Instances**
   - Verify Name tag contains "Nexus Proxy"
   - Check AWS CLI configuration and permissions
   - Ensure instances are in the correct region

2. **SSH Connection Failures**
   - Verify security group allows SSH from your IP
   - Check SSH key permissions (600)
   - Ensure instance is running

3. **Docker Container Issues**
   - Check Docker daemon is running: `sudo systemctl status docker`
   - Verify .env file exists and is readable
   - Check credential files are present

### Debug Commands

```bash
# List all EC2 instances with tags
aws ec2 describe-instances --query "Reservations[].Instances[].[InstanceId,State.Name,Tags]"

# Test SSH connectivity
ssh -v -i your-key.pem ubuntu@instance-ip

# Check Docker logs
./scripts/ops/manage-nexus-proxies.sh exec "docker logs claude-nexus-proxy"
```

## Monitoring and Maintenance

### Health Monitoring

Set up basic monitoring for your instances:

```bash
# Create a simple health check script
cat > /home/ubuntu/health-check.sh << 'EOF'
#!/bin/bash
curl -f http://localhost:3000/health || exit 1
curl -f http://localhost:3001/health || exit 1
EOF

chmod +x /home/ubuntu/health-check.sh
```

### Log Management

Configure log rotation for Docker containers:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

## Related Documentation

- [Operational Scripts Guide](./ops-scripts.md) - Detailed documentation for all operational scripts
- [Docker Deployment](./docker.md) - Container-based deployment options
- [Monitoring Setup](../monitoring.md) - Configure monitoring and alerts
