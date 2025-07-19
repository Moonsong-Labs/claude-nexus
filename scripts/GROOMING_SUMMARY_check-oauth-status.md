# Grooming Summary: check-oauth-status.ts

## File: scripts/auth/check-oauth-status.ts

### Purpose

CLI utility script to check OAuth credential status, including token expiry times and provide warnings about expired tokens.

### Changes Made

#### 1. Added Type Safety

- Imported `ClaudeCredentials` type from the credentials module
- Ensures type safety when accessing credential properties

#### 2. Extracted Constants

- `EXIT_SUCCESS` and `EXIT_ERROR` for consistent exit codes
- `TOKEN_PREVIEW_LENGTH` for token display length
- `HOUR_IN_MS` and `MINUTE_IN_MS` for time calculations
- ANSI color codes for better visual feedback
- Error messages in a constant object for consistency

#### 3. Improved Error Handling

- Consistent error messages with color coding
- File existence check before attempting to load
- Proper exit codes (0 for success, 1 for error)
- Better error messages for different failure scenarios

#### 4. Added Utility Functions

- `formatToken()`: Safely formats tokens for display
- `formatDuration()`: Converts milliseconds to human-readable format
- `printUsage()`: Centralizes usage information

#### 5. Enhanced User Experience

- Color-coded output (red for errors, yellow for warnings, green for success, blue for labels)
- Unicode icons for better visual feedback (⚠️, ❌, ℹ️, ✓)
- More informative status messages
- Clearer formatting of credential information

#### 6. Code Organization

- Added JSDoc comments for main functions
- Organized code into logical sections
- Improved readability with better variable names
- Async function returns proper exit code

### Rationale

These changes align the script with the better patterns found in other auth scripts like `generate-api-key.ts`, making the codebase more consistent and maintainable. The improvements focus on:

- Production readiness through better error handling
- User experience through color-coded output
- Maintainability through type safety and constants
- Code quality through proper documentation

### Testing

- Tested with no arguments (shows error message)
- Tested with example OAuth credentials (shows expired status with refresh token)
- Tested with API key credentials (shows API key info)
- Tested with non-existent file (shows file not found error)
- All tests passed successfully with proper exit codes

### Decision: No CLI Library

Following the advice from both Gemini and O3, I chose not to add a CLI parsing library (like commander.js) as the script only takes a single argument. This keeps the script simple and avoids unnecessary dependencies for a utility that works well with basic argument parsing.

### No ADR Required

These changes are purely code quality improvements without architectural impact. The script's interface and functionality remain the same, only the implementation quality has been improved.
