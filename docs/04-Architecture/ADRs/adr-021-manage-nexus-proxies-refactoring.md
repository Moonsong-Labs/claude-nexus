# ADR-021: Refactoring manage-nexus-proxies.sh Script

## Status

Accepted

## Context

The `manage-nexus-proxies.sh` script is a critical operational tool for managing Claude Nexus Proxy Docker containers across AWS EC2 instances. During the grooming sprint, several code quality issues were identified that needed addressing to ensure the script remains maintainable and production-ready.

## Decision

We decided to perform a comprehensive refactoring of the script to address the following issues:

1. **Code Duplication**: Merged `execute_on_server` and `execute_on_server_async` functions
2. **Complex Argument Parsing**: Simplified using structured approach
3. **Configuration Management**: Extracted constants and added environment variable support
4. **Error Handling**: Added retry logic and proper error codes
5. **Security**: Documented SSH key checking implications and made it configurable
6. **Output Consistency**: Created dedicated logging functions
7. **Documentation**: Enhanced with detailed header comments and function descriptions

## Consequences

### Positive

- **Improved Maintainability**: Eliminated ~150 lines of duplicate code
- **Better Reliability**: Added retry logic for transient SSH failures
- **Enhanced Security**: Made SSH host key checking configurable via environment variable
- **Clearer Error Messages**: Consistent error reporting with proper exit codes
- **Configuration Flexibility**: Support for environment variables (SSH_TIMEOUT, SSH_USER, RETRY_ATTEMPTS, etc.)
- **Better Documentation**: Clear usage examples and requirements in header comments

### Negative

- **Backward Compatibility**: None - the command-line interface remains unchanged
- **Testing Required**: Operational scripts require careful testing in staging before production use

## Implementation Details

### Key Changes

1. **Unified Execute Function**: Single `execute_on_server` function with async flag
2. **SSH Retry Logic**: Configurable retry attempts with exponential backoff
3. **Environment Variables**:
   - `SSH_TIMEOUT`: Connection timeout (default: 10s)
   - `SSH_USER`: SSH username (default: ubuntu)
   - `RETRY_ATTEMPTS`: Number of retry attempts (default: 3)
   - `RETRY_DELAY`: Delay between retries (default: 5s)
   - `STRICT_HOST_KEY_CHECK`: SSH host key checking (default: no)
4. **Structured Output**: log_info, log_success, log_warning, log_error functions
5. **Better Error Handling**: Proper exit codes and error messages throughout

### Security Note

The script uses `StrictHostKeyChecking=no` by default for dynamic EC2 instances. This can be overridden by setting `STRICT_HOST_KEY_CHECK=yes`, but requires proper known_hosts management.

## References

- Original grooming task from file-grooming-07-18 branch
- Gemini 2.5 Pro validation with 9/10 confidence score for full refactoring
