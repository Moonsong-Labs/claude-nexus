# ADR-054: Monitoring Documentation Refactoring

## Status

Accepted

## Context

The monitoring documentation (`docs/03-Operations/monitoring.md`) contained significant inaccuracies and references to unimplemented features. As part of the file grooming sprint, this documentation needed to be updated to reflect the actual system implementation.

### Issues Identified

1. **Outdated Information**
   - Referenced `docker-compose` commands instead of `docker-up.sh`
   - Contained outdated Claude model pricing (Claude 3 models)
   - Listed incorrect API endpoints

2. **Unimplemented Features**
   - Prometheus integration with detailed code examples
   - Grafana dashboard configuration
   - External monitoring services (UptimeRobot)
   - Filebeat log shipping configuration

3. **Missing Features**
   - AI analysis job monitoring
   - MCP server health checks
   - Actual utility scripts for monitoring

4. **Code Quality Issues**
   - Mixed JavaScript and TypeScript examples
   - Verbose inline code examples instead of references
   - Implementation details rather than operational guidance

## Decision

Refactor the monitoring documentation to:

1. Remove all unimplemented features
2. Update to reflect current implementation
3. Add documentation for actual monitoring features
4. Focus on operational guidance rather than implementation details
5. Reference actual code and scripts where appropriate

## Consequences

### Positive

- **Accuracy**: Documentation now reflects actual system capabilities
- **Clarity**: Concise operational guidance without verbose code examples
- **Maintainability**: References to actual endpoints and scripts that can be verified
- **Completeness**: Includes all implemented monitoring features (AI analysis, MCP, etc.)
- **Usability**: Clear commands and examples that actually work

### Negative

- **Feature Reduction**: Removed potentially useful future features (Prometheus/Grafana)
- **Less Detail**: Removed inline code examples in favor of references

### Neutral

- **Scope Change**: Shifted from aspirational documentation to current-state documentation

## Implementation Details

The refactoring included:

1. **Structure Improvements**
   - Added last updated timestamp
   - Reorganized sections for better flow
   - Grouped related monitoring features

2. **Content Updates**
   - Corrected all API endpoints
   - Updated docker commands to use `docker-up.sh`
   - Added AI analysis monitoring section
   - Added MCP server monitoring section
   - Simplified SQL queries for practical use

3. **Removed Sections**
   - Prometheus integration (not implemented)
   - Grafana dashboards (not implemented)
   - External monitoring services (not configured)
   - Verbose JavaScript implementation examples

4. **Added Sections**
   - AI Analysis Monitoring with actual scripts
   - MCP Server Monitoring
   - Practical log analysis commands
   - Clear monitoring best practices

## References

- Original discussion on documentation accuracy from grooming sprint
- Related ADR-022: Documentation Strategy
- Claude Nexus Proxy monitoring implementation in `services/proxy/src/routes/api.ts`
