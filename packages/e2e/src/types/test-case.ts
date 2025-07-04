export interface TestCase {
  description: string
  skipReason?: string
  variables?: Record<string, 'uuid' | 'timestamp' | 'string'>
  requests: TestRequest[]
}

export interface TestRequest {
  // Request configuration
  domain: string
  path?: string // defaults to /v1/messages
  method?: 'POST' | 'GET' // defaults to POST
  headers?: Record<string, string>
  body: {
    model?: string
    messages: Array<{
      role: 'user' | 'assistant' | 'system'
      content: string | Array<{ type: string; text?: string; [key: string]: any }>
    }>
    system?: string | Array<{ type: string; text?: string; [key: string]: any }>
    [key: string]: any
  }

  // Expected response
  expectResponse?: {
    status?: number
    body?: any
  }

  // Expected database state
  expectDatabase?: {
    conversationId?: string | '$same' | '$different' | '$new' // reference to variable or keyword
    branchId?: string | '$main' | '$branch_*' | '$compact_*' | '$subtask_*' // exact value or pattern
    parentRequestId?: string | '$null' | '$previous' | '$request:N' // null, previous request, or specific request index
    currentMessageHash?: string | '$any' // any non-null value
    parentMessageHash?: string | '$any' | '$null'
    systemHash?: string | '$any' | '$null'
    parentTaskRequestId?: string | '$null' | '$request:N'
    isSubtask?: boolean
    messageCount?: number
  }

  // Delay before next request (ms)
  delayAfter?: number
}
