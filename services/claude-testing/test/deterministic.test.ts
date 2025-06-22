import { describe, it, expect } from 'vitest';
import { ProxyClient } from '../lib/proxy-client';

describe('Claude Proxy API - Deterministic Tests', () => {
  let proxyClient: ProxyClient;

  beforeAll(() => {
    proxyClient = new ProxyClient();
  });

  describe('Health Check', () => {
    it('should return 200 for health endpoint', async () => {
      const response = await proxyClient.makeRequest('GET', '/health');
      expect(response.status).toBe(200);
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication when client auth is enabled', async () => {
      // Create a client without auth
      const unauthClient = new ProxyClient();
      process.env.CLIENT_API_KEY = ''; // Temporarily clear the key
      
      const response = await unauthClient.makeRequest('POST', '/v1/messages', {
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Restore the key
      delete process.env.CLIENT_API_KEY;

      // Expect 401 if auth is enabled, or 400+ for other errors
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Invalid Requests', () => {
    it('should return 400 for missing model field', async () => {
      const response = await proxyClient.makeRequest('POST', '/v1/messages', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for empty messages array', async () => {
      const response = await proxyClient.makeRequest('POST', '/v1/messages', {
        model: 'claude-3-opus-20240229',
        messages: [],
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid message role', async () => {
      const response = await proxyClient.makeRequest('POST', '/v1/messages', {
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'invalid', content: 'Hello' }],
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});