import { describe, it, expect, beforeEach } from 'bun:test'
import { NotificationService, NotificationConfig } from '../NotificationService'
import { ProxyRequest } from '../../domain/entities/ProxyRequest'
import { ProxyResponse } from '../../domain/entities/ProxyResponse'
import type { RequestContext } from '../../domain/value-objects/RequestContext'
import type { AuthenticationService } from '../AuthenticationService'
import type { ClaudeMessagesRequest } from '@claude-nexus/shared'

// Test constants
const TEST_DOMAIN = 'test.domain.com'
const TEST_REQUEST_ID = 'test-req-123'
const OPUS_MODEL = 'claude-3-opus-20240229'
const HAIKU_MODEL = 'claude-3-haiku-20240307'

// Mock classes for testing
class MockNotificationService extends NotificationService {
  public sentNotifications: unknown[] = []
  public errors: unknown[] = []

  constructor(config?: NotificationConfig) {
    super(config)
  }

  // Expose protected methods for testing
  public getPreviousMessageTest(domain: string): string {
    return super['getPreviousMessage'](domain)
  }

  public setPreviousMessageTest(domain: string, message: string): void {
    super['setPreviousMessage'](domain, message)
  }

  public shouldSendNotificationTest(request: ProxyRequest, context: RequestContext): boolean {
    return super['shouldSendNotification'](request, context)
  }

  public async getDomainWebhookTest(host: string) {
    return super['getDomainWebhook'](host)
  }

  public buildConversationMessageTest(request: ProxyRequest, response: ProxyResponse): string {
    return super['buildConversationMessage'](request, response)
  }
}

interface SlackConfig {
  enabled: boolean
  webhook_url: string
  channel?: string
}

class MockAuthenticationService implements Partial<AuthenticationService> {
  private slackConfigs = new Map<string, SlackConfig>()

  setSlackConfig(domain: string, config: SlackConfig) {
    this.slackConfigs.set(domain, config)
  }

  async getSlackConfig(domain: string) {
    return this.slackConfigs.get(domain)
  }

  getMaskedCredentialInfo() {
    return 'sk-ant-****'
  }
}

// Helper functions
function createInferenceRequest(
  userContent: string = 'Hello Claude',
  overrides: Partial<ClaudeMessagesRequest> = {}
): ClaudeMessagesRequest {
  return {
    model: OPUS_MODEL,
    messages: [
      { role: 'system', content: 'System prompt 1' },
      { role: 'system', content: 'System prompt 2' },
      { role: 'user', content: userContent },
    ],
    max_tokens: 100,
    ...overrides,
  }
}

function createQueryRequest(
  userContent: string = 'What is 2+2?',
  overrides: Partial<ClaudeMessagesRequest> = {}
): ClaudeMessagesRequest {
  return {
    model: HAIKU_MODEL,
    messages: [{ role: 'user', content: userContent }],
    max_tokens: 10,
    ...overrides,
  }
}

function createQuotaRequest(): ClaudeMessagesRequest {
  return {
    model: HAIKU_MODEL,
    messages: [{ role: 'user', content: 'quota' }],
    max_tokens: 1,
  }
}

describe('NotificationService', () => {
  let service: MockNotificationService
  let authService: MockAuthenticationService
  let mockContext: RequestContext

  beforeEach(() => {
    service = new MockNotificationService({ enabled: true, maxLines: 20, maxLength: 3000 })
    authService = new MockAuthenticationService()
    service.setAuthService(authService as AuthenticationService)

    mockContext = {
      requestId: TEST_REQUEST_ID,
      host: TEST_DOMAIN,
      path: '/v1/messages',
    }
  })

  describe('request type filtering', () => {
    it('should only notify for inference requests', () => {
      // Inference request (2+ system messages)
      const inferenceRequest = new ProxyRequest(
        createInferenceRequest(),
        TEST_DOMAIN,
        TEST_REQUEST_ID
      )
      expect(inferenceRequest.requestType).toBe('inference')

      // Query evaluation request (0-1 system messages)
      const queryRequest = new ProxyRequest(createQueryRequest(), TEST_DOMAIN, 'test-456')
      expect(queryRequest.requestType).toBe('query_evaluation')

      // Quota request
      const quotaRequest = new ProxyRequest(createQuotaRequest(), TEST_DOMAIN, 'test-789')
      expect(quotaRequest.requestType).toBe('quota')
    })

    it('should check if notification should be sent based on request type', () => {
      const inferenceRequest = new ProxyRequest(
        createInferenceRequest(),
        TEST_DOMAIN,
        TEST_REQUEST_ID
      )
      const queryRequest = new ProxyRequest(createQueryRequest(), TEST_DOMAIN, TEST_REQUEST_ID)
      const quotaRequest = new ProxyRequest(createQuotaRequest(), TEST_DOMAIN, TEST_REQUEST_ID)

      expect(service.shouldSendNotificationTest(inferenceRequest, mockContext)).toBe(true)
      expect(service.shouldSendNotificationTest(queryRequest, mockContext)).toBe(false)
      expect(service.shouldSendNotificationTest(quotaRequest, mockContext)).toBe(false)
    })
  })

  describe('notification configuration', () => {
    it('should respect enabled flag', () => {
      const enabledService = new MockNotificationService({
        enabled: true,
        maxLines: 20,
        maxLength: 3000,
      })
      const disabledService = new MockNotificationService({
        enabled: false,
        maxLines: 20,
        maxLength: 3000,
      })

      const request = new ProxyRequest(createInferenceRequest(), TEST_DOMAIN, TEST_REQUEST_ID)

      expect(enabledService.shouldSendNotificationTest(request, mockContext)).toBe(true)
      expect(disabledService.shouldSendNotificationTest(request, mockContext)).toBe(false)
    })

    it('should handle domain-specific slack configuration', async () => {
      authService.setSlackConfig(TEST_DOMAIN, {
        enabled: true,
        webhook_url: 'https://hooks.slack.com/test',
        channel: '#notifications',
      })

      const webhook = await service.getDomainWebhookTest(TEST_DOMAIN)
      expect(webhook).toBeDefined()
      expect(webhook).toHaveProperty('config')
      expect(webhook.config).toMatchObject({
        enabled: true,
        webhook_url: 'https://hooks.slack.com/test',
        channel: '#notifications',
      })

      const noConfigWebhook = await service.getDomainWebhookTest('unknown.domain.com')
      expect(noConfigWebhook).toBeNull()
    })
  })

  describe('message deduplication', () => {
    it('should track and deduplicate messages', () => {
      const request1 = new ProxyRequest(
        createInferenceRequest('Hello Claude'),
        TEST_DOMAIN,
        TEST_REQUEST_ID
      )
      const request2 = new ProxyRequest(
        createInferenceRequest('Hello Claude'),
        TEST_DOMAIN,
        'test-req-124'
      )
      const request3 = new ProxyRequest(
        createInferenceRequest('Different message'),
        TEST_DOMAIN,
        'test-req-125'
      )

      // First request should be sent
      expect(service.shouldSendNotificationTest(request1, mockContext)).toBe(true)

      // Same message should not be sent
      expect(service.shouldSendNotificationTest(request2, mockContext)).toBe(false)

      // Different message should be sent
      expect(service.shouldSendNotificationTest(request3, mockContext)).toBe(true)
    })

    it('should maintain separate deduplication per domain', () => {
      const request1 = new ProxyRequest(createInferenceRequest('Hello'), 'domain1.com', 'req1')
      const request2 = new ProxyRequest(createInferenceRequest('Hello'), 'domain2.com', 'req2')

      const context1 = { ...mockContext, host: 'domain1.com' }
      const context2 = { ...mockContext, host: 'domain2.com' }

      // Same message on different domains should both be sent
      expect(service.shouldSendNotificationTest(request1, context1)).toBe(true)
      expect(service.shouldSendNotificationTest(request2, context2)).toBe(true)
    })
  })

  describe('message formatting', () => {
    it('should format conversation messages correctly', () => {
      const request = new ProxyRequest(
        createInferenceRequest('Hello Claude'),
        TEST_DOMAIN,
        TEST_REQUEST_ID
      )
      const response = new ProxyResponse()

      // Mock the response content
      const mockContent = 'Hello! How can I help you today?'
      response.getTruncatedContent = () => mockContent

      const message = service.buildConversationMessageTest(request, response)

      expect(message).toContain(':bust_in_silhouette: User: Hello Claude')
      expect(message).toContain(':robot_face: Claude: Hello! How can I help you today?')
    })

    it('should format tool calls in messages', () => {
      const request = new ProxyRequest(createInferenceRequest(), TEST_DOMAIN, TEST_REQUEST_ID)
      const response = new ProxyResponse()

      response.getTruncatedContent = () => "I'll help you with that."

      // Add tool calls
      Object.defineProperty(response, 'toolCalls', {
        value: [
          { name: 'Read', input: { file_path: '/home/user/project/src/main.ts' } },
          { name: 'Bash', input: { command: 'npm install express' } },
          {
            name: 'TodoWrite',
            input: {
              todos: [{ status: 'pending' }, { status: 'in_progress' }, { status: 'completed' }],
            },
          },
        ],
        configurable: true,
      })

      const message = service.buildConversationMessageTest(request, response)

      expect(message).toContain(':wrench: Read - Reading file: src/main.ts')
      expect(message).toContain(':wrench: Bash - Running: `npm install express`')
      expect(message).toContain(':wrench: TodoWrite - Tasks: 1 pending, 1 in progress, 1 completed')
    })

    it('should handle tools without formatters', () => {
      const request = new ProxyRequest(createInferenceRequest(), TEST_DOMAIN, TEST_REQUEST_ID)
      const response = new ProxyResponse()

      response.getTruncatedContent = () => 'Response content'

      Object.defineProperty(response, 'toolCalls', {
        value: [
          { name: 'UnknownTool', input: { prompt: 'Do something special' } },
          { name: 'AnotherTool', input: { description: 'Another action' } },
          { name: 'EmptyTool', input: {} },
        ],
        configurable: true,
      })

      const message = service.buildConversationMessageTest(request, response)

      expect(message).toContain(':wrench: UnknownTool - Do something special')
      expect(message).toContain(':wrench: AnotherTool - Another action')
      expect(message).toContain(':wrench: EmptyTool\n')
    })

    it('should handle empty user content', () => {
      const request = new ProxyRequest(createInferenceRequest(''), TEST_DOMAIN, TEST_REQUEST_ID)
      const response = new ProxyResponse()
      response.getTruncatedContent = () => 'Response without user message'

      const message = service.buildConversationMessageTest(request, response)

      expect(message).not.toContain(':bust_in_silhouette: User:')
      expect(message).toContain(':robot_face: Claude: Response without user message')
    })
  })

  describe('cache management', () => {
    it('should limit cache size to prevent memory leaks', () => {
      // Set a message for domain tracking
      service.setPreviousMessageTest('domain1.com', 'Message 1')
      expect(service.getPreviousMessageTest('domain1.com')).toBe('Message 1')

      // Verify unknown domain returns empty string
      expect(service.getPreviousMessageTest('unknown.com')).toBe('')

      // The actual cache size limiting is tested implicitly through
      // the shouldSendNotification method which manages the cache
      const maxDomains = 1005 // More than the max cache size (1000)
      for (let i = 0; i < maxDomains; i++) {
        const request = new ProxyRequest(
          createInferenceRequest(`Message ${i}`),
          `domain${i}.com`,
          `req-${i}`
        )
        const context = { ...mockContext, host: `domain${i}.com` }
        service.shouldSendNotificationTest(request, context)
      }

      // Service should still work correctly after exceeding cache limit
      const testRequest = new ProxyRequest(
        createInferenceRequest('Test after limit'),
        'test-final.com',
        'final-req'
      )
      const testContext = { ...mockContext, host: 'test-final.com' }
      expect(service.shouldSendNotificationTest(testRequest, testContext)).toBe(true)
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete notification flow', async () => {
      // Set up domain webhook
      authService.setSlackConfig(TEST_DOMAIN, {
        enabled: true,
        webhook_url: 'https://hooks.slack.com/test',
        channel: '#test',
      })

      const request = new ProxyRequest(createInferenceRequest(), TEST_DOMAIN, TEST_REQUEST_ID)
      const response = new ProxyResponse()
      response.getTruncatedContent = () => 'Test response'

      // Verify webhook retrieval
      const webhook = await service.getDomainWebhookTest(TEST_DOMAIN)
      expect(webhook).toBeDefined()
      expect(webhook).toHaveProperty('config')
      expect(webhook.config.webhook_url).toBe('https://hooks.slack.com/test')

      // Verify message formatting
      const message = service.buildConversationMessageTest(request, response)
      expect(message).toContain('User:')
      expect(message).toContain('Claude:')

      // Verify deduplication
      expect(service.shouldSendNotificationTest(request, mockContext)).toBe(true)
      expect(service.shouldSendNotificationTest(request, mockContext)).toBe(false)
    })
  })
})
