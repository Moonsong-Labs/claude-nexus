// Safety margin to account for discrepancies between local and server-side tokenizers
const TOKENIZER_SAFETY_MARGIN = Number(process.env.AI_TOKENIZER_SAFETY_MARGIN) || 0.95

// Helper function to parse JSON from environment variables
function parseEnvJson<T>(envVar: string | undefined, defaultValue: T): T {
  if (!envVar) {
    return defaultValue
  }
  try {
    return JSON.parse(envVar) as T
  } catch {
    console.warn(`Failed to parse JSON from environment variable: ${envVar}`)
    return defaultValue
  }
}

export const ANALYSIS_PROMPT_CONFIG = {
  // Using Gemini 1.5 Pro's 1M context window, leaving room for response.
  // We can tune this based on observed output token sizes.
  MAX_CONTEXT_TOKENS: Number(process.env.AI_MAX_CONTEXT_TOKENS) || 1000000,
  // Apply safety margin to avoid potential tokenizer discrepancies
  MAX_PROMPT_TOKENS:
    Number(process.env.AI_MAX_PROMPT_TOKENS) ||
    Math.floor((Number(process.env.AI_MAX_PROMPT_TOKENS_BASE) || 900000) * TOKENIZER_SAFETY_MARGIN), // ~855k with 5% margin
  TRUNCATION_STRATEGY: parseEnvJson(process.env.AI_TRUNCATION_STRATEGY, {
    HEAD_MESSAGES: Number(process.env.AI_HEAD_MESSAGES) || 5,
    TAIL_MESSAGES: Number(process.env.AI_TAIL_MESSAGES) || 20,
  }),
  // Token to character ratio varies by content type
  // For typical text: ~4 chars/token, for repeated chars: ~16 chars/token
  ESTIMATED_CHARS_PER_TOKEN: Number(process.env.AI_ESTIMATED_CHARS_PER_TOKEN) || 12, // Conservative middle ground
  // Prompt version can be overridden by environment variables
  PROMPT_VERSION: process.env.AI_ANALYSIS_PROMPT_VERSION || 'v1',
  // Safety margin documentation
  TOKENIZER_SAFETY_MARGIN,
}
