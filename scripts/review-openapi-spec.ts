#!/usr/bin/env bun
/**
 * Review OpenAPI specification using Gemini AI
 *
 * This script uses Gemini to review the OpenAPI specification for completeness,
 * best practices, and potential improvements. It provides both console output
 * and optional file output for CI/CD integration.
 *
 * Usage:
 *   bun run scripts/review-openapi-spec.ts [options]
 *
 * Options:
 *   --output-file <path>  Save the review to a file (in addition to console output)
 *   --help               Show help message
 *
 * Configuration:
 *   Uses shared config for Gemini settings (GEMINI_API_KEY, GEMINI_MODEL_NAME)
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { promises as fs } from 'fs'
import path from 'path'
import { config as loadEnv } from 'dotenv'
import { config } from '@claude-nexus/shared'

// Load environment variables
loadEnv()

// Parse command line arguments
const args = process.argv.slice(2)
const outputFileIndex = args.indexOf('--output-file')
const outputFile = outputFileIndex !== -1 ? args[outputFileIndex + 1] : null
const showHelp = args.includes('--help')

// Configuration
const OPENAPI_SPEC = path.join(__dirname, '..', 'docs/api/openapi-analysis.yaml')
const DEFAULT_OUTPUT_FILE = 'openapi-analysis-review.md'

// Review prompt template
const REVIEW_PROMPT = `Please review this OpenAPI 3.0 specification for an AI Analysis API and provide feedback on:

1. **Completeness**: Are all necessary components properly documented? Are there any missing elements?
2. **Best Practices**: Does it follow OpenAPI best practices and conventions?
3. **Security**: Are authentication and authorization properly documented?
4. **Error Handling**: Are all error scenarios properly covered?
5. **Examples**: Are the examples helpful and comprehensive?
6. **Descriptions**: Are descriptions clear and informative?
7. **Schema Design**: Are the schemas well-structured and reusable?
8. **Versioning**: Is API versioning handled appropriately?
9. **Rate Limiting**: Is rate limiting documentation clear?
10. **Improvements**: What specific improvements would you recommend?

OpenAPI Specification:
\`\`\`yaml
{spec}
\`\`\`

Please provide a structured review with specific actionable feedback.`

// Helper functions
function showHelpMessage() {
  console.log(`
OpenAPI Specification Review Tool
=================================

Usage: bun run scripts/review-openapi-spec.ts [options]

Options:
  --output-file <path>  Save the review to a file (default: ${DEFAULT_OUTPUT_FILE})
  --help               Show this help message

Configuration:
  GEMINI_API_KEY      Required - Your Gemini API key
  GEMINI_MODEL_NAME   Optional - Gemini model to use (default: ${config.aiAnalysis.geminiModelName || 'gemini-2.0-flash-exp'})

Examples:
  # Review and display in console only
  bun run scripts/review-openapi-spec.ts

  # Review and save to specific file
  bun run scripts/review-openapi-spec.ts --output-file docs/api/review.md
`)
}

function maskSensitive(value: string | undefined, showFirst = 4): string {
  if (!value) return 'Not set'
  if (value.length <= showFirst) return '***'
  return value.substring(0, showFirst) + '***'
}

function validateConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.aiAnalysis.geminiApiKey) {
    errors.push('GEMINI_API_KEY environment variable is required')
  }

  return { valid: errors.length === 0, errors }
}

async function reviewSpec() {
  // Show help if requested
  if (showHelp) {
    showHelpMessage()
    process.exit(0)
  }

  // Validate configuration
  console.log('🔧 Checking configuration...')
  const { valid, errors } = validateConfiguration()
  if (!valid) {
    console.error('\n❌ Configuration errors:')
    errors.forEach(error => console.error(`   - ${error}`))
    console.error('\nRun with --help for more information.')
    process.exit(1)
  }

  console.log(`  Gemini API Key: ${maskSensitive(config.aiAnalysis.geminiApiKey)}`)
  console.log(`  Gemini Model: ${config.aiAnalysis.geminiModelName}`)
  console.log(`  Output File: ${outputFile || 'Console only'}\n`)

  // Check if OpenAPI spec exists
  console.log('🔍 Loading OpenAPI specification...')
  try {
    await fs.access(OPENAPI_SPEC)
  } catch (error) {
    console.error(`❌ OpenAPI spec not found at: ${OPENAPI_SPEC}`)
    console.error('   Make sure the file exists and the path is correct.')
    process.exit(1)
  }

  let specContent: string
  try {
    specContent = await fs.readFile(OPENAPI_SPEC, 'utf-8')
    console.log(
      `  ✓ Loaded ${specContent.split('\n').length} lines from ${path.basename(OPENAPI_SPEC)}`
    )
  } catch (error) {
    console.error(`❌ Error reading OpenAPI spec: ${error.message}`)
    process.exit(1)
  }

  console.log('\n🤖 Initializing Gemini...')
  const genAI = new GoogleGenerativeAI(config.aiAnalysis.geminiApiKey)
  const model = genAI.getGenerativeModel({ model: config.aiAnalysis.geminiModelName })
  console.log(`  ✓ Using model: ${config.aiAnalysis.geminiModelName}`)

  const prompt = REVIEW_PROMPT.replace('{spec}', specContent)

  console.log('\n📤 Sending to Gemini for review...')
  console.log('  ⏳ This may take a moment...')

  let review: string
  try {
    const startTime = Date.now()
    const result = await model.generateContent(prompt)
    const response = await result.response

    if (!response || !response.text) {
      throw new Error('Invalid response from Gemini API')
    }

    review = response.text()
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  ✓ Review completed in ${duration}s`)
  } catch (error) {
    console.error(`\n❌ Error generating review: ${error.message}`)
    if (error.message?.includes('API key')) {
      console.error('   Please check that your GEMINI_API_KEY is valid.')
    } else if (error.message?.includes('quota')) {
      console.error('   API quota exceeded. Please try again later.')
    }
    process.exit(1)
  }

  // Display review in console
  console.log('\n' + '='.repeat(80))
  console.log('📋 OPENAPI SPECIFICATION REVIEW')
  console.log('='.repeat(80) + '\n')
  console.log(review)
  console.log('\n' + '='.repeat(80))

  // Save review to file if requested
  if (outputFile) {
    const reviewPath = path.isAbsolute(outputFile)
      ? outputFile
      : path.join(path.dirname(OPENAPI_SPEC), outputFile)

    const reviewContent = `# OpenAPI Specification Review

**Specification**: ${path.relative(process.cwd(), OPENAPI_SPEC)}
**Reviewed**: ${new Date().toISOString()}
**Reviewer**: ${config.aiAnalysis.geminiModelName}

## Review

${review}
`

    try {
      await fs.writeFile(reviewPath, reviewContent)
      console.log(`\n✅ Review saved to: ${path.relative(process.cwd(), reviewPath)}`)
    } catch (error) {
      console.error(`\n⚠️  Warning: Failed to save review to file: ${error.message}`)
      console.error('   The review is still displayed above.')
    }
  }
}

// Main execution
async function main() {
  try {
    await reviewSpec()
    console.log('\n✨ Review completed successfully!')
  } catch (error) {
    console.error('\n❌ Unexpected error:', error)
    process.exit(1)
  }
}

// Run the review
main()
