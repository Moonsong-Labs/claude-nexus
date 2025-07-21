# ADR-021: Environment Variables Documentation Refactoring

**Status**: Accepted  
**Date**: 2025-01-21  
**Deciders**: Engineering Team

## Context

The environment variables documentation (`docs/06-Reference/environment-vars.md`) had become outdated and incomplete, missing many variables that were added to the codebase over time. This created confusion for developers and operators deploying the system.

## Problem Statement

1. **Missing Variables**: Over 50 environment variables used in the codebase were not documented
2. **Incorrect Information**: Several documented variables had wrong default values or descriptions
3. **Poor Organization**: Variables were not logically grouped, making it hard to find related settings
4. **Inconsistent Format**: Different sections used different table formats
5. **Redundant Content**: Large example configurations that belonged in deployment documentation

## Decision

We decided to completely refactor the environment variables documentation to:

1. **Add all missing variables** from `packages/shared/src/config/index.ts`
2. **Reorganize sections** to match the logical groupings in the codebase
3. **Standardize format** with consistent table structure throughout
4. **Focus on reference** by removing redundant examples and configurations
5. **Add new categories** for Rate Limiting, Circuit Breaker, Request Validation, etc.

## Consequences

### Positive

- **Single source of truth** for all environment variables
- **Improved discoverability** through better organization
- **Reduced deployment errors** from missing or misconfigured variables
- **Easier onboarding** for new developers
- **Consistent format** makes scanning and finding variables easier

### Negative

- **Maintenance burden**: Documentation must be updated when new variables are added
- **Risk of drift**: Without automation, documentation may become outdated again

## Implementation Details

### Changes Made

1. **Added 50+ missing variables** including:
   - Server configuration (PORT, HOST, NODE_ENV)
   - Rate limiting settings
   - Circuit breaker configuration
   - Request validation limits
   - Cache settings
   - Feature flags

2. **Reorganized into logical sections**:
   - Essential Configuration
   - Server Configuration
   - Claude API Configuration
   - Storage & Database
   - Authentication & Security
   - Rate Limiting
   - Circuit Breaker
   - Request Validation
   - Logging & Debugging
   - Caching
   - Integrations (Slack, Spark, Telemetry)
   - AI Analysis Configuration
   - MCP Server
   - Feature Flags

3. **Standardized table format**:

   ```markdown
   | Variable | Description | Default | Required |
   | -------- | ----------- | ------- | -------- |
   ```

4. **Removed redundant content**:
   - Removed environment-specific example configurations
   - Removed verbose Docker and validation examples
   - Simplified to a minimal quick start example

### Future Improvements

1. **Automation**: Consider generating documentation from code comments
2. **Validation**: Add CI check to ensure all env vars are documented
3. **PR Template**: Add reminder to update env var documentation
