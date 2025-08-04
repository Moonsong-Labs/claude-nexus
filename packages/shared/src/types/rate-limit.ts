// Rate limit tracking types

export type RateLimitType =
  | 'tokens_per_minute'
  | 'requests_per_minute'
  | 'tokens_per_day'
  | 'unknown'

export interface RateLimitSummary {
  id: number
  account_id: string
  first_triggered_at: Date
  last_triggered_at: Date
  retry_until: Date | null
  total_hits: number
  last_limit_type: RateLimitType | null
  last_error_message: string | null
  created_at: Date
  updated_at: Date
}

export interface RateLimitInfo {
  is_rate_limited: boolean // true if retry_until > now
  first_triggered_at: string
  last_triggered_at: string
  retry_until: string | null
  total_hits: number
  last_limit_type: RateLimitType | null
  tokens_in_window_before_limit: number
}

export interface TokenUsageWithRateLimit {
  account_id: string
  total_requests: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  rate_limit_info: RateLimitInfo | null
}

// Helper function to parse rate limit type from error message
export function parseRateLimitType(message: string): RateLimitType {
  if (message.includes('request tokens') && message.includes('per-minute')) {
    return 'tokens_per_minute'
  }
  if (message.includes('request tokens') && message.includes('daily')) {
    return 'tokens_per_day'
  }
  if (message.includes('Number of requests') && message.includes('per-minute')) {
    return 'requests_per_minute'
  }
  return 'unknown'
}

// Check if account is currently rate limited
export function isCurrentlyRateLimited(retryUntil: Date | null): boolean {
  if (!retryUntil) {
    return false
  }
  return new Date() < retryUntil
}
