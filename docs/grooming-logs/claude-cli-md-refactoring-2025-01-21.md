# Claude CLI Documentation Grooming - 2025-01-21

## File Groomed

`docs/02-User-Guide/claude-cli.md`

## Summary

Refactored the Claude CLI user guide from 199 lines to 75 lines, following ADR-022's DRY principle. Removed ~70% duplicated content, corrected all commands, and transformed it into a focused quick-start guide.

## Issues Identified

1. **Significant duplication** - ~70% of content duplicated `docker/claude-cli/README.md`
2. **Incorrect commands** - Used `docker compose` instead of `./docker-up.sh`
3. **Non-existent scripts** - Referenced helper scripts that don't exist (`claude-with-logs.sh`, `view-claude-logs.sh`)
4. **Overly detailed** - Contained low-level troubleshooting that belongs in technical docs
5. **Missing key info** - Didn't mention the root-level `./claude` helper script
6. **Violates ADR-022** - Our documentation strategy mandates DRY principle

## Changes Made

### Structure

- Reduced from 199 lines to 75 lines (62% reduction)
- Removed all duplicated content
- Added clear links to comprehensive documentation

### Content Updates

- **Added**: Prominent `./claude` helper script as recommended approach
- **Fixed**: All commands now use correct tools (`./docker-up.sh`, `./claude`)
- **Removed**: References to non-existent helper scripts
- **Removed**: Detailed implementation explanations (delegated to technical docs)
- **Removed**: Low-level troubleshooting details
- **Streamlined**: Troubleshooting to essential user-facing issues only

### New Focus

1. **Quick Start** - Immediate usage with helper script
2. **Common Usage Patterns** - Real-world examples
3. **Essential Troubleshooting** - Only user-facing issues
4. **Learn More** - Clear links to comprehensive docs

## Validation

Both Gemini-2.5-pro and O3-mini validated the approach:

- Gemini: 10/10 confidence, called it "model example of effective documentation grooming"
- O3-mini: Confirmed alignment with DRY principle and user documentation best practices

## Impact

- **User Experience**: Clearer, more accurate quick-start guide
- **Maintenance**: Single source of truth for technical details
- **Consistency**: Follows project documentation standards (ADR-022)
- **Accuracy**: All commands now work correctly

## Related Files

- `docker/claude-cli/README.md` - Comprehensive technical documentation (linked)
- `CLAUDE.md` - Project conventions (linked)
- `README.md` - Main project README (references this guide)
