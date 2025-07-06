import { Hono } from 'hono'
import { html } from 'hono/html'
import {
  getErrorMessage,
  type CreateAnalysisRequest,
  type GetAnalysisResponse,
} from '@claude-nexus/shared'
import { container } from '../../container.js'
import { logger } from '../../middleware/logger.js'
import { escapeHtml, escapeHtmlArray } from '../../utils/html.js'
import { csrfProtection } from '../../middleware/csrf.js'

import { ProxyApiClient } from '../../services/api-client.js'

// SVG Icons for analysis sections
const ICONS = {
  summary: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /></svg>`,
  keyTopics: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>`,
  sentiment: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
  actionItems: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>`,
  outcomes: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>`,
  userIntent: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>`,
  technicalDetails: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>`,
  conversationQuality: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`,
}

export const analysisPartialsRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    csrfToken?: string
  }
}>()

// Apply CSRF protection to all routes
analysisPartialsRoutes.use('*', csrfProtection())

/**
 * Get the current status of an analysis and render the appropriate partial
 */
analysisPartialsRoutes.get('/status/:conversationId/:branchId', async c => {
  const { conversationId, branchId } = c.req.param()
  const pollCount = parseInt(c.req.query('pollCount') || '0')
  const apiClient = c.get('apiClient') || container.getApiClient()

  try {
    // Get analysis status from API
    const response = await apiClient.get<GetAnalysisResponse>(
      `/api/analyses/${conversationId}/${branchId}`
    )

    // Log the response for debugging
    logger.debug('Analysis status response', {
      metadata: {
        conversationId,
        branchId,
        status: response.status,
        hasContent: !!response.content,
        hasData: !!response.data,
      },
    })

    // Skip this check - we'll handle it in the switch statement below

    // Render appropriate state based on status
    switch (response.status) {
      case 'pending':
      case 'processing':
        return c.html(renderProcessingPanel(conversationId, branchId, pollCount))
      case 'completed':
        return c.html(renderCompletedPanel(conversationId, branchId, response))
      case 'failed':
        return c.html(renderFailedPanel(conversationId, branchId, response.error))
      default:
        return c.html(renderIdlePanel(conversationId, branchId))
    }
  } catch (error: any) {
    // If it's a 404, the analysis doesn't exist yet - show idle panel
    if (error?.status === 404) {
      return c.html(renderIdlePanel(conversationId, branchId))
    }

    logger.error('Failed to get analysis status', {
      error: getErrorMessage(error),
      metadata: {
        conversationId,
        branchId,
      },
    })
    return c.html(renderErrorPanel('Failed to load analysis status'))
  }
})

/**
 * Handle analysis generation request
 */
analysisPartialsRoutes.post('/generate/:conversationId/:branchId', async c => {
  const { conversationId, branchId } = c.req.param()
  const apiClient = c.get('apiClient') || container.getApiClient()

  try {
    // Create analysis request
    const requestData: CreateAnalysisRequest = {
      conversationId,
      branchId,
    }

    try {
      await apiClient.post('/api/analyses', requestData)
      // Analysis created successfully - show processing state
      return c.html(renderProcessingPanel(conversationId, branchId, 0))
    } catch (postError: any) {
      // Check if it's a 409 conflict
      if (postError?.status === 409 && postError?.data) {
        interface ConflictErrorData {
          analysis: GetAnalysisResponse
        }
        const conflictData = postError.data as ConflictErrorData
        const analysis = conflictData.analysis

        if (analysis.status === 'pending' || analysis.status === 'processing') {
          return c.html(renderProcessingPanel(conversationId, branchId, 0))
        } else if (analysis.status === 'completed') {
          return c.html(renderCompletedPanel(conversationId, branchId, analysis))
        }
      }
      throw postError
    }
  } catch (error) {
    logger.error('Failed to generate analysis', {
      error: getErrorMessage(error),
      metadata: {
        conversationId,
        branchId,
      },
    })
    return c.html(renderFailedPanel(conversationId, branchId, 'Failed to generate analysis'))
  }
})

/**
 * Handle analysis regeneration request
 */
analysisPartialsRoutes.post('/regenerate/:conversationId/:branchId', async c => {
  const { conversationId, branchId } = c.req.param()
  const apiClient = c.get('apiClient') || container.getApiClient()

  try {
    // Regenerate analysis
    await apiClient.post(`/api/analyses/${conversationId}/${branchId}/regenerate`, {})

    // Show processing state
    return c.html(renderProcessingPanel(conversationId, branchId, 0))
  } catch (error) {
    logger.error('Failed to regenerate analysis', {
      error: getErrorMessage(error),
      metadata: {
        conversationId,
        branchId,
      },
    })
    return c.html(renderFailedPanel(conversationId, branchId, 'Failed to regenerate analysis'))
  }
})

// Render functions for different states

function renderIdlePanel(conversationId: string, branchId: string) {
  return html`
    <div id="analysis-panel" class="section">
      <div class="section-header" style="display: flex; align-items: center; gap: 0.75rem;">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #1f2937;">
          AI Analysis
        </h3>
      </div>
      <div class="section-content">
        <p style="color: #6b7280; margin-bottom: 1.5rem; line-height: 1.6;">
          Get AI-powered insights for this conversation branch to understand patterns, key topics,
          and actionable recommendations.
        </p>
        <button
          hx-post="/partials/analysis/generate/${conversationId}/${branchId}"
          hx-target="#analysis-panel"
          hx-swap="outerHTML"
          class="btn"
          style="display: inline-flex; align-items: center; gap: 0.5rem;"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Generate AI Analysis
        </button>
      </div>
    </div>
  `
}

function renderProcessingPanel(conversationId: string, branchId: string, pollCount: number = 0) {
  // Progressive backoff: 2s, 3s, 5s, 10s, then every 10s
  const pollIntervals = [2, 3, 5, 10, 10]
  const interval = pollIntervals[Math.min(pollCount, pollIntervals.length - 1)]

  return html`
    <div
      id="analysis-panel"
      class="section"
      hx-get="/partials/analysis/status/${conversationId}/${branchId}?pollCount=${pollCount + 1}"
      hx-trigger="delay:${interval}s"
      hx-swap="outerHTML"
    >
      <div class="section-header" style="display: flex; align-items: center; gap: 0.75rem;">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #1f2937;">
          AI Analysis
        </h3>
      </div>
      <div class="section-content">
        <div style="display: flex; align-items: center; gap: 0.75rem; color: #6b7280;">
          <span class="spinner"></span>
          <span>Analysis in progress... This may take a moment.</span>
        </div>
        <div style="margin-top: 1.5rem; padding: 1rem; background: #f9fafb; border-radius: 0.5rem;">
          <p style="font-size: 0.875rem; color: #6b7280; margin: 0;">
            The AI is analyzing the conversation to extract insights, identify patterns, and provide
            actionable recommendations.
          </p>
        </div>
      </div>
    </div>
  `
}

// Helper function to render a section with consistent styling
function renderAnalysisSection(icon: string, title: string, content: any): string {
  if (!content) {
    return ''
  }

  return `
    <div style="background: #f9fafb; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
        <div style="flex-shrink: 0; margin-top: 0.125rem;">${icon}</div>
        <div style="flex: 1;">
          <h4 style="font-size: 0.875rem; font-weight: 600; color: #374151; margin: 0 0 0.5rem 0;">${title}</h4>
          <div style="color: #4b5563; font-size: 0.875rem; line-height: 1.6;">
            ${content}
          </div>
        </div>
      </div>
    </div>
  `
}

function renderCompletedPanel(
  conversationId: string,
  branchId: string,
  analysisResponse: GetAnalysisResponse
) {
  const formatDate = (date: string | Date) => {
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Check if we have analysis data
  if (!analysisResponse.data && !analysisResponse.content) {
    return renderIdlePanel(conversationId, branchId)
  }

  const analysisData = analysisResponse.data

  return html`
    <div id="analysis-panel" class="section">
      <div
        class="section-header"
        style="display: flex; justify-content: space-between; align-items: center;"
      >
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #1f2937;">
            AI Analysis
          </h3>
        </div>
        <button
          hx-post="/partials/analysis/regenerate/${conversationId}/${branchId}"
          hx-target="#analysis-panel"
          hx-swap="outerHTML"
          class="btn btn-secondary"
          style="font-size: 0.875rem; padding: 0.375rem 0.75rem; display: inline-flex; align-items: center; gap: 0.375rem;"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Regenerate
        </button>
      </div>
      <div class="section-content">
        ${analysisData?.summary
          ? renderAnalysisSection(
              ICONS.summary,
              'Summary',
              html`<p style="margin: 0;">${escapeHtml(analysisData.summary)}</p>`
            )
          : ''}
        ${analysisData?.keyTopics && analysisData.keyTopics.length > 0
          ? renderAnalysisSection(
              ICONS.keyTopics,
              'Key Topics',
              html`
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                  ${escapeHtmlArray(analysisData.keyTopics).map(
                    (topic: string) => html`
                      <span
                        style="display: inline-block; background: #e5e7eb; color: #374151; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.813rem;"
                      >
                        ${topic}
                      </span>
                    `
                  )}
                </div>
              `
            )
          : ''}
        ${analysisData?.sentiment
          ? renderAnalysisSection(
              ICONS.sentiment,
              'Sentiment',
              html`<p style="margin: 0;">${escapeHtml(analysisData.sentiment)}</p>`
            )
          : ''}
        ${analysisData?.actionItems && analysisData.actionItems.length > 0
          ? renderAnalysisSection(
              ICONS.actionItems,
              'Action Items',
              html`
                <ul style="margin: 0; padding-left: 1.25rem; list-style-type: disc;">
                  ${escapeHtmlArray(analysisData.actionItems).map(
                    (item: string) => html`<li style="margin-bottom: 0.375rem;">${item}</li>`
                  )}
                </ul>
              `
            )
          : ''}
        ${analysisData?.outcomes && analysisData.outcomes.length > 0
          ? renderAnalysisSection(
              ICONS.outcomes,
              'Outcomes',
              html`
                <ul style="margin: 0; padding-left: 1.25rem; list-style-type: disc;">
                  ${escapeHtmlArray(analysisData.outcomes).map(
                    (outcome: string) => html`<li style="margin-bottom: 0.375rem;">${outcome}</li>`
                  )}
                </ul>
              `
            )
          : ''}
        ${analysisData?.userIntent
          ? renderAnalysisSection(
              ICONS.userIntent,
              'User Intent',
              html`<p style="margin: 0;">${escapeHtml(analysisData.userIntent)}</p>`
            )
          : ''}
        ${analysisData?.technicalDetails &&
        (analysisData.technicalDetails.frameworks.length > 0 ||
          analysisData.technicalDetails.issues.length > 0 ||
          analysisData.technicalDetails.solutions.length > 0)
          ? renderAnalysisSection(
              ICONS.technicalDetails,
              'Technical Details',
              html`
                ${analysisData.technicalDetails.frameworks.length > 0
                  ? html`
                      <div style="margin-bottom: 0.875rem;">
                        <h5
                          style="font-size: 0.813rem; font-weight: 600; color: #6b7280; margin: 0 0 0.375rem 0;"
                        >
                          Frameworks & Technologies
                        </h5>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.375rem;">
                          ${escapeHtmlArray(analysisData.technicalDetails.frameworks).map(
                            (framework: string) => html`
                              <span
                                style="display: inline-block; background: #ddd6fe; color: #5b21b6; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem;"
                              >
                                ${framework}
                              </span>
                            `
                          )}
                        </div>
                      </div>
                    `
                  : ''}
                ${analysisData.technicalDetails.issues.length > 0
                  ? html`
                      <div style="margin-bottom: 0.875rem;">
                        <h5
                          style="font-size: 0.813rem; font-weight: 600; color: #6b7280; margin: 0 0 0.375rem 0;"
                        >
                          Issues Encountered
                        </h5>
                        <ul style="margin: 0; padding-left: 1.25rem; list-style-type: disc;">
                          ${escapeHtmlArray(analysisData.technicalDetails.issues).map(
                            (issue: string) =>
                              html`<li style="margin-bottom: 0.25rem; font-size: 0.813rem;">
                                ${issue}
                              </li>`
                          )}
                        </ul>
                      </div>
                    `
                  : ''}
                ${analysisData.technicalDetails.solutions.length > 0
                  ? html`
                      <div>
                        <h5
                          style="font-size: 0.813rem; font-weight: 600; color: #6b7280; margin: 0 0 0.375rem 0;"
                        >
                          Solutions
                        </h5>
                        <ul style="margin: 0; padding-left: 1.25rem; list-style-type: disc;">
                          ${escapeHtmlArray(analysisData.technicalDetails.solutions).map(
                            (solution: string) =>
                              html`<li style="margin-bottom: 0.25rem; font-size: 0.813rem;">
                                ${solution}
                              </li>`
                          )}
                        </ul>
                      </div>
                    `
                  : ''}
              `
            )
          : ''}
        ${analysisData?.conversationQuality
          ? renderAnalysisSection(
              ICONS.conversationQuality,
              'Conversation Quality',
              html`
                <div
                  style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;"
                >
                  <div
                    style="background: white; padding: 0.75rem; border-radius: 0.375rem; border: 1px solid #e5e7eb;"
                  >
                    <span style="font-size: 0.75rem; color: #6b7280; display: block;">Clarity</span>
                    <span
                      style="font-size: 0.875rem; font-weight: 600; color: #1f2937; text-transform: capitalize;"
                    >
                      ${analysisData.conversationQuality.clarity}
                    </span>
                  </div>
                  <div
                    style="background: white; padding: 0.75rem; border-radius: 0.375rem; border: 1px solid #e5e7eb;"
                  >
                    <span style="font-size: 0.75rem; color: #6b7280; display: block;"
                      >Completeness</span
                    >
                    <span
                      style="font-size: 0.875rem; font-weight: 600; color: #1f2937; text-transform: capitalize;"
                    >
                      ${analysisData.conversationQuality.completeness}
                    </span>
                  </div>
                  <div
                    style="background: white; padding: 0.75rem; border-radius: 0.375rem; border: 1px solid #e5e7eb;"
                  >
                    <span style="font-size: 0.75rem; color: #6b7280; display: block;"
                      >Effectiveness</span
                    >
                    <span
                      style="font-size: 0.875rem; font-weight: 600; color: #1f2937; text-transform: capitalize;"
                    >
                      ${analysisData.conversationQuality.effectiveness}
                    </span>
                  </div>
                </div>
              `
            )
          : ''}
        ${!analysisData && analysisResponse.content
          ? html`
              <div style="background: #f9fafb; border-radius: 0.5rem; padding: 1rem;">
                <p
                  style="color: #4b5563; white-space: pre-wrap; margin: 0; font-size: 0.875rem; line-height: 1.6;"
                >
                  ${escapeHtml(analysisResponse.content) || 'No analysis content available.'}
                </p>
              </div>
            `
          : ''}
        ${!analysisData && !analysisResponse.content
          ? html`
              <div style="text-align: center; padding: 2rem; color: #9ca3af;">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  style="height: 3rem; width: 3rem; margin: 0 auto 0.5rem auto;"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p style="font-size: 0.875rem;">No analysis content available.</p>
              </div>
            `
          : ''}

        <div
          style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #9ca3af;"
        >
          <div
            style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;"
          >
            <div style="display: flex; align-items: center; gap: 0.375rem;">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span
                >Generated:
                ${formatDate(analysisResponse.completedAt || analysisResponse.updatedAt)}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderFailedPanel(conversationId: string, branchId: string, errorMessage?: string | null) {
  return html`
    <div id="analysis-panel" class="section">
      <div class="section-header" style="display: flex; align-items: center; gap: 0.75rem;">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #1f2937;">
          AI Analysis Failed
        </h3>
      </div>
      <div class="section-content">
        <div
          style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.5rem;"
        >
          <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-red-600 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p style="font-weight: 600; color: #b91c1c; margin: 0;">Analysis Failed</p>
              ${errorMessage
                ? html`<p style="margin: 0.5rem 0 0 0; color: #991b1b; font-size: 0.875rem;">
                    ${escapeHtml(errorMessage)}
                  </p>`
                : html`<p style="margin: 0.5rem 0 0 0; color: #991b1b; font-size: 0.875rem;">
                    An error occurred while analyzing the conversation.
                  </p>`}
            </div>
          </div>
        </div>
        <button
          hx-post="/partials/analysis/generate/${conversationId}/${branchId}"
          hx-target="#analysis-panel"
          hx-swap="outerHTML"
          class="btn"
          style="display: inline-flex; align-items: center; gap: 0.5rem;"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  `
}

function renderErrorPanel(message: string) {
  return html`
    <div id="analysis-panel" class="section">
      <div class="section-header" style="display: flex; align-items: center; gap: 0.75rem;">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #1f2937;">Error</h3>
      </div>
      <div class="section-content">
        <div
          style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.5rem; padding: 1rem;"
        >
          <p style="color: #991b1b; margin: 0; font-size: 0.875rem;">${escapeHtml(message)}</p>
        </div>
      </div>
    </div>
  `
}
