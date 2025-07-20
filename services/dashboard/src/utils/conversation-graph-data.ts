import type { ConversationRequest } from '../types/conversation.js'
import { ConversationNode, ConversationGraph } from './conversation-graph.js'
import {
  hasUserMessage,
  getLastMessageType,
  calculateContextTokens,
} from './conversation-helpers.js'

interface StorageService {
  getSubtasksForRequest(requestId: string): Promise<any[]>
  countSubtasksForRequests(requestIds: string[]): Promise<number>
}

export interface EnrichedInvocation {
  name?: string
  input?: {
    prompt?: string
    description?: string
    [key: string]: any
  }
  linked_conversation_id?: string
  [key: string]: any
}

export interface RequestDetails {
  messageCount: number
  messageTypes: string[]
}

/**
 * Build request details map from conversation requests
 */
export function buildRequestDetailsMap(
  requests: ConversationRequest[]
): Map<string, RequestDetails> {
  const requestDetailsMap = new Map<string, RequestDetails>()

  requests.forEach((req, index) => {
    // Use the actual message count from the request
    const messageCount = req.message_count || 0

    // Simple type assignment based on position
    const messageTypes: string[] = []
    const isFirst = index === 0
    if (!isFirst) {
      messageTypes.push('user') // Previous user message
    }
    messageTypes.push('assistant') // Current assistant response

    requestDetailsMap.set(req.request_id, {
      messageCount: messageCount,
      messageTypes: messageTypes.slice(-2),
    })
  })

  return requestDetailsMap
}

/**
 * Enrich task invocations with linked conversation IDs
 */
export async function enrichTaskInvocations(
  requests: ConversationRequest[],
  storageService: StorageService
): Promise<Map<string, EnrichedInvocation[]>> {
  const subtasksMap = new Map<string, EnrichedInvocation[]>()

  for (const req of requests) {
    if (
      req.task_tool_invocation &&
      Array.isArray(req.task_tool_invocation) &&
      req.task_tool_invocation.length > 0
    ) {
      const subtasks = await storageService.getSubtasksForRequest(req.request_id)
      if (subtasks.length > 0) {
        // Group sub-tasks by their conversation ID
        const subtasksByConversation = subtasks.reduce(
          (acc, subtask) => {
            const convId = subtask.conversation_id || 'unknown'
            if (!acc[convId]) {
              acc[convId] = []
            }
            acc[convId].push(subtask)
            return acc
          },
          {} as Record<string, any[]>
        )

        // Link sub-task conversations to task invocations
        const enrichedInvocations = req.task_tool_invocation.map((invocation: any) => {
          // Find matching sub-task conversation by checking first message content
          for (const [convId, convSubtasks] of Object.entries(subtasksByConversation)) {
            // Check if any subtask in this conversation matches the invocation prompt
            const matches = convSubtasks.some((st: any) => {
              return st.is_subtask && st.parent_task_request_id === req.request_id
            })
            if (matches) {
              return { ...invocation, linked_conversation_id: convId }
            }
          }
          return invocation
        })

        subtasksMap.set(req.request_id, enrichedInvocations)
      }
    }
  }

  return subtasksMap
}

/**
 * Build conversation graph nodes
 */
export async function buildGraphNodes(
  requests: ConversationRequest[],
  requestDetailsMap: Map<string, RequestDetails>,
  subtasksMap: Map<string, EnrichedInvocation[]>,
  storageService: StorageService
): Promise<ConversationNode[]> {
  const graphNodes: ConversationNode[] = []

  // Note: requestMap is created later in buildConversationGraph function

  // First, add all conversation request nodes
  requests.forEach((req, index) => {
    const details = requestDetailsMap.get(req.request_id) || {
      messageCount: 0,
      messageTypes: [],
    }

    // Get sub-task info
    const enrichedInvocations = subtasksMap.get(req.request_id)
    const hasSubtasks = enrichedInvocations && enrichedInvocations.length > 0
    const subtaskCount = enrichedInvocations?.length || 0

    // Also check raw task_tool_invocation if not in subtasksMap
    const hasTaskInvocation =
      req.task_tool_invocation &&
      Array.isArray(req.task_tool_invocation) &&
      req.task_tool_invocation.length > 0
    const finalHasSubtasks = hasSubtasks || hasTaskInvocation
    const finalSubtaskCount =
      subtaskCount || (hasTaskInvocation ? req.task_tool_invocation.length : 0)

    // Use parent_request_id if available, fallback to hash-based lookup
    let parentId = req.parent_request_id
    if (!parentId && req.parent_message_hash) {
      const parentReq = requests.find(r => r.current_message_hash === req.parent_message_hash)
      parentId = parentReq?.request_id
    }

    const hasUserMsg = hasUserMessage(req)
    const contextTokens = calculateContextTokens(req)
    const { lastMessageType, toolResultStatus } = getLastMessageType(req)

    graphNodes.push({
      id: req.request_id,
      label: `${req.model}`,
      timestamp: new Date(req.timestamp),
      branchId: req.branch_id || 'main',
      parentId: parentId,
      tokens: req.total_tokens,
      model: req.model,
      hasError: !!req.error,
      messageIndex: index + 1,
      messageCount: details.messageCount,
      messageTypes: details.messageTypes,
      isSubtask: req.is_subtask,
      hasSubtasks: finalHasSubtasks,
      subtaskCount: finalSubtaskCount,
      hasUserMessage: hasUserMsg,
      contextTokens: contextTokens,
      lastMessageType: lastMessageType,
      toolResultStatus: toolResultStatus,
    })
  })

  // Track sub-task numbers across the conversation
  let subtaskNumber = 0

  // Now add sub-task summary nodes for requests that spawned tasks
  for (const req of requests) {
    // Check if this request has task invocations
    if (
      req.task_tool_invocation &&
      Array.isArray(req.task_tool_invocation) &&
      req.task_tool_invocation.length > 0
    ) {
      // Get actual sub-task count from database
      const actualSubtaskCount = await storageService.countSubtasksForRequests([req.request_id])

      // Even if actualSubtaskCount is 0, show the task invocations if they exist
      const displayCount = actualSubtaskCount || req.task_tool_invocation.length

      // Increment sub-task number
      subtaskNumber++

      // Try to find the linked conversation ID and prompt from the enriched invocations
      const enrichedInvocations = subtasksMap.get(req.request_id)
      let linkedConversationId = null
      let subtaskPrompt = ''

      if (enrichedInvocations && enrichedInvocations.length > 0) {
        // Look for any invocation with a linked conversation
        const linkedInvocation = enrichedInvocations.find((inv: any) => inv.linked_conversation_id)
        if (linkedInvocation) {
          linkedConversationId = linkedInvocation.linked_conversation_id
          // Get the prompt from the first invocation
          if (linkedInvocation.input?.prompt) {
            subtaskPrompt = linkedInvocation.input.prompt
          }
        } else if (enrichedInvocations[0]?.input?.prompt) {
          // If no linked conversation yet, still get the prompt from first invocation
          subtaskPrompt = enrichedInvocations[0].input.prompt
        }
      }

      // If we don't have a prompt yet, try from the raw task invocations
      if (
        !subtaskPrompt &&
        req.task_tool_invocation &&
        req.task_tool_invocation[0]?.input?.prompt
      ) {
        subtaskPrompt = req.task_tool_invocation[0].input.prompt
      }

      // If we still don't have a linked conversation, try to find it from sub-tasks
      if (!linkedConversationId) {
        const subtasks = await storageService.getSubtasksForRequest(req.request_id)
        if (subtasks.length > 0 && subtasks[0].conversation_id) {
          linkedConversationId = subtasks[0].conversation_id
        }
      }

      // Create a sub-task summary node
      const subtaskNodeId = `${req.request_id}-subtasks`
      graphNodes.push({
        id: subtaskNodeId,
        label: `sub-task ${subtaskNumber} (${displayCount})`,
        timestamp: new Date(req.timestamp),
        branchId: req.branch_id || 'main',
        parentId: req.request_id, // Parent is the request that spawned it
        tokens: 0, // We don't have aggregate token count here
        model: 'sub-tasks',
        hasError: false,
        messageIndex: req.message_count || 0, // Use parent's message count
        messageCount: req.message_count || 0, // Use parent's message count for positioning
        isSubtask: true,
        hasSubtasks: false,
        subtaskCount: displayCount,
        linkedConversationId: linkedConversationId, // Store the linked conversation ID
        subtaskPrompt: subtaskPrompt, // Store the prompt snippet
      })
    }
  }

  return graphNodes
}

/**
 * Build conversation graph
 */
export async function buildConversationGraph(
  requests: ConversationRequest[],
  storageService: StorageService
): Promise<{
  graph: ConversationGraph
  requestMap: Map<string, ConversationRequest>
  subtasksMap: Map<string, EnrichedInvocation[]>
}> {
  const requestDetailsMap = buildRequestDetailsMap(requests)
  const subtasksMap = await enrichTaskInvocations(requests, storageService)
  const graphNodes = await buildGraphNodes(requests, requestDetailsMap, subtasksMap, storageService)

  const graphEdges: Array<{ source: string; target: string }> = []
  const requestMap = new Map(requests.map(req => [req.request_id, req]))

  // Build edges from parent relationships
  graphNodes.forEach(node => {
    if (node.parentId && node.id !== node.parentId) {
      // For sub-task nodes, always add edge
      if (node.model === 'sub-tasks') {
        graphEdges.push({
          source: node.parentId,
          target: node.id,
        })
      } else {
        // For regular nodes, verify parent exists
        const parentExists = graphNodes.some(n => n.id === node.parentId)
        if (parentExists) {
          graphEdges.push({
            source: node.parentId,
            target: node.id,
          })
        }
      }
    }
  })

  const graph: ConversationGraph = {
    nodes: graphNodes,
    edges: graphEdges,
  }

  return { graph, requestMap, subtasksMap }
}
