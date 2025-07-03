import { expect } from 'bun:test'
import { ApiClient, type ProxyResponse } from './apiClient'
import { DatabaseClient } from './dbClient'
import { nanoid } from 'nanoid'

export interface TestStep {
  stepName: string
  request: {
    body: any
  }
  context?: {
    save?: Record<string, string>
  }
  expected: {
    response?: {
      statusCode: number
      body?: any
      headers?: Record<string, any>
    }
    dbState?: {
      table: string
      where?: Record<string, any>
      assert: Record<string, any>
      count?: number
    }
  }
}

export interface TestFixture {
  name: string
  description?: string
  authentication: {
    domain: string
    clientApiKey: string
    claudeApiKey?: string
  }
  steps: TestStep[]
}

export class TestRunner {
  constructor(
    private apiClient: ApiClient,
    private dbClient: DatabaseClient
  ) {}

  async executeTestStep(
    step: TestStep,
    context: Record<string, any>,
    authentication: TestFixture['authentication']
  ): Promise<Record<string, any>> {
    // 1. Interpolate placeholders in request
    const interpolatedRequest = this.interpolateObject(step.request, context)

    // 2. Send request to proxy
    const response = await this.apiClient.sendRequest({
      domain: authentication.domain,
      clientApiKey: authentication.clientApiKey,
      claudeApiKey: authentication.claudeApiKey,
      body: interpolatedRequest.body,
    })

    // Store response metadata in context for validation
    if (response.requestId) {
      context[`${step.stepName}.requestId`] = response.requestId
    }
    if (response.conversationId) {
      context[`${step.stepName}.conversationId`] = response.conversationId
    }
    if (response.branchId) {
      context[`${step.stepName}.branchId`] = response.branchId
    }
    if (response.parentRequestId) {
      context[`${step.stepName}.parentRequestId`] = response.parentRequestId
    }

    // 3. Validate HTTP response
    if (step.expected.response) {
      await this.validateResponse(response, step.expected.response, context)
    }

    // 4. Wait for database persistence (async storage) - only for successful requests
    if (response.requestId && response.statusCode === 200) {
      await this.dbClient.waitForRequest(response.requestId, 5000)
    }

    // 5. Validate database state
    if (step.expected.dbState) {
      await this.validateDbState(step.expected.dbState, context)
    }

    // 6. Extract values to save
    const newContext: Record<string, any> = {}
    if (step.context?.save) {
      for (const [key, path] of Object.entries(step.context.save)) {
        const value = this.extractValue(response, path)
        newContext[key] = value
      }
    }

    return newContext
  }

  private interpolateObject(obj: any, context: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.interpolateString(obj, context)
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObject(item, context))
    }
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value, context)
      }
      return result
    }
    return obj
  }

  private interpolateString(str: string, context: Record<string, any>): any {
    // Handle special keywords
    if (str === 'NEW_UUID') {
      return nanoid()
    }
    if (str === 'NEW_CONVERSATION') {
      return nanoid()
    }

    // Handle REF_STEP references
    const refMatch = str.match(/^REF_STEP:(.+)\.(.+)$/)
    if (refMatch) {
      const [, stepName, field] = refMatch
      const key = `${stepName}.${field}`
      return context[key]
    }

    // Handle ${context.variable} interpolation
    return str.replace(/\$\{context\.([^}]+)\}/g, (match, key) => {
      return context[key] || match
    })
  }

  private async validateResponse(
    actual: ProxyResponse,
    expected: any,
    context: Record<string, any>
  ): Promise<void> {
    // Validate status code
    if (expected.statusCode !== undefined) {
      expect(actual.statusCode).toBe(expected.statusCode)
    }

    // Validate headers
    if (expected.headers) {
      for (const [key, value] of Object.entries(expected.headers)) {
        const actualValue = actual.headers[key.toLowerCase()]
        this.validateValue(actualValue, value, `header.${key}`)
      }
    }

    // Validate body
    if (expected.body) {
      if (actual.body.chunks) {
        // Streaming response validation
        if (expected.stream_chunks_count) {
          this.validateValue(
            actual.body.chunkCount,
            expected.stream_chunks_count,
            'stream_chunks_count'
          )
        }
      } else {
        // Regular response validation
        this.validateObjectProperties(actual.body, expected.body, 'body')
      }
    }
  }

  private async validateDbState(
    expected: any,
    context: Record<string, any>
  ): Promise<void> {
    const table = expected.table
    const whereClause = this.interpolateObject(expected.where || {}, context)
    
    // Validate table name against whitelist to prevent SQL injection
    const ALLOWED_TABLES = ['api_requests', 'streaming_chunks']
    if (!ALLOWED_TABLES.includes(table)) {
      throw new Error(`Invalid table name for DB validation: ${table}. Allowed tables: ${ALLOWED_TABLES.join(', ')}`)
    }
    
    // Build query
    let query = `SELECT * FROM ${table}`
    const params: any[] = []
    
    if (Object.keys(whereClause).length > 0) {
      const conditions = Object.entries(whereClause).map(([key, value], idx) => {
        params.push(value)
        return `${key} = $${idx + 1}`
      })
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    const result = await this.dbClient.executeQuery(query, params)

    // Validate count if specified
    if (expected.count !== undefined) {
      expect(result.rows.length).toBe(expected.count)
    }

    // Validate assertions
    if (expected.assert && result.rows.length > 0) {
      const row = result.rows[0]
      const interpolatedAssertions = this.interpolateObject(expected.assert, context)
      
      for (const [key, expectedValue] of Object.entries(interpolatedAssertions)) {
        this.validateValue(row[key], expectedValue, `${table}.${key}`)
      }
    }
  }

  private validateObjectProperties(
    actual: any,
    expected: any,
    path: string
  ): void {
    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[key]
      this.validateValue(actualValue, expectedValue, `${path}.${key}`)
    }
  }

  private validateValue(actual: any, expected: any, path: string): void {
    // Handle special matchers
    if (typeof expected === 'string') {
      if (expected === 'IS_UUID') {
        expect(actual).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        return
      }
      if (expected === '!IS_NULL') {
        expect(actual).not.toBeNull()
        expect(actual).not.toBeUndefined()
        return
      }
      if (expected === 'IS_NULL') {
        expect(actual).toBeNull()
        return
      }
    }

    // Handle operators
    if (typeof expected === 'object' && expected !== null && 'operator' in expected) {
      const { operator, value } = expected
      switch (operator) {
        case '>=':
          expect(actual).toBeGreaterThanOrEqual(value)
          break
        case '>':
          expect(actual).toBeGreaterThan(value)
          break
        case '<=':
          expect(actual).toBeLessThanOrEqual(value)
          break
        case '<':
          expect(actual).toBeLessThan(value)
          break
        case '!=':
          expect(actual).not.toBe(value)
          break
        default:
          throw new Error(`Unknown operator: ${operator}`)
      }
      return
    }

    // Regular equality check
    expect(actual).toBe(expected)
  }

  private extractValue(response: ProxyResponse, path: string): any {
    const parts = path.split('.')
    let value: any = response

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined
      }
      value = value[part]
    }

    return value
  }
}