// Safety margin to account for discrepancies between local and server-side tokenizers
const TOKENIZER_SAFETY_MARGIN = 0.95

export const ANALYSIS_PROMPT_CONFIG = {
  // Using Gemini 1.5 Pro's 1M context window, leaving room for response.
  // We can tune this based on observed output token sizes.
  MAX_CONTEXT_TOKENS: 1000000,
  // Apply safety margin to avoid potential tokenizer discrepancies
  MAX_PROMPT_TOKENS: Math.floor(900000 * TOKENIZER_SAFETY_MARGIN), // ~855k with 5% margin
  TRUNCATION_STRATEGY: {
    HEAD_MESSAGES: 5,
    TAIL_MESSAGES: 20,
  },
  // Token to character ratio varies by content type
  // For typical text: ~4 chars/token, for repeated chars: ~16 chars/token
  ESTIMATED_CHARS_PER_TOKEN: 12, // Conservative middle ground
  // Future: Can be overridden by environment variables
  PROMPT_VERSION: process.env.AI_ANALYSIS_PROMPT_VERSION || 'v1',
  // Safety margin documentation
  TOKENIZER_SAFETY_MARGIN,
}
