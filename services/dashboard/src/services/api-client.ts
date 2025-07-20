import { logger } from '../middleware/logger.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { HttpError } from '../errors/HttpError.js'

// Re-export all types
export * from './api-client.types.js'

// Import only the types we need for implementation
import type {
  StatsResponse,
  RequestsResponse,
  RequestDetails,
  DomainsResponse,
  TokenUsageWindow,
  DailyUsage,
  RateLimitConfig,
  ConversationSummary,
  TokenUsageTimeSeriesResponse,
  AccountsTokenUsageResponse,
} from './api-client.types.js'

/**
 * API client for communicating with the Proxy service.
 *
 * This client provides typed methods for all proxy API endpoints,
 * handling authentication, error handling, and response parsing.
 *
 * @example
 * ```typescript
 * const client = new ProxyApiClient('http://localhost:3000', 'api-key');
 * const stats = await client.getStats({ domain: 'example.com' });
 * ```
 */
export class ProxyApiClient {
  private baseUrl: string
  private apiKey: string | undefined

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || process.env.PROXY_API_URL || 'http://localhost:3000'
    this.apiKey = apiKey || process.env.DASHBOARD_API_KEY
  }

  private getHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    }

    if (this.apiKey) {
      headers['X-Dashboard-Key'] = this.apiKey
    }

    return headers
  }

  /**
   * Internal method to make HTTP requests with consistent error handling
   */
  private async request<T>(
    path: string,
    options?: {
      method?: string
      body?: unknown
      params?: Record<string, string | number | boolean>
      headers?: Record<string, string>
    }
  ): Promise<T> {
    try {
      const url = new URL(path, this.baseUrl)

      // Add query parameters if provided
      if (options?.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, value.toString())
          }
        })
      }

      const response = await fetch(url.toString(), {
        method: options?.method || 'GET',
        headers: this.getHeaders(options?.headers),
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      })

      if (!response.ok) {
        if (response.status === 404 && path.includes('/api/requests/')) {
          throw new Error('Request not found')
        }
        throw await HttpError.fromResponse(response)
      }

      return await response.json()
    } catch (error) {
      // If it's already an HttpError or known error, just re-throw it
      if (HttpError.isHttpError(error) || error instanceof Error) {
        throw error
      }

      logger.error('API request failed', {
        error: getErrorMessage(error),
        path,
        method: options?.method || 'GET',
      })
      throw error
    }
  }

  /**
   * Get aggregated statistics from the proxy
   *
   * @param params - Optional filter parameters
   * @param params.domain - Filter by specific domain
   * @param params.since - Filter by time range (ISO date string)
   * @returns Aggregated statistics response
   */
  async getStats(params?: { domain?: string; since?: string }): Promise<StatsResponse> {
    return this.request<StatsResponse>('/api/stats', { params })
  }

  /**
   * Get recent requests with pagination
   *
   * @param params - Query parameters
   * @param params.domain - Filter by specific domain
   * @param params.limit - Number of results to return (default: 50)
   * @param params.offset - Pagination offset (default: 0)
   * @returns Paginated requests response
   */
  async getRequests(params?: {
    domain?: string
    limit?: number
    offset?: number
  }): Promise<RequestsResponse> {
    return this.request<RequestsResponse>('/api/requests', { params })
  }

  /**
   * Get detailed information for a specific request
   *
   * @param requestId - The unique request ID
   * @returns Detailed request information including body and response
   * @throws Error if request not found
   */
  async getRequestDetails(requestId: string): Promise<RequestDetails> {
    return this.request<RequestDetails>(`/api/requests/${requestId}`)
  }

  /**
   * Get list of active domains with their request counts
   *
   * @returns List of domains with request statistics
   */
  async getDomains(): Promise<DomainsResponse> {
    return this.request<DomainsResponse>('/api/domains')
  }

  /**
   * Get current window token usage for rate limiting
   *
   * @param params - Query parameters
   * @param params.accountId - Account ID to query
   * @param params.window - Window in minutes (default: 300 = 5 hours)
   * @param params.domain - Filter by specific domain
   * @param params.model - Filter by specific model
   * @returns Token usage within the specified window
   */
  async getTokenUsageWindow(params: {
    accountId: string
    window?: number
    domain?: string
    model?: string
  }): Promise<TokenUsageWindow> {
    return this.request<TokenUsageWindow>('/api/token-usage/current', { params })
  }

  /**
   * Get daily token usage history
   *
   * @param params - Query parameters
   * @param params.accountId - Account ID to query
   * @param params.days - Number of days to fetch (default: 30)
   * @param params.domain - Filter by specific domain
   * @param params.aggregate - Aggregate results across domains
   * @returns Daily usage statistics
   */
  async getDailyTokenUsage(params: {
    accountId: string
    days?: number
    domain?: string
    aggregate?: boolean
  }): Promise<{ usage: DailyUsage[] }> {
    return this.request<{ usage: DailyUsage[] }>('/api/token-usage/daily', { params })
  }

  /**
   * Get token usage time series data for visualization
   *
   * @param params - Query parameters
   * @param params.accountId - Account ID to query
   * @param params.window - Window in hours (default: 5)
   * @param params.interval - Interval in minutes (default: 5)
   * @returns Time series data for token usage
   */
  async getTokenUsageTimeSeries(params: {
    accountId: string
    window?: number
    interval?: number
  }): Promise<TokenUsageTimeSeriesResponse> {
    return this.request<TokenUsageTimeSeriesResponse>('/api/token-usage/time-series', { params })
  }

  /**
   * Get token usage for all accounts
   *
   * @returns Token usage statistics for all accounts
   */
  async getAccountsTokenUsage(): Promise<AccountsTokenUsageResponse> {
    return this.request<AccountsTokenUsageResponse>('/api/token-usage/accounts')
  }

  /**
   * Get rate limit configurations
   *
   * @param params - Filter parameters
   * @param params.accountId - Filter by account ID
   * @param params.domain - Filter by domain
   * @param params.model - Filter by model
   * @returns Rate limit configurations
   */
  async getRateLimitConfigs(params?: {
    accountId?: string
    domain?: string
    model?: string
  }): Promise<{ configs: RateLimitConfig[] }> {
    return this.request<{ configs: RateLimitConfig[] }>('/api/rate-limits', { params })
  }

  /**
   * Get conversations with account information
   *
   * @param params - Filter parameters
   * @param params.domain - Filter by domain
   * @param params.accountId - Filter by account ID
   * @param params.limit - Maximum number of conversations to return
   * @returns List of conversation summaries
   */
  async getConversations(params?: {
    domain?: string
    accountId?: string
    limit?: number
  }): Promise<{ conversations: ConversationSummary[] }> {
    return this.request<{ conversations: ConversationSummary[] }>('/api/conversations', { params })
  }

  /**
   * Generic GET method for API calls
   *
   * @param path - API endpoint path
   * @returns Parsed JSON response
   */
  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  /**
   * Generic POST method for API calls
   *
   * @param path - API endpoint path
   * @param body - Request body to send
   * @returns Parsed JSON response
   */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body })
  }

  /**
   * Make a generic fetch request to the proxy API
   *
   * @param path - API endpoint path
   * @param options - Fetch options
   * @returns Raw fetch response
   */
  async fetch(path: string, options?: RequestInit): Promise<Response> {
    try {
      const url = new URL(path, this.baseUrl)

      const response = await fetch(url.toString(), {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...(options?.headers as Record<string, string>),
        },
      })

      return response
    } catch (error) {
      logger.error('API fetch request failed', {
        error: getErrorMessage(error),
        path,
      })
      throw error
    }
  }
}
