import request from 'supertest';
import { z } from 'zod';

// Response schemas for validation
export const ErrorResponseSchema = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
  }),
});

export const MessagesResponseSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.enum(['assistant']),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })),
  model: z.string(),
  stop_reason: z.string().nullable(),
  stop_sequence: z.string().nullable(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

export class ProxyClient {
  private baseUrl: string;
  private clientApiKey: string;

  constructor() {
    this.baseUrl = process.env.PROXY_API_URL || 'http://proxy:3000';
    
    // Read client API key from Docker secret or environment
    const clientKeyFile = process.env.CLIENT_API_KEY_FILE;
    this.clientApiKey = clientKeyFile
      ? require('fs').readFileSync(clientKeyFile, 'utf-8').trim()
      : process.env.CLIENT_API_KEY || '';
  }

  async makeRequest(
    method: string,
    endpoint: string,
    payload?: any,
    headers?: Record<string, string>
  ) {
    const agent = request(this.baseUrl);
    let req: any;

    switch (method.toUpperCase()) {
      case 'GET':
        req = agent.get(endpoint);
        break;
      case 'POST':
        req = agent.post(endpoint);
        break;
      case 'PUT':
        req = agent.put(endpoint);
        break;
      case 'DELETE':
        req = agent.delete(endpoint);
        break;
      case 'PATCH':
        req = agent.patch(endpoint);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    // Add authorization header if client API key is configured
    if (this.clientApiKey) {
      req = req.set('Authorization', `Bearer ${this.clientApiKey}`);
    }

    // Add custom headers
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        req = req.set(key, value);
      });
    }

    // Add payload for methods that support it
    if (payload && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      req = req.send(payload);
    }

    return req;
  }

  validateResponse(response: any, schema: z.ZodSchema) {
    const result = schema.safeParse(response.body);
    return {
      isValid: result.success,
      errors: result.success ? null : result.error.errors,
      data: result.success ? result.data : null,
    };
  }
}