/**
 * @file Main entry point for the @claude-nexus/shared package
 *
 * This barrel export file provides a centralized access point for all shared
 * utilities, types, and configurations used across the Claude Nexus monorepo.
 *
 * Export Strategy:
 * We use wildcard exports (export *) for all modules to simplify maintenance
 * and ensure new exports are automatically available. This is appropriate for
 * an internal monorepo package where we control all consumers.
 *
 * Organization:
 * Exports are grouped by category for better discoverability:
 * - Core Types & Interfaces
 * - Configuration
 * - Utilities
 * - Constants
 * - AI Analysis
 * - Prompts
 */

// ============================================================================
// Core Types & Interfaces
// ============================================================================
export * from './types/index.js'
export * from './types/ai-analysis.js'

// ============================================================================
// Configuration
// ============================================================================
export * from './config/index.js'

// ============================================================================
// Logger
// ============================================================================
export * from './logger/index.js'

// ============================================================================
// Middleware
// ============================================================================
export * from './middleware/index.js'

// ============================================================================
// Utilities
// ============================================================================
export * from './utils/errors.js'
export * from './utils/error-serialization.js'
export * from './utils/conversation-hash.js'
export * from './utils/conversation-linker.js'
export * from './utils/system-reminder.js'
export * from './utils/validation.js'

// ============================================================================
// Validators
// ============================================================================
export * from './validators/claude.validators.js'

// ============================================================================
// Constants
// ============================================================================
export * from './constants/model-limits.js'

// ============================================================================
// Prompts & AI Analysis
// ============================================================================
export * from './prompts/index.js'
