/**
 * Centralized configuration for the application
 * All configuration values should be accessed through this module
 */

// Note: Environment variables should be loaded before importing this module.
// In development, use dotenv in your entry point or use bun which loads .env automatically.

// Helper to parse environment variables with improved type safety
const env = {
  string: (key: string, defaultValue: string): string => {
    return process.env[key] || defaultValue
  },
  int: (key: string, defaultValue: number): number => {
    const value = process.env[key]
    if (!value) {
      return defaultValue
    }
    const parsed = parseInt(value, 10)
    if (isNaN(parsed)) {
      console.warn(`Invalid integer value for ${key}: ${value}, using default: ${defaultValue}`)
      return defaultValue
    }
    return parsed
  },
  bool: (key: string, defaultValue: boolean): boolean => {
    const value = process.env[key]
    if (!value) {
      return defaultValue
    }
    return value.toLowerCase() === 'true'
  },
  /**
   * Parse JSON from environment variable with error handling
   */
  json: <T>(key: string, defaultValue: T): T => {
    const value = process.env[key]
    if (!value) {
      return defaultValue
    }
    try {
      return JSON.parse(value) as T
    } catch {
      console.warn(`Failed to parse JSON from ${key}, using default`)
      return defaultValue
    }
  },
}

export const config = {
  // Server configuration
  server: {
    port: env.int('PORT', 3000),
    host: env.string('HOST', '0.0.0.0'),
    env: env.string('NODE_ENV', 'development'),
    // Keep as getter since it depends on runtime NODE_ENV
    get isProduction() {
      return process.env.NODE_ENV === 'production'
    },
    timeout: env.int('PROXY_SERVER_TIMEOUT', 660000), // 11 minutes (longer than max request + retries)
  },

  // API configuration
  api: {
    claudeBaseUrl: env.string('CLAUDE_API_BASE_URL', 'https://api.anthropic.com'),
    claudeTimeout: env.int('CLAUDE_API_TIMEOUT', 600000), // 10 minutes
    oauthClientId: env.string('CLAUDE_OAUTH_CLIENT_ID', ''),
  },

  // Authentication
  auth: {
    credentialsDir: env.string('CREDENTIALS_DIR', 'credentials'),
  },

  // Database configuration
  database: {
    url: env.string('DATABASE_URL', ''),
    host: env.string('DB_HOST', 'localhost'),
    port: env.int('DB_PORT', 5432),
    name: env.string('DB_NAME', 'claude_proxy'),
    user: env.string('DB_USER', 'postgres'),
    password: env.string('DB_PASSWORD', ''),
    // Keep as getter since default depends on NODE_ENV
    get ssl() {
      return env.bool('DB_SSL', process.env.NODE_ENV === 'production')
    },
    poolSize: env.int('DB_POOL_SIZE', 20),
  },

  // Storage configuration
  storage: {
    enabled: env.bool('STORAGE_ENABLED', false),
    batchSize: env.int('STORAGE_BATCH_SIZE', 100),
    batchInterval: env.int('STORAGE_BATCH_INTERVAL', 5000), // 5 seconds
    // Additional storage adapter settings
    adapterCleanupMs: env.int('STORAGE_ADAPTER_CLEANUP_MS', 300000), // 5 minutes
    adapterRetentionMs: env.int('STORAGE_ADAPTER_RETENTION_MS', 3600000), // 1 hour
  },

  // Rate limiting
  rateLimit: {
    windowMs: env.int('RATE_LIMIT_WINDOW_MS', 3600000), // 1 hour
    maxRequests: env.int('RATE_LIMIT_MAX_REQUESTS', 1000),
    maxTokens: env.int('RATE_LIMIT_MAX_TOKENS', 1000000),
    domainWindowMs: env.int('DOMAIN_RATE_LIMIT_WINDOW_MS', 3600000), // 1 hour
    domainMaxRequests: env.int('DOMAIN_RATE_LIMIT_MAX_REQUESTS', 5000),
    domainMaxTokens: env.int('DOMAIN_RATE_LIMIT_MAX_TOKENS', 5000000),
  },

  // Circuit breaker
  circuitBreaker: {
    failureThreshold: env.int('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
    successThreshold: env.int('CIRCUIT_BREAKER_SUCCESS_THRESHOLD', 3),
    timeout: env.int('CIRCUIT_BREAKER_TIMEOUT', 120000), // 2 minutes
    volumeThreshold: env.int('CIRCUIT_BREAKER_VOLUME_THRESHOLD', 10),
    errorThresholdPercentage: env.int('CIRCUIT_BREAKER_ERROR_PERCENTAGE', 50),
  },

  // Request validation
  validation: {
    maxRequestSize: env.int('MAX_REQUEST_SIZE', 10 * 1024 * 1024), // 10MB
    maxMessageCount: env.int('MAX_MESSAGE_COUNT', 100),
    maxSystemLength: env.int('MAX_SYSTEM_LENGTH', 10000),
    maxMessageLength: env.int('MAX_MESSAGE_LENGTH', 100000),
    maxTotalLength: env.int('MAX_TOTAL_LENGTH', 500000),
  },

  // Logging
  logging: {
    level: env.string('LOG_LEVEL', 'info'),
    // Keep as getter since default depends on NODE_ENV
    get prettyPrint() {
      return !env.bool('LOG_JSON', process.env.NODE_ENV === 'production')
    },
    // SQL query logging
    debugSql: env.bool('DEBUG_SQL', false),
    slowQueryThresholdMs: env.int('SLOW_QUERY_THRESHOLD_MS', 5000), // 5 seconds
  },

  // Slack configuration
  slack: {
    webhookUrl: env.string('SLACK_WEBHOOK_URL', ''),
    channel: env.string('SLACK_CHANNEL', ''),
    username: env.string('SLACK_USERNAME', 'Claude Proxy'),
    iconEmoji: env.string('SLACK_ICON_EMOJI', ':robot_face:'),
    // Keep as getter since it depends on webhookUrl
    get enabled() {
      return env.bool('SLACK_ENABLED', !!this.webhookUrl)
    },
  },

  // Spark API configuration
  spark: {
    apiUrl: env.string('SPARK_API_URL', 'http://localhost:8000'),
    apiKey: env.string('SPARK_API_KEY', ''),
    // Keep as getter since it depends on apiKey
    get enabled() {
      return env.bool('SPARK_ENABLED', !!this.apiKey)
    },
  },

  // Telemetry
  telemetry: {
    endpoint: env.string('TELEMETRY_ENDPOINT', ''),
    enabled: env.bool('TELEMETRY_ENABLED', true),
  },

  // Feature flags
  features: {
    debug: env.bool('DEBUG', false),
    enableHealthChecks: env.bool('ENABLE_HEALTH_CHECKS', true),
    enableMetrics: env.bool('ENABLE_METRICS', true),
    enableNotifications: env.bool('ENABLE_NOTIFICATIONS', true),
    enableDashboard: env.bool('ENABLE_DASHBOARD', true),
    collectTestSamples: env.bool('COLLECT_TEST_SAMPLES', false),
    testSamplesDir: env.string('TEST_SAMPLES_DIR', 'test-samples'),
    enableClientAuth: env.bool('ENABLE_CLIENT_AUTH', true),
  },

  // Cache configuration
  cache: {
    messageCacheSize: env.int('MESSAGE_CACHE_SIZE', 1000),
    credentialCacheTTL: env.int('CREDENTIAL_CACHE_TTL', 3600000), // 1 hour
    credentialCacheSize: env.int('CREDENTIAL_CACHE_SIZE', 100),
    // Dashboard cache
    dashboardCacheTtl: env.int('DASHBOARD_CACHE_TTL', 30), // 30 seconds, 0 to disable
  },

  // Security configuration
  security: {
    apiKeySalt: env.string('API_KEY_SALT', 'claude-nexus-proxy-default-salt'),
  },

  // Dashboard configuration
  dashboard: {
    apiKey: env.string('DASHBOARD_API_KEY', ''),
  },

  // AI Analysis configuration
  aiAnalysis: {
    // Gemini API configuration
    geminiApiKey: env.string('GEMINI_API_KEY', ''),
    geminiApiUrl: env.string(
      'GEMINI_API_URL',
      'https://generativelanguage.googleapis.com/v1beta/models'
    ),
    geminiModelName: env.string('GEMINI_MODEL_NAME', 'gemini-2.0-flash-exp'),

    // Security configurations
    maxRetries: env.int('AI_ANALYSIS_MAX_RETRIES', 3), // Per ADR-018: 3 retries with exponential backoff
    requestTimeoutMs: env.int('AI_ANALYSIS_GEMINI_REQUEST_TIMEOUT_MS', 60000), // 60 seconds

    // Rate limiting
    rateLimits: {
      creation: env.int('AI_ANALYSIS_RATE_LIMIT_CREATION', 15), // 15 per minute
      retrieval: env.int('AI_ANALYSIS_RATE_LIMIT_RETRIEVAL', 100), // 100 per minute
    },

    // Worker configuration
    workerEnabled: env.bool('AI_WORKER_ENABLED', false),
    workerPollIntervalMs: env.int('AI_WORKER_POLL_INTERVAL_MS', 5000), // 5 seconds
    workerMaxConcurrentJobs: env.int('AI_WORKER_MAX_CONCURRENT_JOBS', 3),
    workerJobTimeoutMinutes: env.int('AI_WORKER_JOB_TIMEOUT_MINUTES', 5),

    // Security features
    enablePIIRedaction: env.bool('AI_ANALYSIS_ENABLE_PII_REDACTION', true),
    enablePromptInjectionProtection: env.bool(
      'AI_ANALYSIS_ENABLE_PROMPT_INJECTION_PROTECTION',
      true
    ),
    enableOutputValidation: env.bool('AI_ANALYSIS_ENABLE_OUTPUT_VALIDATION', true),
    enableAuditLogging: env.bool('AI_ANALYSIS_ENABLE_AUDIT_LOGGING', true),

    // Prompt configuration (consolidated from ai-analysis.ts)
    prompt: {
      // Context and token limits
      maxContextTokens: env.int('AI_MAX_CONTEXT_TOKENS', 1000000), // 1M context window for Gemini 2.0
      // Calculate max prompt tokens with safety margin to prevent token limit errors
      // Default: 900k base * 0.95 safety margin = 855k tokens
      maxPromptTokens: env.int(
        'AI_MAX_PROMPT_TOKENS',
        Math.floor(
          (env.int('AI_MAX_PROMPT_TOKENS_BASE', 900000) || 900000) *
            (env.int('AI_TOKENIZER_SAFETY_MARGIN', 0.95) || 0.95)
        )
      ),

      // Truncation strategy for managing large conversations
      truncation: {
        headMessages: env.int('AI_HEAD_MESSAGES', 5), // Keep first N messages
        tailMessages: env.int('AI_TAIL_MESSAGES', 20), // Keep last M messages
        // Input truncation for individual messages
        inputTargetTokens: env.int('AI_ANALYSIS_INPUT_TRUNCATION_TARGET_TOKENS', 8192),
        truncateFirstNTokens: env.int('AI_ANALYSIS_TRUNCATE_FIRST_N_TOKENS', 1000),
        truncateLastMTokens: env.int('AI_ANALYSIS_TRUNCATE_LAST_M_TOKENS', 4000),
      },

      // Token estimation
      estimatedCharsPerToken: env.int('AI_ESTIMATED_CHARS_PER_TOKEN', 12), // Conservative estimate: ~12 chars per token
      promptVersion: env.string('AI_ANALYSIS_PROMPT_VERSION', 'v1'),
      tokenizerSafetyMargin: env.int('AI_TOKENIZER_SAFETY_MARGIN', 0.95), // 5% buffer to prevent token limit errors
    },
  },

  // MCP (Model Context Protocol) configuration
  mcp: {
    enabled: env.bool('MCP_ENABLED', false),
    promptsDir: env.string('MCP_PROMPTS_DIR', './prompts'), // Local prompts directory
    watchFiles: env.bool('MCP_WATCH_FILES', true), // Hot-reload prompt files

    // GitHub synchronization (optional)
    github: {
      owner: env.string('MCP_GITHUB_OWNER', ''),
      repo: env.string('MCP_GITHUB_REPO', ''),
      branch: env.string('MCP_GITHUB_BRANCH', 'main'),
      token: env.string('MCP_GITHUB_TOKEN', ''),
      path: env.string('MCP_GITHUB_PATH', 'prompts/'),
    },

    sync: {
      interval: env.int('MCP_SYNC_INTERVAL', 300), // 5 minutes
      webhookSecret: env.string('MCP_GITHUB_WEBHOOK_SECRET', ''),
    },

    cache: {
      ttl: env.int('MCP_CACHE_TTL', 300), // 5 minutes
      maxSize: env.int('MCP_CACHE_SIZE', 1000),
    },
  },
}

// Validate required configuration
export function validateConfig(): void {
  const errors: string[] = []

  // Check for critical missing configuration
  if (config.storage.enabled && !config.database.url && !config.database.host) {
    errors.push('Storage is enabled but no database configuration provided')
  }

  if (
    config.slack.enabled &&
    config.slack.webhookUrl &&
    !config.slack.webhookUrl.startsWith('https://')
  ) {
    errors.push('Invalid Slack webhook URL')
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }
}

// Export type for configuration
export type Config = typeof config

/**
 * @deprecated Since 2025-01-19 - Use config.aiAnalysis.prompt instead
 * Legacy exports maintained for backward compatibility.
 * These will be removed in a future version.
 */
export const ANALYSIS_PROMPT_CONFIG = {
  MAX_CONTEXT_TOKENS: config.aiAnalysis.prompt.maxContextTokens,
  MAX_PROMPT_TOKENS: config.aiAnalysis.prompt.maxPromptTokens,
  TRUNCATION_STRATEGY: {
    HEAD_MESSAGES: config.aiAnalysis.prompt.truncation.headMessages,
    TAIL_MESSAGES: config.aiAnalysis.prompt.truncation.tailMessages,
  },
  ESTIMATED_CHARS_PER_TOKEN: config.aiAnalysis.prompt.estimatedCharsPerToken,
  PROMPT_VERSION: config.aiAnalysis.prompt.promptVersion,
  TOKENIZER_SAFETY_MARGIN: config.aiAnalysis.prompt.tokenizerSafetyMargin,
}

/**
 * @deprecated Since 2025-01-19 - Use config.aiAnalysis instead
 * Legacy export maintained for backward compatibility.
 */
export const GEMINI_CONFIG = {
  get API_URL() {
    return config.aiAnalysis.geminiApiUrl
  },
  get API_KEY() {
    return config.aiAnalysis.geminiApiKey
  },
  get MODEL_NAME() {
    return config.aiAnalysis.geminiModelName
  },
}

/**
 * @deprecated Since 2025-01-19 - Use config.aiAnalysis instead
 * Legacy export maintained for backward compatibility.
 */
export const AI_WORKER_CONFIG = {
  get ENABLED() {
    return config.aiAnalysis.workerEnabled
  },
  get POLL_INTERVAL_MS() {
    return config.aiAnalysis.workerPollIntervalMs
  },
  get MAX_CONCURRENT_JOBS() {
    return config.aiAnalysis.workerMaxConcurrentJobs
  },
  get JOB_TIMEOUT_MINUTES() {
    return config.aiAnalysis.workerJobTimeoutMinutes
  },
  get MAX_RETRIES() {
    return config.aiAnalysis.maxRetries
  },
  get GEMINI_REQUEST_TIMEOUT_MS() {
    return config.aiAnalysis.requestTimeoutMs
  },
}

/**
 * @deprecated Since 2025-01-19 - Use config.aiAnalysis.prompt.truncation instead
 * Legacy export maintained for backward compatibility.
 */
export const AI_ANALYSIS_CONFIG = {
  INPUT_TRUNCATION_TARGET_TOKENS: config.aiAnalysis.prompt.truncation.inputTargetTokens,
  TRUNCATE_FIRST_N_TOKENS: config.aiAnalysis.prompt.truncation.truncateFirstNTokens,
  TRUNCATE_LAST_M_TOKENS: config.aiAnalysis.prompt.truncation.truncateLastMTokens,
}
