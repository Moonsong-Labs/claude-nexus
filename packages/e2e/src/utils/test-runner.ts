import type { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'
import { expect } from 'bun:test'
import type { TestCase, TestRequest } from '../types/test-case.js'

export class E2ETestRunner {
  private variables: Record<string, string> = {}
  private requestResults: Array<{
    requestId: string
    response: any
    dbState: any
  }> = []

  constructor(
    private pool: Pool,
    private proxyUrl: string
  ) {}

  async runTestCase(testCase: TestCase): Promise<void> {
    // Initialize variables
    this.variables = {}
    this.requestResults = []

    if (testCase.variables) {
      for (const [name, type] of Object.entries(testCase.variables)) {
        switch (type) {
          case 'uuid':
            this.variables[name] = uuidv4()
            break
          case 'timestamp':
            this.variables[name] = new Date().toISOString()
            break
          case 'string':
            this.variables[name] = `test_${Date.now()}`
            break
        }
      }
    }

    // Execute requests in sequence
    for (let i = 0; i < testCase.requests.length; i++) {
      const request = testCase.requests[i]

      // Execute request
      const result = await this.executeRequest(request, i)
      this.requestResults.push(result)

      // Validate expectations
      if (request.expectResponse) {
        this.validateResponse(result.response, request.expectResponse, i)
      }

      if (request.expectDatabase) {
        await this.validateDatabaseState(result.dbState, request.expectDatabase, i)
      }

      // Delay if specified
      if (request.delayAfter) {
        await new Promise(resolve => setTimeout(resolve, request.delayAfter))
      }
    }
  }

  private async executeRequest(request: TestRequest, _index: number): Promise<any> {
    const url = `${this.proxyUrl}${request.path || '/v1/messages'}`

    // Replace variables in body
    const body = this.replaceVariables(JSON.stringify(request.body))

    const response = await fetch(url, {
      method: request.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: request.domain,
        Authorization: 'Bearer cnp_test_e2e_key',
        ...request.headers,
      },
      body,
    })

    const responseBody = await response.json()

    // Query database state
    const dbState = await this.queryDatabaseState(request.domain)

    return {
      requestId: dbState?.request_id || null,
      response: {
        status: response.status,
        body: responseBody,
      },
      dbState,
    }
  }

  private async queryDatabaseState(domain: string): Promise<any> {
    // Wait a bit for async storage to complete
    await new Promise(resolve => setTimeout(resolve, 500))

    const result = await this.pool.query(
      `SELECT 
        request_id,
        conversation_id,
        branch_id,
        parent_request_id,
        current_message_hash,
        parent_message_hash,
        system_hash,
        parent_task_request_id,
        is_subtask,
        message_count
      FROM api_requests
      WHERE domain = $1
      ORDER BY timestamp DESC
      LIMIT 1`,
      [domain]
    )

    return result.rows[0] || null
  }

  private replaceVariables(text: string): string {
    return text.replace(/\$([a-zA-Z0-9_]+)/g, (match, varName) => {
      return this.variables[varName] || match
    })
  }

  private validateResponse(actual: any, expected: any, _requestIndex: number): void {
    if (expected.status !== undefined) {
      expect(actual.status).toBe(expected.status)
    }

    if (expected.body !== undefined) {
      // Deep comparison or specific field checks
      expect(actual.body).toMatchObject(expected.body)
    }
  }

  private async validateDatabaseState(
    actual: any,
    expected: any,
    requestIndex: number
  ): Promise<void> {
    if (!actual) {
      throw new Error(`No database record found for request ${requestIndex}`)
    }

    // Validate conversation_id
    if (expected.conversationId !== undefined) {
      const expectedValue = this.resolveExpectedValue(
        expected.conversationId,
        'conversation_id',
        requestIndex
      )
      if (expectedValue !== null) {
        expect(actual.conversation_id).toBe(expectedValue)
      }
    }

    // Validate branch_id
    if (expected.branchId !== undefined) {
      this.validateBranchId(actual.branch_id, expected.branchId)
    }

    // Validate parent_request_id
    if (expected.parentRequestId !== undefined) {
      const expectedValue = this.resolveExpectedValue(
        expected.parentRequestId,
        'request_id',
        requestIndex
      )
      expect(actual.parent_request_id).toBe(expectedValue)
    }

    // Validate other fields
    if (expected.currentMessageHash === '$any') {
      expect(actual.current_message_hash).toBeTruthy()
    }

    if (expected.parentMessageHash === '$null') {
      expect(actual.parent_message_hash).toBeNull()
    } else if (expected.parentMessageHash === '$any') {
      expect(actual.parent_message_hash).toBeTruthy()
    }

    if (expected.isSubtask !== undefined) {
      expect(actual.is_subtask).toBe(expected.isSubtask)
    }

    if (expected.messageCount !== undefined) {
      expect(actual.message_count).toBe(expected.messageCount)
    }
  }

  private resolveExpectedValue(
    expected: string,
    field: string,
    currentIndex: number
  ): string | null {
    if (expected.startsWith('$')) {
      switch (expected) {
        case '$same':
          return currentIndex > 0 ? this.requestResults[currentIndex - 1].dbState[field] : null
        case '$different': {
          const prevValue =
            currentIndex > 0 ? this.requestResults[currentIndex - 1].dbState[field] : null
          expect(this.requestResults[currentIndex].dbState[field]).not.toBe(prevValue)
          return this.requestResults[currentIndex].dbState[field]
        }
        case '$new':
          // Ensure it's different from all previous values
          for (let i = 0; i < currentIndex; i++) {
            expect(this.requestResults[currentIndex].dbState[field]).not.toBe(
              this.requestResults[i].dbState[field]
            )
          }
          return this.requestResults[currentIndex].dbState[field]
        case '$null':
          return null
        case '$previous':
          return currentIndex > 0 ? this.requestResults[currentIndex - 1].dbState.request_id : null
        default: {
          // Handle $request:N format
          const match = expected.match(/^\$request:(\d+)$/)
          if (match) {
            const targetIndex = parseInt(match[1])
            return this.requestResults[targetIndex].dbState.request_id
          }
          // It's a variable reference
          return this.variables[expected.substring(1)] || expected
        }
      }
    }
    return expected
  }

  private validateBranchId(actual: string, expected: string): void {
    if (expected === '$main') {
      expect(actual).toBe('main')
    } else if (expected.includes('*')) {
      // Pattern matching
      const pattern = expected.replace('*', '\\d+')
      expect(actual).toMatch(new RegExp(`^${pattern}$`))
    } else {
      expect(actual).toBe(expected)
    }
  }
}
