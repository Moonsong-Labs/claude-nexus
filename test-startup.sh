#!/bin/bash

# Test startup output with different configurations

echo "=== Test 1: Passthrough mode with domain mappings ==="
PROXY_MODE=passthrough \
DOMAIN_CREDENTIAL_MAPPING='{"claude-1.example.com":"~/.claude/team1.json","claude-2.example.com":"~/.claude/team2.json","api.myapp.com":"/etc/claude/api.json"}' \
TELEMETRY_ENDPOINT="https://metrics.example.com/api/events" \
timeout 2 bun run start 2>&1 | head -n 20

echo -e "\n\n=== Test 2: Translation mode with models ==="
PROXY_MODE=translation \
ANTHROPIC_PROXY_BASE_URL="https://openrouter.ai/api/v1" \
REASONING_MODEL="deepseek/deepseek-r1" \
COMPLETION_MODEL="gpt-4-turbo" \
timeout 2 bun run start 2>&1 | head -n 20

echo -e "\n\n=== Test 3: Default mode ==="
timeout 2 bun run start 2>&1 | head -n 10