import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { getErrorMessage } from '@claude-nexus/shared'
import { parseConversation, calculateCost } from '../utils/conversation.js'
import { layout } from '../layout/index.js'
import { isSparkRecommendation, parseSparkRecommendation } from '../utils/spark.js'
import { renderSparkRecommendationInline } from '../components/spark-recommendation-inline.js'
import { navigationArrows } from '../components/navigation-arrows.js'
import { requestSummary } from '../components/request-summary.js'
import { viewToggle } from '../components/view-toggle.js'
import { getRequestDetailsScripts } from '../scripts/request-details-scripts.js'
import type { RequestDetailsData } from '../types/request-details.js'

export const requestDetailsRoutes = new Hono<{
  Variables: {
    domain?: string
  }
}>()

/**
 * Request details page with conversation view
 */
requestDetailsRoutes.get('/request/:id', async c => {
  const requestId = c.req.param('id')

  // Use storage service directly instead of API client
  const { container } = await import('../container.js')
  const storageService = container.getStorageService()

  try {
    const requestDetails = await storageService.getRequestDetails(requestId)

    if (!requestDetails.request) {
      return c.html(
        layout(
          'Error',
          html` <div class="error-banner"><strong>Error:</strong> Request not found.</div> `
        )
      )
    }

    // Map from storage format to API format
    const details: RequestDetailsData = {
      requestId: requestDetails.request.request_id,
      domain: requestDetails.request.domain,
      model: requestDetails.request.model,
      timestamp: requestDetails.request.timestamp,
      inputTokens: requestDetails.request.input_tokens,
      outputTokens: requestDetails.request.output_tokens,
      totalTokens: requestDetails.request.total_tokens,
      durationMs: requestDetails.request.duration_ms,
      responseStatus: 200, // Not stored in request, default to 200
      error: requestDetails.request.error || null,
      requestType: requestDetails.request.request_type || '',
      conversationId: requestDetails.request.conversation_id || null,
      branchId: requestDetails.request.branch_id || null,
      parentRequestId: requestDetails.request.parent_request_id || null,
      requestBody: requestDetails.request_body,
      responseBody: requestDetails.response_body,
      streamingChunks: requestDetails.chunks.map(chunk => ({
        chunkIndex: chunk.chunk_index,
        timestamp: chunk.timestamp,
        data: chunk.data,
        tokenCount: chunk.token_count || 0,
      })),
      // Fields not in storage but expected by template
      requestHeaders: undefined,
      responseHeaders: undefined,
      telemetry: undefined,
      method: 'POST',
      endpoint: '/v1/messages',
      streaming: requestDetails.chunks.length > 0,
    }

    // Parse conversation data
    const conversation = await parseConversation({
      request_body: details.requestBody,
      response_body: details.responseBody,
      request_tokens: details.inputTokens,
      response_tokens: details.outputTokens,
      model: details.model,
      duration: details.durationMs,
      status_code: details.responseStatus,
      timestamp: details.timestamp,
    })

    // Calculate cost
    const cost = calculateCost(conversation.totalInputTokens, conversation.totalOutputTokens)

    // Detect Spark recommendations
    interface SparkRecommendationInfo {
      sessionId: string
      recommendation: ReturnType<typeof parseSparkRecommendation>
      messageIndex: number
    }
    const sparkRecommendations: SparkRecommendationInfo[] = []

    // Look through raw request/response for Spark tool usage
    if (
      details.requestBody &&
      details.requestBody.messages &&
      Array.isArray(details.requestBody.messages) &&
      details.responseBody
    ) {
      const allMessages = [...details.requestBody.messages, details.responseBody]

      for (let i = 0; i < allMessages.length - 1; i++) {
        const msg = allMessages[i]
        const nextMsg = allMessages[i + 1]

        if (msg.content && Array.isArray(msg.content)) {
          for (const content of msg.content) {
            if (content.type === 'tool_use' && isSparkRecommendation(content)) {
              // Look for corresponding tool_result in next message
              if (nextMsg.content && Array.isArray(nextMsg.content)) {
                const toolResult = nextMsg.content.find((item: unknown) => {
                  if (
                    typeof item === 'object' &&
                    item !== null &&
                    'type' in item &&
                    'tool_use_id' in item
                  ) {
                    const typedItem = item as { type: string; tool_use_id: string }
                    return typedItem.type === 'tool_result' && typedItem.tool_use_id === content.id
                  }
                  return false
                })

                if (toolResult) {
                  const recommendation = parseSparkRecommendation(toolResult, content)
                  if (recommendation) {
                    sparkRecommendations.push({
                      sessionId: recommendation.sessionId,
                      recommendation,
                      messageIndex: i,
                    })
                  }
                }
              }
            }
          }
        }
      }
    }

    // Fetch existing feedback for Spark recommendations if any
    let sparkFeedbackMap: Record<string, unknown> = {}
    if (sparkRecommendations.length > 0) {
      try {
        // Get API client from container for Spark API calls
        const apiClient = container.getApiClient()
        const sessionIds = sparkRecommendations.map(r => r.sessionId)
        const feedbackResponse = await apiClient.post<{ results: Record<string, unknown> }>(
          '/api/spark/feedback/batch',
          {
            session_ids: sessionIds,
          }
        )

        if (feedbackResponse.results) {
          sparkFeedbackMap = feedbackResponse.results
        }
      } catch (error) {
        console.error('Failed to fetch Spark feedback:', error)
      }
    }

    // Track user message indices for navigation (only text/image messages, no tools)
    const userMessageIndices: number[] = []
    conversation.messages
      .slice()
      .reverse()
      .forEach((msg, idx) => {
        if (msg.role === 'user' && !msg.isToolUse && !msg.isToolResult) {
          userMessageIndices.push(idx)
        }
      })

    // Format messages for display - reverse order to show newest first
    const messagesHtml = await Promise.all(
      conversation.messages
        .slice()
        .reverse()
        .map(async (msg, idx) => {
          const messageId = `message-${idx}`
          const contentId = `content-${idx}`
          const truncatedId = `truncated-${idx}`

          // Check if this message contains a Spark recommendation
          let sparkHtml = ''
          if (msg.sparkRecommendation) {
            const feedbackForSession = sparkFeedbackMap[msg.sparkRecommendation.sessionId]
            sparkHtml = await renderSparkRecommendationInline(
              msg.sparkRecommendation.recommendation,
              msg.sparkRecommendation.sessionId,
              idx,
              feedbackForSession
            )

            // Replace the marker in the content with the Spark HTML
            msg.htmlContent = msg.htmlContent.replace(
              `[[SPARK_RECOMMENDATION:${msg.sparkRecommendation.sessionId}]]`,
              sparkHtml
            )
            if (msg.truncatedHtml) {
              msg.truncatedHtml = msg.truncatedHtml.replace(
                `[[SPARK_RECOMMENDATION:${msg.sparkRecommendation.sessionId}]]`,
                '<div class="spark-inline-recommendation"><div class="spark-inline-header"><div class="spark-inline-title"><span class="spark-icon">✨</span><span class="spark-label">Spark Recommendation</span></div></div><div style="padding: 0.5rem 1rem; text-align: center; color: #64748b; font-size: 0.875rem;">Show more to view recommendation</div></div>'
              )
            }
          }

          // Add special classes for tool messages
          let messageClass = `message message-${msg.role}`
          if (msg.isToolUse) {
            messageClass += ' message-tool-use'
          } else if (msg.isToolResult) {
            messageClass += ' message-tool-result'
          }

          // Add special styling for assistant messages
          if (msg.role === 'assistant') {
            messageClass += ' message-assistant-response'
          }

          // Format role display
          let roleDisplay = msg.role.charAt(0).toUpperCase() + msg.role.slice(1)
          if (msg.isToolUse) {
            roleDisplay = 'Tool 🔧'
          } else if (msg.isToolResult) {
            roleDisplay = 'Result ✅'
          }

          // Add navigation buttons for user messages (only text/image content, no tools)
          let navigationButtons = ''
          if (msg.role === 'user' && !msg.isToolUse && !msg.isToolResult) {
            const currentUserIndex = userMessageIndices.indexOf(idx)
            navigationButtons = raw(
              navigationArrows({
                userMessageIndices,
                currentUserIndex,
              })
            )
          }

          return `
        <div class="${messageClass}" id="message-${idx}" data-message-index="${idx}">
          <div class="message-index">${conversation.messages.length - idx}</div>
          <div class="message-meta">
            <div class="message-role">${roleDisplay}</div>
            <div class="message-actions">
              <button class="copy-message-link" data-message-index="${idx}" title="Copy link to this message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </button>
              ${navigationButtons}
            </div>
          </div>
          <div class="message-content">
            ${msg.isToolUse && msg.toolName ? `<span class="tool-name-label">${msg.toolName}</span>` : ''}
            ${
              msg.isLong
                ? `
              <div id="${truncatedId}" class="message-truncated">
                ${msg.truncatedHtml}
                ${
                  msg.hiddenLineCount === -1
                    ? ''
                    : `<span class="show-more-btn" onclick="toggleMessage('${messageId}')">Show more${msg.hiddenLineCount && msg.hiddenLineCount > 0 ? ` (${msg.hiddenLineCount} lines)` : ''}</span>`
                }
              </div>
              <div id="${contentId}" class="hidden">
                ${msg.htmlContent}
                <span class="show-more-btn" onclick="toggleMessage('${messageId}')">Show less</span>
              </div>
            `
                : msg.htmlContent
            }
          </div>
        </div>
      `
        })
    )

    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>

      <!-- Error Banner if present -->
      ${conversation.error
        ? html`
            <div class="error-banner">
              <strong>Error (${conversation.error.statusCode || 'Unknown'}):</strong> ${conversation
                .error.message}
            </div>
          `
        : ''}

      <!-- Request Summary -->
      ${raw(requestSummary({ details, conversation, cost, toolUsage: conversation.toolUsage }))}

      <!-- View Toggle with Controls -->
      ${raw(viewToggle())}

      <!-- Conversation View -->
      <div id="conversation-view" class="conversation-container">
        ${raw(
          messagesHtml
            .map((html, index) => {
              // Add a separator after the first message (the response)
              if (index === 0 && messagesHtml.length > 1) {
                return (
                  html + '<div style="border-bottom: 2px solid #e5e7eb; margin: 1.5rem 0;"></div>'
                )
              }
              return html
            })
            .join('')
        )}
      </div>

      <!-- Raw JSON View (hidden by default) -->
      <div id="raw-view" class="hidden">
        ${details.requestBody
          ? html`
              <div class="section">
                <div class="section-header">
                  Request Body
                  <button
                    class="btn btn-secondary"
                    style="float: right; font-size: 0.75rem; padding: 0.25rem 0.75rem;"
                    onclick="copyJsonToClipboard('request')"
                  >
                    Copy JSON
                  </button>
                </div>
                <div class="section-content" id="request-json-container">
                  <!-- Will be populated by JavaScript with multiple viewers -->
                </div>
              </div>
            `
          : ''}
        ${details.responseBody
          ? html`
              <div class="section">
                <div class="section-header">
                  Response Body
                  <button
                    class="btn btn-secondary"
                    style="float: right; font-size: 0.75rem; padding: 0.25rem 0.75rem;"
                    onclick="copyJsonToClipboard('response')"
                  >
                    Copy JSON
                  </button>
                </div>
                <div class="section-content" id="response-json-container">
                  <!-- Will be populated by JavaScript with multiple viewers -->
                </div>
              </div>
            `
          : ''}
        ${details.streamingChunks?.length > 0
          ? html`
              <div class="section">
                <div class="section-header">
                  Streaming Chunks (${details.streamingChunks.length})
                </div>
                <div class="section-content">
                  <div id="chunks-container" style="max-height: 400px; overflow-y: auto;">
                    ${raw(
                      details.streamingChunks
                        .map(
                          (chunk, i) => `
                  <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: #f9fafb; border-radius: 0.25rem;">
                    <div class="text-sm text-gray-600">Chunk ${chunk.chunkIndex} - ${chunk.tokenCount || 0} tokens</div>
                    <div id="chunk-${i}" style="margin: 0.25rem 0 0 0; background: white; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid #e5e7eb;"></div>
                  </div>
                `
                        )
                        .join('')
                    )}
                  </div>
                </div>
              </div>
            `
          : ''}
      </div>

      <!-- Headers & Metadata View (hidden by default) -->
      <div id="headers-view" class="hidden">
        ${details.requestHeaders
          ? html`
              <div class="section">
                <div class="section-header">Request Headers</div>
                <div class="section-content">
                  <andypf-json-viewer
                    id="request-headers"
                    expand-icon-type="arrow"
                    expanded="true"
                    expand-level="10"
                    theme='{"base00": "#f9fafb", "base01": "#f3f4f6", "base02": "#e5e7eb", "base03": "#d1d5db", "base04": "#9ca3af", "base05": "#374151", "base06": "#1f2937", "base07": "#111827", "base08": "#ef4444", "base09": "#f97316", "base0A": "#eab308", "base0B": "#22c55e", "base0C": "#06b6d4", "base0D": "#3b82f6", "base0E": "#8b5cf6", "base0F": "#ec4899"}'
                  ></andypf-json-viewer>
                </div>
              </div>
            `
          : ''}
        ${details.responseHeaders
          ? html`
              <div class="section">
                <div class="section-header">Response Headers</div>
                <div class="section-content">
                  <andypf-json-viewer
                    id="response-headers"
                    expand-icon-type="arrow"
                    expanded="true"
                    expand-level="10"
                    theme='{"base00": "#f9fafb", "base01": "#f3f4f6", "base02": "#e5e7eb", "base03": "#d1d5db", "base04": "#9ca3af", "base05": "#374151", "base06": "#1f2937", "base07": "#111827", "base08": "#ef4444", "base09": "#f97316", "base0A": "#eab308", "base0B": "#22c55e", "base0C": "#06b6d4", "base0D": "#3b82f6", "base0E": "#8b5cf6", "base0F": "#ec4899"}'
                  ></andypf-json-viewer>
                </div>
              </div>
            `
          : ''}

        <div class="section">
          <div class="section-header">Request Metadata</div>
          <div class="section-content">
            <andypf-json-viewer
              id="request-metadata"
              expand-icon-type="arrow"
              expanded="true"
              expand-level="10"
              theme='{"base00": "#f9fafb", "base01": "#f3f4f6", "base02": "#e5e7eb", "base03": "#d1d5db", "base04": "#9ca3af", "base05": "#374151", "base06": "#1f2937", "base07": "#111827", "base08": "#ef4444", "base09": "#f97316", "base0A": "#eab308", "base0B": "#22c55e", "base0C": "#06b6d4", "base0D": "#3b82f6", "base0E": "#8b5cf6", "base0F": "#ec4899"}'
            ></andypf-json-viewer>
          </div>
        </div>

        ${details.telemetry
          ? html`
              <div class="section">
                <div class="section-header">Telemetry & Performance</div>
                <div class="section-content">
                  <andypf-json-viewer
                    id="telemetry-data"
                    expand-icon-type="arrow"
                    expanded="true"
                    expand-level="10"
                    theme='{"base00": "#f9fafb", "base01": "#f3f4f6", "base02": "#e5e7eb", "base03": "#d1d5db", "base04": "#9ca3af", "base05": "#374151", "base06": "#1f2937", "base07": "#111827", "base08": "#ef4444", "base09": "#f97316", "base0A": "#eab308", "base0B": "#22c55e", "base0C": "#06b6d4", "base0D": "#3b82f6", "base0E": "#8b5cf6", "base0F": "#ec4899"}'
                  ></andypf-json-viewer>
                </div>
              </div>
            `
          : ''}
      </div>

      <!-- JavaScript for request details page -->
      <script>
        ${getRequestDetailsScripts()}
      </script>

      <!-- Hidden data storage -->
      <div style="display: none;">
        <div id="request-data-storage">
          ${details.requestBody ? JSON.stringify(details.requestBody) : 'null'}
        </div>
        <div id="response-data-storage">
          ${details.responseBody ? JSON.stringify(details.responseBody) : 'null'}
        </div>
        <div id="chunks-data-storage">
          ${details.streamingChunks ? JSON.stringify(details.streamingChunks) : '[]'}
        </div>
        <div id="request-headers-storage">
          ${details.requestHeaders ? JSON.stringify(details.requestHeaders) : 'null'}
        </div>
        <div id="response-headers-storage">
          ${details.responseHeaders ? JSON.stringify(details.responseHeaders) : 'null'}
        </div>
        <div id="telemetry-data-storage">
          ${details.telemetry ? JSON.stringify(details.telemetry) : 'null'}
        </div>
        <div id="metadata-storage">
          ${JSON.stringify({
            id: details.requestId || '',
            domain: details.domain || '',
            timestamp: details.timestamp || '',
            method: details.method || 'POST',
            endpoint: details.endpoint || '/v1/messages',
            model: details.model || 'unknown',
            inputTokens: details.inputTokens || 0,
            outputTokens: details.outputTokens || 0,
            totalTokens: (details.inputTokens || 0) + (details.outputTokens || 0),
            durationMs: details.durationMs || 0,
            responseStatus: details.responseStatus || 0,
            streaming: details.streaming === true,
          })}
        </div>
      </div>

      <script>
        // Initialize data from hidden elements
        const requestData = getJsonData('request-data-storage')
        const responseData = getJsonData('response-data-storage')
        const streamingChunks = getJsonData('chunks-data-storage') || []
        const requestHeaders = getJsonData('request-headers-storage')
        const responseHeaders = getJsonData('response-headers-storage')
        const telemetryData = getJsonData('telemetry-data-storage')
        const requestMetadata = getJsonData('metadata-storage')
      </script>
    `

    return c.html(layout('Request Details', content))
  } catch (error) {
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> ${getErrorMessage(error) || 'Failed to load request details'}
          </div>
          <div class="mb-6">
            <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
          </div>
        `
      )
    )
  }
})
