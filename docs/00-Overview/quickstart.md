# Quick Start - Essential Commands Only

## ⚠️ CRITICAL SECURITY WARNING

**NEVER deploy without `DASHBOARD_API_KEY` set in .env** - Dashboard has NO authentication without it!

## 1. Essential Credential Setup

**Non-intuitive OAuth credential pattern:**

```bash
# OAuth credentials require specific structure with accountId
cat > credentials/localhost:3000.credentials.json << 'EOF'
{
  "type": "oauth",
  "accountId": "acc_unique_identifier",
  "oauth": {
    "accessToken": "sk-ant-oat01-YOUR-TOKEN",
    "refreshToken": "",
    "expiresAt": 1234567890000,
    "scopes": ["user:inference", "user:profile"],
    "isMax": true
  }
}
EOF

# Create symlink to avoid credential duplication (non-obvious pattern)
ln -sf ../client-setup/.credentials.json credentials/proxy:3000.credentials.json
```

## 2. Multi-Profile Docker Setup

**Critical non-intuitive docker compose profile usage:**

```bash
# Use specific profiles to avoid unnecessary services
docker compose --profile dev --profile claude up -d
```

## 3. Essential Monitoring

- **Dashboard**: http://localhost:3001 ⚠️ **REQUIRES DASHBOARD_API_KEY**
- **Disable client auth workaround**: `ENABLE_CLIENT_AUTH=false` in docker-compose.override.yml
