# ADR-021: Credential Example Templates

## Status

Accepted

## Context

The project provides example credential files that users copy and modify for their domains. The original `example.com.credentials.json` file had several issues:

- Contained misleading placeholder tokens ("sk-ant-...") that looked like real sensitive data
- Missing the required `client_api_key` field documented in README
- Inconsistent Slack configuration (enabled=true with empty webhook_url)
- Lacked clear indicators that values should be replaced

## Decision

We will:

1. Convert example files to proper templates with clear placeholder values
2. Provide separate examples for both authentication types (OAuth and API key)
3. Use descriptive placeholders like "YOUR-CLAUDE-API-KEY-HERE"
4. Ensure consistency between enabled flags and required values
5. Include all required fields as documented

## Consequences

### Positive

- Improved security by removing sensitive-looking placeholder data
- Reduced user configuration errors through clear placeholders
- Better onboarding experience for new users
- Consistency between documentation and example files

### Negative

- Users with existing setups need to be aware of the new examples
- Two example files instead of one (minor increase in maintenance)

## Implementation

- Updated `example.com.credentials.json` for OAuth authentication
- Created `example-api-key.com.credentials.json` for API key authentication
- Updated credentials/README.md to reference both examples
- All placeholders now clearly indicate what should be replaced
