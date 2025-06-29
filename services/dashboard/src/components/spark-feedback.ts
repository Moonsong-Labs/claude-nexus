import { html, raw } from 'hono/html'
import { escapeHtml } from '../utils/formatters.js'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import {
  type SparkRecommendation,
  getRecommendationSections,
  getRecommendationSources,
} from '../utils/spark.js'

// Feedback form interface for future use
// interface FeedbackFormData {
//   sessionId: string
//   rating: number
//   comments: string
//   sectionFeedbacks?: Array<{
//     sectionId: string
//     rating: number
//     comments: string
//   }>
// }

/**
 * Render a Spark recommendation with feedback UI
 */
export async function renderSparkRecommendation(
  recommendation: SparkRecommendation,
  requestId: string,
  existingFeedback?: any
): Promise<any> {
  const sections = getRecommendationSections(recommendation)
  const sources = getRecommendationSources(recommendation)
  const hasFeedback = !!existingFeedback

  // Render markdown content
  const dirtyHtml = await marked.parse(recommendation.response)
  const htmlContent = sanitizeHtml(dirtyHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'pre',
      'code',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      code: ['class'],
      pre: ['class'],
      td: ['align'],
      th: ['align'],
    },
  })

  // Check if content is long (more than 500 chars of markdown)
  const isLong = recommendation.response.length > 500
  const contentId = `spark-content-${recommendation.sessionId}`
  const truncatedId = `spark-truncated-${recommendation.sessionId}`

  return html`
    <div class="spark-recommendation" data-session-id="${recommendation.sessionId}">
      <!-- Recommendation Header -->
      <div class="spark-header">
        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
          <span>🎯 Spark Recommendation</span>
          ${hasFeedback ? raw('<span class="feedback-badge">✅ Feedback Submitted</span>') : ''}
        </h3>
        <div class="spark-meta">
          <span style="font-size: 0.75rem; color: #6b7280;">
            Session: <code>${recommendation.sessionId}</code>
          </span>
        </div>
      </div>

      <!-- Query and Context -->
      ${recommendation.query || recommendation.context
        ? html`
            <div class="spark-request-info">
              ${recommendation.query
                ? html`
                    <div class="request-field">
                      <strong>Query:</strong>
                      <div class="request-value">${escapeHtml(recommendation.query)}</div>
                    </div>
                  `
                : ''}
              ${recommendation.context
                ? html`
                    <div class="request-field">
                      <strong>Context:</strong>
                      <div class="request-value">
                        ${Array.isArray(recommendation.context)
                          ? raw(recommendation.context.map(c => escapeHtml(c)).join('<br>'))
                          : escapeHtml(recommendation.context)}
                      </div>
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}

      <!-- Recommendation Content -->
      <div class="spark-content markdown-content">
        ${isLong
          ? html`
              <div id="${truncatedId}">
                <div style="max-height: 300px; overflow: hidden; position: relative;">
                  ${raw(htmlContent)}
                  <div
                    style="position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(to bottom, transparent, #f9fafb);"
                  ></div>
                </div>
                <button
                  class="show-more-btn"
                  onclick="toggleSparkContent('${recommendation.sessionId}')"
                >
                  Show more
                </button>
              </div>
              <div id="${contentId}" style="display: none;">
                ${raw(htmlContent)}
                <button
                  class="show-more-btn"
                  onclick="toggleSparkContent('${recommendation.sessionId}')"
                >
                  Show less
                </button>
              </div>
            `
          : raw(htmlContent)}
      </div>

      <!-- Feedback Section -->
      <div class="spark-feedback-section" id="feedback-${recommendation.sessionId}">
        ${hasFeedback
          ? renderExistingFeedback(existingFeedback)
          : renderFeedbackForm(recommendation.sessionId, sections, sources)}
      </div>
    </div>

    <style>
      .spark-recommendation {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1rem;
        margin: 1rem 0;
        background: #f9fafb;
      }

      .spark-header {
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #e5e7eb;
      }

      .spark-meta {
        margin-top: 0.25rem;
      }

      .feedback-badge {
        background: #10b981;
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .spark-request-info {
        margin: 1rem 0;
        padding: 0.75rem;
        background: #f3f4f6;
        border-radius: 0.375rem;
        font-size: 0.875rem;
      }

      .request-field {
        margin-bottom: 0.5rem;
      }

      .request-field:last-child {
        margin-bottom: 0;
      }

      .request-value {
        margin-top: 0.25rem;
        padding: 0.5rem;
        background: white;
        border-radius: 0.25rem;
        border: 1px solid #e5e7eb;
      }

      .spark-content {
        margin-bottom: 1rem;
        padding: 1rem;
        background: white;
        border-radius: 0.25rem;
      }

      .spark-content.markdown-content h1,
      .spark-content.markdown-content h2,
      .spark-content.markdown-content h3,
      .spark-content.markdown-content h4,
      .spark-content.markdown-content h5,
      .spark-content.markdown-content h6 {
        margin-top: 1rem;
        margin-bottom: 0.5rem;
      }

      .spark-content.markdown-content p {
        margin-bottom: 0.75rem;
      }

      .spark-content.markdown-content pre {
        background: #1e293b;
        color: #e2e8f0;
        padding: 1rem;
        border-radius: 0.375rem;
        overflow-x: auto;
        margin-bottom: 0.75rem;
      }

      .spark-content.markdown-content code {
        background: #e5e7eb;
        padding: 0.125rem 0.25rem;
        border-radius: 0.25rem;
        font-size: 0.875em;
      }

      .spark-content.markdown-content pre code {
        background: transparent;
        padding: 0;
      }

      .spark-content.markdown-content table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0.75rem;
      }

      .spark-content.markdown-content th,
      .spark-content.markdown-content td {
        border: 1px solid #e5e7eb;
        padding: 0.5rem;
        text-align: left;
      }

      .spark-content.markdown-content th {
        background: #f3f4f6;
        font-weight: 600;
      }

      .show-more-btn {
        display: block;
        width: 100%;
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        color: #3b82f6;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
      }

      .show-more-btn:hover {
        background: #e5e7eb;
      }

      .spark-feedback-section {
        border-top: 1px solid #e5e7eb;
        padding-top: 1rem;
      }

      .feedback-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .rating-group {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .rating-star {
        cursor: pointer;
        font-size: 1.5rem;
        color: #d1d5db;
        transition: color 0.2s;
      }

      .rating-star:hover,
      .rating-star.active {
        color: #fbbf24;
      }

      .feedback-textarea {
        width: 100%;
        min-height: 80px;
        padding: 0.5rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        font-family: inherit;
        font-size: 0.875rem;
      }

      .feedback-actions {
        display: flex;
        gap: 0.5rem;
      }

      .btn-primary {
        background: #3b82f6;
        color: white;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 0.25rem;
        cursor: pointer;
        font-size: 0.875rem;
      }

      .btn-primary:hover {
        background: #2563eb;
      }

      .btn-secondary {
        background: #e5e7eb;
        color: #4b5563;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 0.25rem;
        cursor: pointer;
        font-size: 0.875rem;
      }

      .btn-secondary:hover {
        background: #d1d5db;
      }

      .existing-feedback {
        background: #f0fdf4;
        padding: 1rem;
        border-radius: 0.25rem;
        border: 1px solid #86efac;
      }

      .feedback-rating {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 0.5rem;
      }

      .star-filled {
        color: #fbbf24;
      }

      .star-empty {
        color: #e5e7eb;
      }
    </style>

    <script>
      // Helper to get cookie value
      function getCookie(name) {
        const value = '; ' + document.cookie
        const parts = value.split('; ' + name + '=')
        if (parts.length === 2) return parts.pop().split(';').shift()
        return ''
      }

      // Toggle Spark content visibility
      function toggleSparkContent(sessionId) {
        const contentEl = document.getElementById('spark-content-' + sessionId)
        const truncatedEl = document.getElementById('spark-truncated-' + sessionId)

        if (contentEl && truncatedEl) {
          if (contentEl.style.display === 'none') {
            contentEl.style.display = 'block'
            truncatedEl.style.display = 'none'
          } else {
            contentEl.style.display = 'none'
            truncatedEl.style.display = 'block'
          }
        }
      }

      // Rating star interaction
      document.querySelectorAll('.rating-star').forEach(star => {
        star.addEventListener('click', function () {
          const rating = parseInt(this.dataset.rating)
          const group = this.closest('.rating-group')
          const input = group.querySelector('input[type="hidden"]')

          input.value = rating

          group.querySelectorAll('.rating-star').forEach((s, i) => {
            if (i < rating) {
              s.classList.add('active')
              s.textContent = '★'
            } else {
              s.classList.remove('active')
              s.textContent = '☆'
            }
          })
        })
      })

      // Form submission
      async function submitSparkFeedback(sessionId) {
        const form = document.getElementById('feedback-form-' + sessionId)
        const formData = new FormData(form)

        const feedback = {
          session_id: sessionId,
          feedback: {
            recommendation_feedback: {
              overall_feedback: {
                rating: parseInt(formData.get('rating')),
                comments: formData.get('comments'),
              },
            },
          },
        }

        try {
          // Send to proxy service on port 3000
          const proxyUrl = window.location.protocol + '//' + window.location.hostname + ':3000'
          const response = await fetch(proxyUrl + '/api/spark/feedback', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Dashboard-Key': getCookie('dashboard_auth') || '',
            },
            body: JSON.stringify(feedback),
          })

          if (response.ok) {
            // Replace form with success message
            const feedbackSection = document.getElementById('feedback-' + sessionId)
            feedbackSection.innerHTML =
              '<div class="existing-feedback"><p>✅ Thank you for your feedback!</p></div>'
          } else {
            alert('Failed to submit feedback. Please try again.')
          }
        } catch (error) {
          console.error('Error submitting feedback:', error)
          alert('Failed to submit feedback. Please try again.')
        }
      }
    </script>
  `
}

/**
 * Render the feedback form
 */
function renderFeedbackForm(
  sessionId: string,
  _sections: Array<{ id: string; title: string }>,
  _sources: string[]
): any {
  return html`
    <form
      id="feedback-form-${sessionId}"
      class="feedback-form"
      onsubmit="event.preventDefault(); submitSparkFeedback('${sessionId}')"
    >
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
          How helpful was this recommendation?
        </label>
        <div class="rating-group">
          <input type="hidden" name="rating" value="0" required />
          ${raw(
            [1, 2, 3, 4, 5]
              .map(i => `<span class="rating-star" data-rating="${i}">☆</span>`)
              .join(' ')
          )}
          <span style="margin-left: 0.5rem; font-size: 0.875rem; color: #6b7280;">
            (1 = Not helpful, 5 = Very helpful)
          </span>
        </div>
      </div>

      <div>
        <label
          for="comments-${sessionId}"
          style="display: block; margin-bottom: 0.5rem; font-weight: 500;"
        >
          Additional comments
        </label>
        <textarea
          id="comments-${sessionId}"
          name="comments"
          class="feedback-textarea"
          placeholder="Share your thoughts on how this recommendation could be improved..."
          required
        ></textarea>
      </div>

      <div class="feedback-actions">
        <button type="submit" class="btn-primary">Submit Feedback</button>
        <button
          type="button"
          class="btn-secondary"
          onclick="document.getElementById('feedback-${sessionId}').style.display='none'"
        >
          Cancel
        </button>
      </div>
    </form>
  `
}

/**
 * Render existing feedback
 */
function renderExistingFeedback(feedback: any): any {
  const rating = feedback.recommendation_feedback?.overall_feedback?.rating || 0
  const comments = feedback.recommendation_feedback?.overall_feedback?.comments || ''

  return html`
    <div class="existing-feedback">
      <h4 style="margin: 0 0 0.5rem 0; font-size: 0.875rem;">Your Feedback</h4>
      <div class="feedback-rating">
        ${raw(
          [1, 2, 3, 4, 5]
            .map(i => `<span class="${i <= rating ? 'star-filled' : 'star-empty'}">★</span>`)
            .join('')
        )}
      </div>
      ${comments
        ? `<p style="margin: 0.5rem 0 0 0; font-size: 0.875rem;">${escapeHtml(comments)}</p>`
        : ''}
    </div>
  `
}
