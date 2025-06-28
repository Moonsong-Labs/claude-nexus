import { html, raw } from 'hono/html'
import { escapeHtml } from '../utils/formatters.js'
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
export function renderSparkRecommendation(
  recommendation: SparkRecommendation,
  requestId: string,
  existingFeedback?: any
): any {
  const sections = getRecommendationSections(recommendation)
  const sources = getRecommendationSources(recommendation)
  const hasFeedback = !!existingFeedback

  return html`
    <div class="spark-recommendation" data-session-id="${recommendation.sessionId}">
      <!-- Recommendation Header -->
      <div class="spark-header">
        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
          <span>🎯 Spark Recommendation</span>
          ${hasFeedback ? '<span class="feedback-badge">✅ Feedback Submitted</span>' : ''}
        </h3>
        <div class="spark-meta">
          <span style="font-size: 0.75rem; color: #6b7280;">
            Session: <code>${recommendation.sessionId}</code>
          </span>
        </div>
      </div>

      <!-- Recommendation Content -->
      <div class="spark-content markdown-content">${raw(recommendation.response)}</div>

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

      .spark-content {
        margin-bottom: 1rem;
        max-height: 600px;
        overflow-y: auto;
        padding: 0.5rem;
        background: white;
        border-radius: 0.25rem;
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
          const response = await fetch('/api/spark/feedback', {
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
          ${[1, 2, 3, 4, 5]
            .map(
              i => `
            <span class="rating-star" data-rating="${i}">☆</span>
          `
            )
            .join('')}
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
        ${[1, 2, 3, 4, 5]
          .map(
            i => `
          <span class="${i <= rating ? 'star-filled' : 'star-empty'}">★</span>
        `
          )
          .join('')}
      </div>
      ${comments
        ? `<p style="margin: 0.5rem 0 0 0; font-size: 0.875rem;">${escapeHtml(comments)}</p>`
        : ''}
    </div>
  `
}
