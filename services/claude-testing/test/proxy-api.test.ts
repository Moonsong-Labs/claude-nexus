import { describe, it, expect, beforeAll } from 'vitest';
import { AITestRunner } from '../lib/test-runner';
import { ProxyClient, MessagesResponseSchema, ErrorResponseSchema } from '../lib/proxy-client';

describe('Claude Proxy API - AI-Generated Tests', () => {
  let testRunner: AITestRunner;
  let proxyClient: ProxyClient;
  let suiteId: string;

  beforeAll(async () => {
    testRunner = new AITestRunner();
    await testRunner.initialize();
    proxyClient = new ProxyClient();
  });

  describe('Messages Endpoint', () => {
    it('should handle AI-generated test cases for /v1/messages', async () => {
      const prompt = `Generate comprehensive test cases for the Claude proxy /v1/messages endpoint.
      
Context:
- This is a proxy for Claude API that forwards requests to Anthropic
- It requires authentication via Bearer token
- It supports streaming and non-streaming responses
- Valid models include: claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307

Include test cases for:
1. Valid message creation request
2. Missing required fields (model, messages)
3. Invalid model name
4. Malformed messages array
5. Invalid authentication
6. Request with system message
7. Request with max_tokens set
8. Empty messages array`;

      const { testCases, suiteId: generatedSuiteId } = await testRunner.getTestCases(prompt);
      suiteId = generatedSuiteId;
      
      console.log(`📝 Generated ${testCases.length} test cases (Suite ID: ${suiteId})`);

      // Execute each test case
      for (const testCase of testCases) {
        console.log(`\n🧪 Running: ${testCase.description}`);
        
        const response = await proxyClient.makeRequest(
          testCase.httpMethod,
          testCase.endpoint,
          testCase.payload,
          testCase.headers
        );

        // Assert status code
        expect(response.status).toBe(testCase.expectedStatusCode);

        // Validate response schema if provided
        if (testCase.expectedResponseSchema) {
          const validation = proxyClient.validateResponse(response, testCase.expectedResponseSchema);
          expect(validation.isValid).toBe(true);
        } else {
          // Use default schemas based on status code
          if (response.status === 200) {
            const validation = proxyClient.validateResponse(response, MessagesResponseSchema);
            if (!validation.isValid) {
              console.log('Response validation errors:', validation.errors);
            }
          } else if (response.status >= 400) {
            const validation = proxyClient.validateResponse(response, ErrorResponseSchema);
            if (!validation.isValid) {
              console.log('Error response validation errors:', validation.errors);
            }
          }
        }
      }
    });
  });

  describe('Token Stats Endpoint', () => {
    it('should handle AI-generated test cases for /token-stats', async () => {
      const prompt = `Generate test cases for the /token-stats endpoint.
      
Context:
- This endpoint returns token usage statistics per domain
- It may require authentication
- Response includes domain statistics with token counts

Include test cases for:
1. Valid request to get token stats
2. Request without authentication (if required)
3. Request with invalid authentication`;

      const { testCases } = await testRunner.getTestCases(prompt);
      
      for (const testCase of testCases) {
        console.log(`\n🧪 Running: ${testCase.description}`);
        
        const response = await proxyClient.makeRequest(
          testCase.httpMethod,
          testCase.endpoint,
          testCase.payload,
          testCase.headers
        );

        expect(response.status).toBe(testCase.expectedStatusCode);
      }
    });
  });
});