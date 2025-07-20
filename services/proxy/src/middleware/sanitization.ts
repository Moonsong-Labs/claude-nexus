import { SyncRedactor } from 'redact-pii'
import { logger } from './logger.js'
import {
  ANTHROPIC_API_KEY_REGEX,
  CNP_API_KEY_REGEX,
  JWT_TOKEN_REGEX,
  DATABASE_URL_PATTERNS,
} from '@claude-nexus/shared/utils/validation'

// ============================================================================
// Constants
// ============================================================================

/** Maximum content length before truncation (50KB) */
const MAX_CONTENT_LENGTH = 50000

/** Common prompt injection patterns to filter */
const PROMPT_INJECTION_PATTERNS = [
  'ignore (previous|all) instructions?',
  'disregard (previous|all) instructions?',
  'forget everything',
  'new task:',
  'system:',
  'assistant:',
  'user:',
  '\\[INST\\]',
  '\\[\\/INST\\]',
  '<\\|im_start\\|>',
  '<\\|im_end\\|>',
]

/** Control characters regex pattern */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g

/** HTML special characters that need escaping */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** JSON format template for analysis retry prompts */
const ANALYSIS_RETRY_TEMPLATE = `

CRITICAL REMINDER: You MUST respond with a JSON object wrapped in a json code block.
The JSON must have the following structure:

\`\`\`json
{
  "analysis": {
    "summary": "Your summary here",
    "keyTopics": ["topic1", "topic2", "topic3"],
    "sentiment": "positive/neutral/negative/mixed",
    "userIntent": "What the user was trying to achieve",
    "outcomes": ["outcome1", "outcome2"],
    "actionItems": [
      {
        "type": "task",
        "description": "Specific task description",
        "priority": "high"
      },
      {
        "type": "prompt_improvement",
        "description": "How to improve your prompts",
        "priority": "medium"
      }
    ],
    "promptingTips": [
      {
        "category": "clarity",
        "issue": "Specific issue observed",
        "suggestion": "How to improve",
        "example": "Example of improved prompt"
      }
    ],
    "interactionPatterns": {
      "promptClarity": 7,
      "contextCompleteness": 8,
      "followUpEffectiveness": "good",
      "commonIssues": ["issue1", "issue2"],
      "strengths": ["strength1", "strength2"]
    },
    "technicalDetails": {
      "frameworks": ["framework1", "framework2"],
      "issues": ["issue1", "issue2"],
      "solutions": ["solution1", "solution2"],
      "toolUsageEfficiency": "optimal",
      "contextWindowManagement": "efficient"
    },
    "conversationQuality": {
      "clarity": "high/medium/low",
      "clarityImprovement": "How to improve clarity",
      "completeness": "complete/partial/incomplete",
      "completenessImprovement": "What was missing",
      "effectiveness": "highly effective/effective/needs improvement",
      "effectivenessImprovement": "Key changes for better effectiveness"
    }
  }
}
\`\`\`

Do NOT include any text outside the code block.`

// ============================================================================
// PII Redaction Configuration
// ============================================================================

/**
 * Configured PII redactor with custom patterns for sensitive data
 * Handles API keys, tokens, database URLs, and standard PII
 */
const piiRedactor = new SyncRedactor({
  customRedactors: {
    after: [
      // API keys
      { regexpPattern: new RegExp(ANTHROPIC_API_KEY_REGEX.source, 'g'), replaceWith: '[API_KEY]' },
      { regexpPattern: new RegExp(CNP_API_KEY_REGEX.source, 'g'), replaceWith: '[API_KEY]' },
      // JWT tokens
      {
        regexpPattern: new RegExp(JWT_TOKEN_REGEX.source, 'g'),
        replaceWith: '[JWT_TOKEN]',
      },
      // Database URLs
      {
        regexpPattern: new RegExp(DATABASE_URL_PATTERNS.postgresql.source, 'g'),
        replaceWith: '[DATABASE_URL]',
      },
      {
        regexpPattern: new RegExp(DATABASE_URL_PATTERNS.mysql.source, 'g'),
        replaceWith: '[DATABASE_URL]',
      },
      {
        regexpPattern: new RegExp(DATABASE_URL_PATTERNS.mongodb.source, 'g'),
        replaceWith: '[DATABASE_URL]',
      },
    ],
  },
  // Use specific replacements for built-in patterns
  builtInRedactors: {
    creditCardNumber: { replaceWith: '[CREDIT_CARD]' },
    emailAddress: { replaceWith: '[EMAIL]' },
    ipAddress: { replaceWith: '[IP_ADDRESS]' },
    phoneNumber: { replaceWith: '[PHONE]' },
    streetAddress: { replaceWith: '[ADDRESS]' },
    usSocialSecurityNumber: { replaceWith: '[SSN]' },
    zipcode: { replaceWith: '[ZIPCODE]' },
    url: { replaceWith: '[URL]' },
  },
})

/**
 * Sanitizes content for safe LLM processing
 *
 * Performs the following operations in order:
 * 1. PII redaction (emails, credit cards, SSNs, API keys, etc.)
 * 2. Control character removal
 * 3. Whitespace normalization
 * 4. Prompt injection pattern filtering
 * 5. HTML special character escaping
 * 6. Content length limiting
 *
 * @param content - The raw content to sanitize
 * @returns Sanitized content safe for LLM processing
 * @throws Never - returns '[SANITIZATION_ERROR]' on any error
 */
export function sanitizeForLLM(content: string): string {
  const startTime = Date.now()

  try {
    // 1. First redact PII
    let sanitized = piiRedactor.redact(content)

    // 2. Remove potential control characters
    sanitized = sanitized.replace(CONTROL_CHARS_REGEX, '')

    // 3. Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim()

    // 4. Remove prompt injection patterns (combined regex for performance)
    const injectionPattern = new RegExp(PROMPT_INJECTION_PATTERNS.join('|'), 'gi')
    sanitized = sanitized.replace(injectionPattern, '[FILTERED]')

    // 5. Escape HTML-like special characters to prevent command interpretation
    sanitized = sanitized.replace(/[<>"']/g, char => HTML_ESCAPE_MAP[char] || char)

    // 6. Length limiting
    if (sanitized.length > MAX_CONTENT_LENGTH) {
      sanitized = sanitized.substring(0, MAX_CONTENT_LENGTH) + '... [TRUNCATED]'
    }

    logger.debug(`Content sanitized in ${Date.now() - startTime}ms`, {
      metadata: {
        originalLength: content.length,
        sanitizedLength: sanitized.length,
        piiRedacted: content !== piiRedactor.redact(content),
      },
    })

    return sanitized
  } catch (error) {
    logger.error('Error sanitizing content', { error })
    // On error, return a safe fallback
    return '[SANITIZATION_ERROR]'
  }
}

/**
 * Result of analysis output validation
 */
export interface ValidationResult {
  /** Whether the output passes all validation checks */
  isValid: boolean
  /** List of validation issues found */
  issues: string[]
}

/**
 * Validates AI analysis output for expected structure and security
 *
 * Checks for:
 * - Required sections or JSON structure
 * - PII leakage
 * - Sensitive information patterns
 *
 * @param output - The AI analysis output to validate
 * @returns Validation result with issues if any
 */
export function validateAnalysisOutput(output: string): ValidationResult {
  const issues: string[] = []

  // Check if the output contains a JSON code block
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/)

  if (!jsonMatch) {
    // If no JSON block, check for required sections in plain text
    const requiredSections = [
      { name: 'summary', pattern: /summary:?/i },
      { name: 'key topics', pattern: /key\s+topics?:?/i },
      { name: 'patterns', pattern: /patterns?:?/i },
    ]

    requiredSections.forEach(section => {
      if (!section.pattern.test(output)) {
        issues.push(`Missing required section: ${section.name}`)
      }
    })
  } else {
    // If JSON block exists, validate the JSON structure
    try {
      const jsonContent = jsonMatch[1]
      const parsed = JSON.parse(jsonContent)

      // Check for the analysis object
      if (!parsed.analysis) {
        issues.push('Missing "analysis" key in JSON response')
      } else {
        // Check for required fields in the analysis
        const requiredFields = ['summary', 'keyTopics']
        requiredFields.forEach(field => {
          if (!parsed.analysis[field]) {
            issues.push(`Missing required field: ${field}`)
          }
        })
      }
    } catch (_e) {
      issues.push('Invalid JSON in response')
    }
  }

  // Scan for PII leakage in output
  const outputWithRedactedPII = piiRedactor.redact(output)
  if (outputWithRedactedPII !== output) {
    issues.push('Output contains PII that needs to be redacted')
  }

  // Check for suspicious content
  const suspiciousPatterns: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /password\s*[:=]\s*\S+/i, message: 'Output contains password pattern' },
    { pattern: /api[_\s-]?key\s*[:=]\s*\S+/i, message: 'Output contains API key pattern' },
    { pattern: /secret\s*[:=]\s*\S+/i, message: 'Output contains secret pattern' },
    { pattern: /token\s*[:=]\s*\S+/i, message: 'Output contains token pattern' },
  ]

  suspiciousPatterns.forEach(({ pattern, message }) => {
    if (pattern.test(output)) {
      issues.push(message)
    }
  })

  return {
    isValid: issues.length === 0,
    issues,
  }
}

/**
 * Enhances a prompt with explicit JSON format instructions for retry attempts
 *
 * Appends detailed JSON structure requirements to ensure the AI model
 * returns properly formatted analysis data on retry.
 *
 * @param originalPrompt - The original analysis prompt
 * @returns Enhanced prompt with JSON format requirements
 */
export function enhancePromptForRetry(originalPrompt: string): string {
  return originalPrompt + ANALYSIS_RETRY_TEMPLATE
}
