/**
 * MCP Prompt detail page route handler
 *
 * Displays detailed information about a specific MCP prompt including:
 * - Prompt ID and name
 * - Description (if available)
 * - Handlebars template content
 * - Usage instructions
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import { layout } from '../layout/index.js'
import { ProxyApiClient } from '../services/api-client.js'
import { promptDetailStyles } from '../styles/prompt-detail.js'
import type { McpPromptDetailResponse } from '../types/mcp-prompts.js'

const promptDetailRoute = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

/**
 * GET /:id - Display prompt details
 *
 * Fetches and displays detailed information about a specific MCP prompt
 * @param id - The prompt ID (typically filename without extension)
 */
promptDetailRoute.get('/:id', async c => {
  const promptId = c.req.param('id')
  const apiClient = c.get('apiClient')

  if (!apiClient) {
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-container">
            <h2>Configuration Error</h2>
            <p>API client not configured. Please check your configuration.</p>
            <a href="/dashboard/prompts" class="btn btn-primary">Back to Prompts</a>
          </div>
          <style>
            ${promptDetailStyles}
          </style>
        `
      )
    )
  }

  try {
    // Fetch prompt details with proper typing
    const { prompt } = await apiClient.get<McpPromptDetailResponse>(`/api/mcp/prompts/${promptId}`)

    // Verify prompt exists in response
    if (!prompt) {
      throw new Error('Prompt data not found in API response')
    }

    const content = html`
      <div>
        <div class="header-section">
          <a href="/dashboard/prompts" class="back-link">← Back to Prompts</a>
          <h2>${prompt.name}</h2>
          ${prompt.description ? html`<p class="subtitle">${prompt.description}</p>` : ''}
        </div>

        <!-- Prompt Info -->
        <div class="info-grid">
          <div class="info-card">
            <h3>Prompt ID</h3>
            <p class="mono">${prompt.promptId}</p>
          </div>
          <div class="info-card">
            <h3>Name</h3>
            <p>${prompt.name}</p>
          </div>
        </div>

        <!-- Content -->
        <div class="section">
          <h3>Prompt Template</h3>
          <div class="content-container">
            <pre><code>${prompt.template}</code></pre>
          </div>
        </div>

        <!-- Template Help -->
        <div class="section">
          <h3>How to Use</h3>
          <p>
            This prompt uses Handlebars templating. Variables are referenced using
            <code>{{variableName}}</code> syntax.
          </p>
          <p>
            Example: If the template contains <code>{{name}}</code>, you would pass
            <code>{ "arguments": { "name": "John" } }</code> when calling the MCP endpoint.
          </p>
        </div>
      </div>

      <style>
        ${promptDetailStyles}
      </style>
    `

    return c.html(layout(`${prompt.name} - MCP Prompt`, content))
  } catch (error) {
    console.error('Error loading prompt detail:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isNotFound = errorMessage.includes('404') || errorMessage.includes('not found')

    return c.html(
      layout(
        'Error',
        html`
          <div class="error-container">
            <h2>${isNotFound ? 'Prompt Not Found' : 'Error Loading Prompt'}</h2>
            <p>${errorMessage}</p>
            <a href="/dashboard/prompts" class="btn btn-primary">Back to Prompts</a>
          </div>
          <style>
            ${promptDetailStyles}
          </style>
        `
      )
    )
  }
})

export { promptDetailRoute }
