#!/usr/bin/env bun
/**
 * Generate TypeScript client from OpenAPI specification
 *
 * This script generates a TypeScript client from the AI Analysis API OpenAPI specification.
 *
 * WARNING: Only run this script when you actually need to use the API client in your code.
 * The generated client should be properly tested and maintained. Do not generate the client
 * unless it will be actively used, as unused generated code adds maintenance burden.
 *
 * Usage:
 *   bun run scripts/generate-api-client.ts
 */

import { promises as fs } from 'fs'
import path from 'path'

const OPENAPI_SPEC = path.join(process.cwd(), 'docs/api/openapi-analysis.yaml')
const OUTPUT_DIR = path.join(process.cwd(), 'packages/shared/src/generated/api-client')

/**
 * Generates a TypeScript API client from the OpenAPI specification
 * Creates a self-contained client with all necessary types and methods
 */
async function generateApiClient() {
  console.log('🚀 Generating TypeScript API client...')

  const clientCode = `/**
 * Auto-generated API client for Claude Nexus Proxy AI Analysis API
 * Generated from: ${OPENAPI_SPEC}
 * Generated on: ${new Date().toISOString()}
 */

export interface CreateAnalysisRequest {
  conversationId: string
  branchId: string
}

export interface CreateAnalysisResponse {
  message: string
  analysisId: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface GetAnalysisResponse {
  id: number
  conversationId: string
  branchId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  content?: string
  data?: ConversationAnalysis
  error?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  tokenUsage: {
    prompt: number | null
    completion: number | null
    total: number
  }
}

export interface RegenerateAnalysisResponse {
  message: string
  analysisId: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface ConversationAnalysis {
  summary: string
  keyTopics: string[]
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  userIntent: string
  outcomes: string[]
  actionItems: string[]
  technicalDetails: {
    frameworks: string[]
    issues: string[]
    solutions: string[]
  }
  conversationQuality: {
    clarity: 'high' | 'medium' | 'low'
    completeness: 'complete' | 'partial' | 'incomplete'
    effectiveness: 'highly effective' | 'effective' | 'needs improvement'
  }
}

export interface ApiClientOptions {
  baseUrl: string
  apiKey: string
  headers?: Record<string, string>
}

export class AnalysisApiClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\\/+$/, '')
    this.headers = {
      'Content-Type': 'application/json',
      'X-Dashboard-Key': options.apiKey,
      ...options.headers,
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(\`\${this.baseUrl}\${path}\`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(\`API Error (\${response.status}): \${JSON.stringify(error)}\`)
    }

    return response.json()
  }

  /**
   * Create a new analysis request
   */
  async createAnalysis(request: CreateAnalysisRequest): Promise<CreateAnalysisResponse> {
    return this.request<CreateAnalysisResponse>('POST', '/api/analyses', request)
  }

  /**
   * Get analysis result
   */
  async getAnalysis(conversationId: string, branchId: string): Promise<GetAnalysisResponse> {
    return this.request<GetAnalysisResponse>(
      'GET',
      \`/api/analyses/\${conversationId}/\${branchId}\`
    )
  }

  /**
   * Regenerate analysis
   */
  async regenerateAnalysis(
    conversationId: string,
    branchId: string
  ): Promise<RegenerateAnalysisResponse> {
    return this.request<RegenerateAnalysisResponse>(
      'POST',
      \`/api/analyses/\${conversationId}/\${branchId}/regenerate\`
    )
  }

  /**
   * Poll for analysis completion
   * @param conversationId - Conversation ID
   * @param branchId - Branch ID
   * @param options - Polling options
   * @returns Completed analysis
   */
  async waitForAnalysis(
    conversationId: string,
    branchId: string,
    options: {
      pollingInterval?: number
      timeout?: number
      onProgress?: (status: string) => void
    } = {}
  ): Promise<GetAnalysisResponse> {
    const { pollingInterval = 2000, timeout = 300000, onProgress } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const analysis = await this.getAnalysis(conversationId, branchId)
      
      if (onProgress) {
        onProgress(analysis.status)
      }

      if (analysis.status === 'completed' || analysis.status === 'failed') {
        return analysis
      }

      await new Promise(resolve => setTimeout(resolve, pollingInterval))
    }

    throw new Error('Analysis timeout exceeded')
  }
}

// Export a factory function for convenience
export function createAnalysisClient(options: ApiClientOptions): AnalysisApiClient {
  return new AnalysisApiClient(options)
}
`

  const clientPath = path.join(OUTPUT_DIR, 'index.ts')

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  // Write the generated client
  await fs.writeFile(clientPath, clientCode)

  // Verify the file was written
  try {
    await fs.access(clientPath)
    console.log('✅ API client generated successfully at:', clientPath)
  } catch (error) {
    throw new Error(`Failed to verify generated client at ${clientPath}`)
  }
}

/**
 * Main execution function
 * Validates prerequisites and generates the API client
 */
async function main() {
  try {
    // Check if OpenAPI spec exists
    try {
      await fs.access(OPENAPI_SPEC)
    } catch (error) {
      console.error('❌ OpenAPI spec not found at:', OPENAPI_SPEC)
      console.error(
        '   Please ensure the OpenAPI specification exists before generating the client'
      )
      process.exit(1)
    }

    // Generate the API client
    await generateApiClient()

    console.log('\n📝 Example usage:')
    console.log(`
import { createAnalysisClient } from '@claude-nexus/shared/generated/api-client'

const client = createAnalysisClient({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.DASHBOARD_API_KEY!,
})

// Create analysis
const { analysisId } = await client.createAnalysis({
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  branchId: 'main',
})

// Wait for completion
const result = await client.waitForAnalysis(
  '123e4567-e89b-12d3-a456-426614174000',
  'main',
  {
    pollingInterval: 3000,
    onProgress: (status) => console.log('Status:', status),
  }
)

console.log('Analysis:', result.data)
`)
  } catch (error) {
    console.error('❌ Error generating client:', error)
    process.exit(1)
  }
}

// Run the script
main()
