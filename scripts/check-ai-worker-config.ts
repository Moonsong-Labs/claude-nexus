#!/usr/bin/env bun
/**
 * Check AI Analysis Worker configuration
 *
 * This script validates the AI Analysis Worker configuration settings
 * and provides actionable feedback for troubleshooting.
 */

import { config as loadEnv } from 'dotenv'
import { config } from '@claude-nexus/shared'

// Load environment variables
loadEnv()

// Helper to mask sensitive values
function maskSensitive(value: string | undefined, showFirst = 4): string {
  if (!value) return 'Not set'
  if (value.length <= showFirst) return '***'
  return value.substring(0, showFirst) + '***'
}

// Helper to format boolean values
function formatBoolean(value: boolean): string {
  return value ? '✓ Yes' : '✗ No'
}

// Helper to validate positive number
function validatePositiveNumber(value: number, name: string): { valid: boolean; message?: string } {
  if (value <= 0) {
    return { valid: false, message: `${name} must be positive (current: ${value})` }
  }
  return { valid: true }
}

// Main configuration check
function checkConfiguration() {
  const errors: string[] = []
  const warnings: string[] = []

  console.log('AI Analysis Worker Configuration Check')
  console.log('=====================================\n')

  // Core Configuration
  console.log('Core Configuration:')
  console.log(`  Worker Enabled: ${formatBoolean(config.aiAnalysis.workerEnabled)}`)
  console.log(`  Gemini API Key: ${maskSensitive(config.aiAnalysis.geminiApiKey)}`)
  console.log(`  Gemini Model: ${config.aiAnalysis.geminiModelName}`)
  console.log(`  Gemini API URL: ${config.aiAnalysis.geminiApiUrl}`)

  // Worker Settings
  console.log('\nWorker Settings:')
  console.log(`  Poll Interval: ${config.aiAnalysis.workerPollIntervalMs}ms`)
  console.log(`  Max Concurrent Jobs: ${config.aiAnalysis.workerMaxConcurrentJobs}`)
  console.log(`  Job Timeout: ${config.aiAnalysis.workerJobTimeoutMinutes} minutes`)
  console.log(`  Max Retries: ${config.aiAnalysis.maxRetries}`)
  console.log(`  Request Timeout: ${config.aiAnalysis.requestTimeoutMs}ms`)

  // Prompt Engineering Settings
  console.log('\nPrompt Engineering:')
  console.log(`  Max Prompt Tokens: ${config.aiAnalysis.prompt.maxPromptTokens}`)
  console.log(`  Max Context Tokens: ${config.aiAnalysis.prompt.maxContextTokens}`)
  console.log(`  Head Messages: ${config.aiAnalysis.prompt.truncation.headMessages}`)
  console.log(`  Tail Messages: ${config.aiAnalysis.prompt.truncation.tailMessages}`)
  console.log(
    `  Truncation Target: ${config.aiAnalysis.prompt.truncation.inputTargetTokens} tokens`
  )
  console.log(
    `  Truncate First N: ${config.aiAnalysis.prompt.truncation.truncateFirstNTokens} tokens`
  )
  console.log(
    `  Truncate Last M: ${config.aiAnalysis.prompt.truncation.truncateLastMTokens} tokens`
  )

  // Validation
  if (config.aiAnalysis.workerEnabled) {
    if (!config.aiAnalysis.geminiApiKey) {
      errors.push('AI_WORKER_ENABLED is true but GEMINI_API_KEY is not set')
    }

    const pollValidation = validatePositiveNumber(
      config.aiAnalysis.workerPollIntervalMs,
      'Poll interval'
    )
    if (!pollValidation.valid) errors.push(pollValidation.message!)

    const jobsValidation = validatePositiveNumber(
      config.aiAnalysis.workerMaxConcurrentJobs,
      'Max concurrent jobs'
    )
    if (!jobsValidation.valid) errors.push(jobsValidation.message!)

    const timeoutValidation = validatePositiveNumber(
      config.aiAnalysis.workerJobTimeoutMinutes,
      'Job timeout'
    )
    if (!timeoutValidation.valid) errors.push(timeoutValidation.message!)

    if (config.aiAnalysis.workerPollIntervalMs < 1000) {
      warnings.push('Poll interval < 1 second may cause excessive database queries')
    }

    if (config.aiAnalysis.workerMaxConcurrentJobs > 10) {
      warnings.push('High concurrent jobs (>10) may cause API rate limiting')
    }
  }

  // Results
  console.log('\n' + '='.repeat(50))

  if (errors.length > 0) {
    console.log('\n❌ Configuration Errors:')
    errors.forEach(err => console.log(`   • ${err}`))

    console.log('\nTo fix:')
    if (errors.some(e => e.includes('GEMINI_API_KEY'))) {
      console.log('  1. Add GEMINI_API_KEY=your-api-key to .env')
      console.log('  2. Or disable the worker: AI_WORKER_ENABLED=false')
    }

    return false
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    warnings.forEach(warn => console.log(`   • ${warn}`))
  }

  if (config.aiAnalysis.workerEnabled) {
    console.log('\n✅ AI Analysis Worker is properly configured!')
    console.log('\nWhen running the proxy service, you should see:')
    console.log('  ✓ AI Analysis Worker started')
    console.log(`  ✓ Polling every ${config.aiAnalysis.workerPollIntervalMs}ms`)
  } else {
    console.log('\n⚠️  AI Analysis Worker is disabled')
    console.log('\nTo enable:')
    console.log('  1. Set AI_WORKER_ENABLED=true in .env')
    console.log('  2. Add GEMINI_API_KEY=your-api-key in .env')
  }

  return true
}

// Run the check and exit with appropriate code
const isValid = checkConfiguration()
process.exit(isValid ? 0 : 1)
