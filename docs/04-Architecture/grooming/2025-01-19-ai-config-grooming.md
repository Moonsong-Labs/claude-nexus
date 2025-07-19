# AI Configuration Grooming

Date: 2025-01-19
File: `packages/shared/src/config/index.ts` (AI Analysis section)

## Summary

Groomed the AI analysis configuration within the centralized config module to improve documentation, deprecation warnings, and code clarity.

## Context

The original file `packages/shared/src/config/ai-analysis.ts` was already consolidated into the main config file on 2025-01-19. This grooming task focused on improving the AI analysis portion of the centralized configuration.

## Changes Made

### 1. Added Deprecation Warnings

- Added JSDoc `@deprecated` annotations to all legacy exports
- Included deprecation date and recommended alternatives
- This follows TypeScript best practices for backward compatibility

### 2. Improved Documentation

- Enhanced inline comments for token limits and safety margins
- Clarified the purpose of the 0.95 safety margin (5% buffer)
- Added context about Gemini 2.0's 1M context window
- Documented the token calculation logic more clearly

### 3. Fixed Documentation Reference

- Updated ADR-018 reference comment to be more precise
- Changed "Note: ADR-018 mentions 3 retries" to "Per ADR-018: 3 retries with exponential backoff"

### 4. Updated Import References

- Fixed import in `packages/shared/src/prompts/__tests__/truncation.test.ts`
- Changed from `../../config/ai-analysis` to `../../config`

## Rationale

### Why Minimal Changes?

1. **Recent Refactoring**: The file was just refactored on the same day, so major changes would be premature
2. **Backward Compatibility**: Many parts of the codebase may still use the legacy exports
3. **Working Code**: The configuration is functional and well-tested

### Why These Specific Changes?

1. **Deprecation Warnings**: Guide users toward the new API without breaking existing code
2. **Documentation**: Magic numbers and complex calculations need clear explanations
3. **Import Fixes**: Broken imports would cause runtime errors

## Testing

- TypeScript compilation: ✅ Passed
- Truncation tests: ✅ All 13 tests passed
- AI analysis type tests: ✅ All 18 tests passed

## Future Recommendations

1. **Monitor Usage**: Track which parts of the codebase use the deprecated exports
2. **Migration Guide**: Create a migration guide when ready to remove legacy exports
3. **Gradual Migration**: Update internal usage to the new config structure over time
4. **Remove Legacy Exports**: After sufficient migration period (suggested: 3-6 months)
