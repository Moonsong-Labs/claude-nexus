import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { parseConversation, calculateCost, formatMessageTime } from '../utils/conversation.js'
import { formatNumber, formatDuration, escapeHtml } from '../utils/formatters.js'
import { layout } from '../layout/index.js'

export const requestDetailsRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

/**
 * Request details page with conversation view
 */
requestDetailsRoutes.get('/:id', async c => {
  const apiClient = c.get('apiClient')
  const requestId = c.req.param('id')

  if (!apiClient) {
    return c.html(
      layout(
        'Error',
        html` <div class="error-banner"><strong>Error:</strong> API client not configured.</div> `
      )
    )
  }

  try {
    const details = await apiClient.getRequestDetails(requestId)

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

    // Format messages for display - reverse order to show newest first
    const messagesHtml = conversation.messages
      .slice()
      .reverse()
      .map((msg, idx) => {
        const messageId = `message-${idx}`
        const contentId = `content-${idx}`
        const truncatedId = `truncated-${idx}`

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

        return `
        <div class="${messageClass}" id="message-${idx}" data-message-index="${idx}">
          <div class="message-meta">
            <div class="message-time">${formatMessageTime(msg.timestamp)}</div>
            <div class="message-role">${roleDisplay}</div>
            <button class="copy-message-link" data-message-index="${idx}" title="Copy link to this message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </button>
          </div>
          <div class="message-content">
            ${
              msg.isLong
                ? `
              <div id="${truncatedId}" class="message-truncated">
                ${msg.truncatedHtml}
                <span class="show-more-btn" onclick="toggleMessage('${messageId}')">Show more</span>
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
      .join('')

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
      <div class="section">
        <div class="section-header">Request Summary</div>
        <div
          class="section-content"
          style="display: flex; gap: 2rem; align-items: start; flex-wrap: wrap;"
        >
          <!-- Left side: Main details -->
          <div style="flex: 1; min-width: 300px;">
            <dl
              style="display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; font-size: 0.875rem;"
            >
              <dt class="text-gray-600">Request ID:</dt>
              <dd>${details.requestId}</dd>

              ${details.conversationId
                ? `
              <dt class="text-gray-600">Conversation ID:</dt>
              <dd>
                <a href="/dashboard/conversation/${details.conversationId}" 
                   class="font-mono text-blue-600 hover:text-blue-800 hover:underline">
                  ${details.conversationId}
                </a>
              </dd>
              `
                : ''}

              <dt class="text-gray-600">Domain:</dt>
              <dd>${details.domain}</dd>

              <dt class="text-gray-600">Model:</dt>
              <dd>${conversation.model}</dd>

              <dt class="text-gray-600">Timestamp:</dt>
              <dd>${new Date(details.timestamp).toLocaleString()}</dd>

              <dt class="text-gray-600">Tokens:</dt>
              <dd>
                <span class="cost-info" style="font-size: 0.8rem;">
                  <span>Input: ${conversation.totalInputTokens.toLocaleString()}</span>
                  <span>Output: ${conversation.totalOutputTokens.toLocaleString()}</span>
                  <span
                    >Total:
                    ${(
                      conversation.totalInputTokens + conversation.totalOutputTokens
                    ).toLocaleString()}</span
                  >
                </span>
              </dd>

              <dt class="text-gray-600">Cost:</dt>
              <dd>${cost.formattedTotal}</dd>

              <dt class="text-gray-600">Duration:</dt>
              <dd>${conversation.duration ? formatDuration(conversation.duration) : 'N/A'}</dd>

              <dt class="text-gray-600">Status:</dt>
              <dd>${details.responseStatus}</dd>
            </dl>
          </div>

          <!-- Right side: Tool usage badges -->
          ${raw(
            Object.keys(conversation.toolUsage).length > 0
              ? (() => {
                  // Create a stable-sorted list of tools
                  const sortedTools = Object.entries(conversation.toolUsage).sort(
                    ([toolA, countA], [toolB, countB]) =>
                      countB - countA || toolA.localeCompare(toolB)
                  )

                  // Calculate total
                  const totalCalls = sortedTools.reduce((sum, [, count]) => sum + count, 0)

                  // Function to get color based on usage proportion
                  const getColorForProportion = (count: number) => {
                    const proportion = count / totalCalls
                    if (proportion >= 0.3) {
                      // High usage (30%+) - blue tones
                      return {
                        bg: '#dbeafe', // blue-100
                        color: '#1e40af', // blue-800
                        countBg: '#3b82f6', // blue-500
                        countColor: '#ffffff',
                      }
                    } else if (proportion >= 0.15) {
                      // Medium usage (15-30%) - green tones
                      return {
                        bg: '#d1fae5', // green-100
                        color: '#065f46', // green-800
                        countBg: '#10b981', // green-500
                        countColor: '#ffffff',
                      }
                    } else if (proportion >= 0.05) {
                      // Low usage (5-15%) - amber tones
                      return {
                        bg: '#fef3c7', // amber-100
                        color: '#92400e', // amber-800
                        countBg: '#f59e0b', // amber-500
                        countColor: '#ffffff',
                      }
                    } else {
                      // Very low usage (<5%) - gray tones
                      return {
                        bg: '#f3f4f6', // gray-100
                        color: '#374151', // gray-700
                        countBg: '#6b7280', // gray-500
                        countColor: '#ffffff',
                      }
                    }
                  }

                  // Generate tool badges
                  const toolBadges = sortedTools
                    .map(([tool, count]) => {
                      const colors = getColorForProportion(count)
                      const percentage = ((count / totalCalls) * 100).toFixed(0)
                      return `
                <span style="
                  display: inline-block;
                  background-color: ${colors.bg};
                  color: ${colors.color};
                  padding: 0.125rem 0.5rem;
                  margin: 0.125rem;
                  border-radius: 9999px;
                  font-size: 0.75rem;
                  font-weight: 500;
                  white-space: nowrap;
                " title="${escapeHtml(tool)}: ${count} calls (${percentage}%)">
                  ${escapeHtml(tool)}
                  <span style="
                    background-color: ${colors.countBg};
                    color: ${colors.countColor};
                    padding: 0 0.375rem;
                    margin-left: 0.25rem;
                    border-radius: 9999px;
                    font-weight: 600;
                  ">${count}</span>
                </span>
              `
                    })
                    .join('')

                  // Return the full HTML string
                  return `
          <div style="min-width: 200px; max-width: 300px; flex-shrink: 0;">
            <div style="
              display: flex;
              align-items: baseline;
              justify-content: space-between;
              margin-bottom: 0.375rem;
            ">
              <h4 style="margin: 0; font-size: 0.875rem; font-weight: 600; color: #4b5563;">
                Tool Usage
              </h4>
              <span style="font-size: 0.75rem; color: #6b7280;">
                Total: ${totalCalls}
              </span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
              ${toolBadges}
            </div>
          </div>
          `
                })()
              : ''
          )}
        </div>
      </div>

      <!-- View Toggle -->
      <div class="view-toggle">
        <button class="active" onclick="showView('conversation')">Conversation</button>
        <button onclick="showView('raw')">Raw JSON</button>
        <button onclick="showView('headers')">Headers & Metadata</button>
      </div>

      <!-- Conversation View -->
      <div id="conversation-view" class="conversation-container">${raw(messagesHtml)}</div>

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
                <div class="section-content">
                  <div
                    id="request-json"
                    style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto;"
                  ></div>
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
                <div class="section-content">
                  <div
                    id="response-json"
                    style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto;"
                  ></div>
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
                  <div
                    id="request-headers"
                    style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto;"
                  ></div>
                </div>
              </div>
            `
          : ''}
        ${details.responseHeaders
          ? html`
              <div class="section">
                <div class="section-header">Response Headers</div>
                <div class="section-content">
                  <div
                    id="response-headers"
                    style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto;"
                  ></div>
                </div>
              </div>
            `
          : ''}

        <div class="section">
          <div class="section-header">Request Metadata</div>
          <div class="section-content">
            <div
              id="request-metadata"
              style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto;"
            ></div>
          </div>
        </div>

        ${details.telemetry
          ? html`
              <div class="section">
                <div class="section-header">Telemetry & Performance</div>
                <div class="section-content">
                  <div
                    id="telemetry-data"
                    style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto;"
                  ></div>
                </div>
              </div>
            `
          : ''}
      </div>

      <!-- JavaScript for view toggling and message expansion -->
      <script>
        // Store the JSON data in hidden divs to avoid escaping issues
        const getJsonData = id => {
          const el = document.getElementById(id)
          return el ? JSON.parse(el.textContent) : null
        }
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
        // Get the JSON data from hidden elements
        const requestData = getJsonData('request-data-storage')
        const responseData = getJsonData('response-data-storage')
        const streamingChunks = getJsonData('chunks-data-storage') || []
        const requestHeaders = getJsonData('request-headers-storage')
        const responseHeaders = getJsonData('response-headers-storage')
        const telemetryData = getJsonData('telemetry-data-storage')
        const requestMetadata = getJsonData('metadata-storage')

        function showView(view) {
          const conversationView = document.getElementById('conversation-view')
          const rawView = document.getElementById('raw-view')
          const headersView = document.getElementById('headers-view')
          const buttons = document.querySelectorAll('.view-toggle button')

          // Hide all views
          conversationView.classList.add('hidden')
          rawView.classList.add('hidden')
          headersView.classList.add('hidden')

          // Remove active from all buttons
          buttons.forEach(btn => btn.classList.remove('active'))

          if (view === 'conversation') {
            conversationView.classList.remove('hidden')
            buttons[0].classList.add('active')
          } else if (view === 'raw') {
            rawView.classList.remove('hidden')
            buttons[1].classList.add('active')

            // Render JSON using RenderJSON when switching to raw view
            if (typeof renderjson !== 'undefined') {
              // Configure RenderJSON
              renderjson.set_max_string_length(200) // Truncate very long strings
              renderjson.set_sort_objects(true) // Sort object keys

              // Parse and render request body
              if (requestData && document.getElementById('request-json')) {
                const requestContainer = document.getElementById('request-json')
                requestContainer.innerHTML = ''
                try {
                  requestContainer.appendChild(renderjson.set_show_to_level('all')(requestData))
                } catch (e) {
                  console.error('Failed to render request data:', e)
                }
              }

              // Parse and render response body
              if (responseData && document.getElementById('response-json')) {
                const responseContainer = document.getElementById('response-json')
                responseContainer.innerHTML = ''
                try {
                  responseContainer.appendChild(renderjson.set_show_to_level('all')(responseData))
                } catch (e) {
                  console.error('Failed to render response data:', e)
                }
              }

              // Parse and render streaming chunks
              try {
                streamingChunks.forEach((chunk, i) => {
                  const chunkContainer = document.getElementById('chunk-' + i)
                  if (chunkContainer) {
                    chunkContainer.innerHTML = ''
                    try {
                      const chunkData = JSON.parse(chunk.data)
                      chunkContainer.appendChild(renderjson.set_show_to_level('all')(chunkData))
                    } catch (e) {
                      // If not valid JSON, display as text
                      chunkContainer.textContent = chunk.data
                    }
                  }
                })
              } catch (e) {
                console.error('Failed to parse chunks:', e)
              }
            }
          } else if (view === 'headers') {
            headersView.classList.remove('hidden')
            buttons[2].classList.add('active')

            // Render headers and metadata using RenderJSON
            if (typeof renderjson !== 'undefined') {
              renderjson.set_max_string_length(200)
              renderjson.set_sort_objects(true)

              // Render request headers
              if (requestHeaders && document.getElementById('request-headers')) {
                const container = document.getElementById('request-headers')
                container.innerHTML = ''
                try {
                  container.appendChild(renderjson.set_show_to_level('all')(requestHeaders))
                } catch (e) {
                  console.error('Failed to render request headers:', e)
                }
              }

              // Render response headers
              if (responseHeaders && document.getElementById('response-headers')) {
                const container = document.getElementById('response-headers')
                container.innerHTML = ''
                try {
                  container.appendChild(renderjson.set_show_to_level('all')(responseHeaders))
                } catch (e) {
                  console.error('Failed to render response headers:', e)
                }
              }

              // Render request metadata
              const metadataContainer = document.getElementById('request-metadata')
              if (metadataContainer) {
                metadataContainer.innerHTML = ''
                metadataContainer.appendChild(renderjson.set_show_to_level('all')(requestMetadata))
              }

              // Render telemetry data
              if (telemetryData && document.getElementById('telemetry-data')) {
                const container = document.getElementById('telemetry-data')
                container.innerHTML = ''
                try {
                  container.appendChild(renderjson.set_show_to_level('all')(telemetryData))
                } catch (e) {
                  console.error('Failed to render telemetry data:', e)
                }
              }
            }
          }
        }

        function toggleMessage(messageId) {
          const idx = messageId.split('-')[1]
          const content = document.getElementById('content-' + idx)
          const truncated = document.getElementById('truncated-' + idx)

          if (content.classList.contains('hidden')) {
            content.classList.remove('hidden')
            truncated.classList.add('hidden')
          } else {
            content.classList.add('hidden')
            truncated.classList.remove('hidden')
          }
        }

        // Copy JSON to clipboard
        function copyJsonToClipboard(type) {
          let data
          if (type === 'request') {
            data = requestData
          } else if (type === 'response') {
            data = responseData
          }

          if (data) {
            const jsonString = JSON.stringify(data, null, 2)
            navigator.clipboard
              .writeText(jsonString)
              .then(() => {
                // Find the button that was clicked and update its text
                const buttons = document.querySelectorAll('button')
                buttons.forEach(btn => {
                  if (btn.onclick && btn.onclick.toString().includes("'" + type + "'")) {
                    const originalText = btn.textContent
                    btn.textContent = 'Copied!'
                    btn.style.background = '#10b981'
                    setTimeout(() => {
                      btn.textContent = originalText
                      btn.style.background = ''
                    }, 2000)
                  }
                })
              })
              .catch(err => {
                console.error('Failed to copy to clipboard:', err)
                alert('Failed to copy to clipboard')
              })
          }
        }

        // Initialize syntax highlighting
        document.addEventListener('DOMContentLoaded', function () {
          hljs.highlightAll()
        })
      </script>
    `

    return c.html(
      layout('Request Details', content, '<script src="/message-selection.js" defer></script>')
    )
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
