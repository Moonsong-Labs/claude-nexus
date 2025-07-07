#!/usr/bin/env bun
/**
 * Review OpenAPI specification using Gemini
 *
 * This script uses Gemini to review the OpenAPI specification for completeness,
 * best practices, and potential improvements.
 *
 * Usage:
 *   GEMINI_API_KEY=your-key bun run scripts/review-openapi-spec.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { promises as fs } from 'fs'
import path from 'path'

const OPENAPI_SPEC = path.join(process.cwd(), 'docs/api/openapi-analysis.yaml')

async function reviewSpec() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable is required')
    process.exit(1)
  }

  console.log('🔍 Loading OpenAPI specification...')
  const specContent = await fs.readFile(OPENAPI_SPEC, 'utf-8')

  console.log('🤖 Initializing Gemini...')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const prompt = `Please review this OpenAPI 3.0 specification for an AI Analysis API and provide feedback on:

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
${specContent}
\`\`\`

Please provide a structured review with specific actionable feedback.`

  console.log('📤 Sending to Gemini for review...')
  const result = await model.generateContent(prompt)
  const response = await result.response
  const review = response.text()

  console.log('\n' + '='.repeat(80))
  console.log('📋 OPENAPI SPECIFICATION REVIEW')
  console.log('='.repeat(80) + '\n')
  console.log(review)
  console.log('\n' + '='.repeat(80))

  // Save review to file
  const reviewPath = path.join(path.dirname(OPENAPI_SPEC), 'openapi-analysis-review.md')
  const reviewContent = `# OpenAPI Specification Review

**Specification**: ${OPENAPI_SPEC}
**Reviewed**: ${new Date().toISOString()}
**Reviewer**: Gemini 1.5 Flash

## Review

${review}
`

  await fs.writeFile(reviewPath, reviewContent)
  console.log(`\n✅ Review saved to: ${reviewPath}`)
}

// Run the review
reviewSpec().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})
