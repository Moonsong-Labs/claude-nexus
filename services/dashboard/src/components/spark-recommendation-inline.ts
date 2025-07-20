import { escapeHtml } from '../utils/formatters.js'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import type { SparkRecommendation } from '../utils/spark.js'

/**
 * Interface for feedback data structure
 */
interface SparkFeedback {
  recommendation_feedback?: {
    overall_feedback?: {
      rating?: number
      comments?: string
    }
    section_feedbacks?: any[]
  }
  source_feedbacks?: any[]
  lessons_learned?: any[]
}

/**
 * CSS styles for Spark recommendation inline component
 */
const SPARK_INLINE_STYLES = `
  .spark-inline-recommendation {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    border: 1px solid #7dd3fc;
    border-radius: 0.75rem;
    margin: 1rem 0;
    overflow: hidden;
  }

  .spark-inline-header {
    background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
    color: white;
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .spark-inline-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .spark-icon {
    font-size: 1.25rem;
  }

  .spark-label {
    font-size: 0.9375rem;
  }

  .feedback-badge-inline {
    background: rgba(255, 255, 255, 0.2);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .spark-inline-meta {
    font-size: 0.75rem;
  }

  .session-id {
    background: rgba(255, 255, 255, 0.2);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-family: monospace;
  }

  .spark-inline-request {
    background: rgba(255, 255, 255, 0.7);
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e0f2fe;
    font-size: 0.875rem;
  }

  .spark-query, .spark-context {
    margin-bottom: 0.25rem;
  }

  .spark-query:last-child, .spark-context:last-child {
    margin-bottom: 0;
  }

  .spark-inline-request .label {
    font-weight: 600;
    color: #0369a1;
    margin-right: 0.5rem;
  }

  .spark-inline-request .value {
    color: #334155;
  }

  .spark-inline-content {
    padding: 1.5rem;
    background: white;
    max-height: 600px;
    overflow-y: auto;
  }

  /* Markdown styles for inline content */
  .spark-inline-content h1,
  .spark-inline-content h2,
  .spark-inline-content h3,
  .spark-inline-content h4,
  .spark-inline-content h5,
  .spark-inline-content h6 {
    margin-top: 1.25rem;
    margin-bottom: 0.75rem;
    color: #0c4a6e;
  }

  .spark-inline-content h1 { font-size: 1.5rem; }
  .spark-inline-content h2 { font-size: 1.25rem; }
  .spark-inline-content h3 { font-size: 1.125rem; }

  .spark-inline-content p {
    margin-bottom: 0.75rem;
    line-height: 1.6;
  }

  .spark-inline-content pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 1rem 0;
  }

  .spark-inline-content code {
    background: #e0f2fe;
    color: #0369a1;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: 'Monaco', 'Consolas', monospace;
  }

  .spark-inline-content pre code {
    background: transparent;
    color: inherit;
    padding: 0;
  }

  .spark-inline-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }

  .spark-inline-content th,
  .spark-inline-content td {
    border: 1px solid #e0f2fe;
    padding: 0.5rem;
    text-align: left;
  }

  .spark-inline-content th {
    background: #f0f9ff;
    font-weight: 600;
    color: #0369a1;
  }

  .spark-inline-content tr:nth-child(even) {
    background: #f8fafc;
  }

  /* Feedback section */
  .spark-inline-feedback-wrapper {
    border-top: 1px solid #e0f2fe;
  }

  .spark-feedback-toggle {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #f0f9ff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #0369a1;
    font-weight: 500;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .spark-feedback-toggle:hover {
    background: #e0f2fe;
  }

  .toggle-icon {
    transition: transform 0.2s;
  }

  .spark-feedback-toggle.expanded .toggle-icon {
    transform: rotate(180deg);
  }

  .spark-inline-feedback {
    padding: 1rem;
    background: #f8fafc;
  }

  /* Feedback form styles */
  .inline-feedback-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .inline-rating-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .inline-rating-star {
    cursor: pointer;
    font-size: 1.5rem;
    color: #cbd5e1;
    transition: color 0.2s;
  }

  .inline-rating-star:hover,
  .inline-rating-star.active {
    color: #fbbf24;
  }

  .inline-feedback-textarea {
    width: 100%;
    min-height: 80px;
    padding: 0.5rem;
    border: 1px solid #e0f2fe;
    border-radius: 0.375rem;
    font-family: inherit;
    font-size: 0.875rem;
    resize: vertical;
  }

  .inline-feedback-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn-inline-primary {
    background: #0ea5e9;
    color: white;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-inline-primary:hover {
    background: #0284c7;
  }

  .btn-inline-cancel {
    background: #e2e8f0;
    color: #475569;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-inline-cancel:hover {
    background: #cbd5e1;
  }

  .inline-existing-feedback {
    background: white;
    padding: 1rem;
    border-radius: 0.375rem;
    border: 1px solid #e0f2fe;
  }

  .inline-feedback-rating {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .star-filled {
    color: #fbbf24;
  }

  .star-empty {
    color: #e2e8f0;
  }
`

/**
 * JavaScript code for Spark recommendation interactions
 * Wrapped in IIFE to prevent global scope pollution
 */
const SPARK_INLINE_SCRIPT = `
(function() {
  'use strict';
  
  // Create a namespace for our functions to avoid global pollution
  window.sparkRecommendationHandlers = window.sparkRecommendationHandlers || {};
  
  /**
   * Toggle feedback section visibility
   */
  window.sparkRecommendationHandlers.toggleFeedback = function(sessionId) {
    const feedbackEl = document.getElementById('spark-inline-feedback-' + sessionId);
    const toggleBtn = feedbackEl.previousElementSibling;
    
    if (feedbackEl.style.display === 'none') {
      feedbackEl.style.display = 'block';
      toggleBtn.classList.add('expanded');
    } else {
      feedbackEl.style.display = 'none';
      toggleBtn.classList.remove('expanded');
    }
  };
  
  /**
   * Helper to get cookie value
   * WARNING: This retrieves the dashboard_auth cookie which has httpOnly=false
   * This is a security risk as it makes the cookie vulnerable to XSS attacks.
   * TODO: Implement a more secure authentication mechanism such as:
   * - Server-side proxy endpoint for API calls
   * - Secure token exchange mechanism
   * - Proper CSRF protection
   */
  function getCookie(name) {
    const value = '; ' + document.cookie;
    const parts = value.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  }
  
  /**
   * Submit feedback for a Spark recommendation
   */
  window.sparkRecommendationHandlers.submitFeedback = async function(sessionId) {
    const form = document.getElementById('inline-feedback-form-' + sessionId);
    const formData = new FormData(form);
    
    const feedback = {
      session_id: sessionId,
      feedback: {
        recommendation_feedback: {
          overall_feedback: {
            rating: parseInt(formData.get('rating')),
            comments: formData.get('comments')
          },
          section_feedbacks: []
        },
        source_feedbacks: [],
        lessons_learned: []
      }
    };
    
    try {
      const response = await fetch('/dashboard/api/spark/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedback),
        credentials: 'same-origin'
      });
      
      if (response.ok) {
        const feedbackSection = document.getElementById('spark-inline-feedback-' + sessionId);
        feedbackSection.innerHTML = '<div class="inline-existing-feedback"><p>✅ Thank you for your feedback!</p></div>';
      } else {
        alert('Failed to submit feedback. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    }
  };
  
  /**
   * Initialize rating stars event handlers
   */
  function initializeRatingStars() {
    document.querySelectorAll('.inline-rating-star').forEach(star => {
      if (star.dataset.initialized) return; // Prevent duplicate initialization
      star.dataset.initialized = 'true';
      
      star.addEventListener('click', function() {
        const rating = parseInt(this.dataset.rating);
        const group = this.closest('.inline-rating-group');
        const input = group.querySelector('input[type="hidden"]');
        
        input.value = rating;
        
        group.querySelectorAll('.inline-rating-star').forEach((s, i) => {
          if (i < rating) {
            s.classList.add('active');
            s.textContent = '★';
          } else {
            s.classList.remove('active');
            s.textContent = '☆';
          }
        });
      });
    });
  }
  
  // Initialize on DOM ready and when new content is added
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRatingStars);
  } else {
    initializeRatingStars();
  }
  
  // Export initialization function for dynamic content
  window.sparkRecommendationHandlers.initializeRatingStars = initializeRatingStars;
})();
`

/**
 * Render a Spark recommendation inline in conversation view
 * @param recommendation - The Spark recommendation data
 * @param sessionId - Unique session identifier
 * @param messageIndex - Index of the message in the conversation
 * @param existingFeedback - Previously submitted feedback data
 * @returns HTML string for the recommendation component
 */
export async function renderSparkRecommendationInline(
  recommendation: SparkRecommendation,
  sessionId: string,
  messageIndex: number,
  existingFeedback?: SparkFeedback
): Promise<string> {
  const htmlContent = await renderMarkdownContent(recommendation.response)

  const hasFeedback = !!existingFeedback

  return `
    <div class="spark-inline-recommendation" data-session-id="${sessionId}">
      ${renderHeader(sessionId, hasFeedback)}
      ${renderRequestInfo(recommendation)}
      ${renderContent(sessionId, htmlContent)}
      ${renderFeedbackSection(sessionId, hasFeedback, existingFeedback)}
    </div>

    <style>${SPARK_INLINE_STYLES}</style>

    <script>
      // Global function for onclick handler compatibility
      function toggleSparkFeedback(sessionId) {
        if (window.sparkRecommendationHandlers && window.sparkRecommendationHandlers.toggleFeedback) {
          window.sparkRecommendationHandlers.toggleFeedback(sessionId);
        }
      }
      
      function submitInlineSparkFeedback(sessionId) {
        if (window.sparkRecommendationHandlers && window.sparkRecommendationHandlers.submitFeedback) {
          window.sparkRecommendationHandlers.submitFeedback(sessionId);
        }
      }
    </script>
    <script>${SPARK_INLINE_SCRIPT}</script>
  `
}

/**
 * Render markdown content with sanitization
 * @param content - Raw markdown content
 * @returns Sanitized HTML string
 */
async function renderMarkdownContent(content: string): Promise<string> {
  const dirtyHtml = await marked.parse(content)
  return sanitizeHtml(dirtyHtml, {
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
}

/**
 * Render the header section
 * @param sessionId - Session identifier
 * @param hasFeedback - Whether feedback exists
 * @returns HTML string for header
 */
function renderHeader(sessionId: string, hasFeedback: boolean): string {
  return `
    <div class="spark-inline-header">
      <div class="spark-inline-title">
        <span class="spark-icon">✨</span>
        <span class="spark-label">Spark Recommendation</span>
        ${hasFeedback ? '<span class="feedback-badge-inline">✅ Rated</span>' : ''}
      </div>
      <div class="spark-inline-meta">
        <code class="session-id">${sessionId}</code>
      </div>
    </div>
  `
}

/**
 * Render request information section
 * @param recommendation - Spark recommendation data
 * @returns HTML string for request info
 */
function renderRequestInfo(recommendation: SparkRecommendation): string {
  if (!recommendation.query && !recommendation.context) {
    return ''
  }

  return `
    <div class="spark-inline-request">
      ${recommendation.query ? renderQuery(recommendation.query) : ''}
      ${recommendation.context ? renderContext(recommendation.context) : ''}
    </div>
  `
}

/**
 * Render query section
 * @param query - Query string
 * @returns HTML string for query
 */
function renderQuery(query: string): string {
  return `
    <div class="spark-query">
      <span class="label">Query:</span>
      <span class="value">${escapeHtml(query)}</span>
    </div>
  `
}

/**
 * Render context section
 * @param context - Context string or array
 * @returns HTML string for context
 */
function renderContext(context: string | string[]): string {
  const contextValue = Array.isArray(context)
    ? context.map(c => escapeHtml(c)).join(' • ')
    : escapeHtml(context)

  return `
    <div class="spark-context">
      <span class="label">Context:</span>
      <span class="value">${contextValue}</span>
    </div>
  `
}

/**
 * Render content section
 * @param sessionId - Session identifier
 * @param htmlContent - Rendered HTML content
 * @returns HTML string for content
 */
function renderContent(sessionId: string, htmlContent: string): string {
  return `
    <div class="spark-inline-content" id="spark-inline-content-${sessionId}">
      ${htmlContent}
    </div>
  `
}

/**
 * Render feedback section
 * @param sessionId - Session identifier
 * @param hasFeedback - Whether feedback exists
 * @param existingFeedback - Existing feedback data
 * @returns HTML string for feedback section
 */
function renderFeedbackSection(
  sessionId: string,
  hasFeedback: boolean,
  existingFeedback?: SparkFeedback
): string {
  const feedbackId = `spark-inline-feedback-${sessionId}`

  return `
    <div class="spark-inline-feedback-wrapper">
      <button 
        class="spark-feedback-toggle"
        onclick="toggleSparkFeedback('${sessionId}')"
      >
        <span class="toggle-icon">▼</span>
        ${hasFeedback ? 'View Feedback' : 'Add Feedback'}
      </button>
      
      <div class="spark-inline-feedback" id="${feedbackId}" style="display: none;">
        ${
          hasFeedback
            ? renderInlineExistingFeedback(existingFeedback!)
            : renderInlineFeedbackForm(sessionId)
        }
      </div>
    </div>
  `
}

/**
 * Render the inline feedback form
 * @param sessionId - Session identifier
 * @returns HTML string for feedback form
 */
function renderInlineFeedbackForm(sessionId: string): string {
  return `
    <form 
      id="inline-feedback-form-${sessionId}" 
      class="inline-feedback-form"
      onsubmit="event.preventDefault(); submitInlineSparkFeedback('${sessionId}')"
    >
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #0369a1;">
          How helpful was this recommendation?
        </label>
        <div class="inline-rating-group">
          <input type="hidden" name="rating" value="0" required />
          ${[1, 2, 3, 4, 5]
            .map(i => `<span class="inline-rating-star" data-rating="${i}">☆</span>`)
            .join(' ')}
          <span style="margin-left: 0.5rem; font-size: 0.75rem; color: #64748b;">
            (1 = Not helpful, 5 = Very helpful)
          </span>
        </div>
      </div>

      <div>
        <label 
          for="inline-comments-${sessionId}"
          style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #0369a1;"
        >
          Comments (required)
        </label>
        <textarea
          id="inline-comments-${sessionId}"
          name="comments"
          class="inline-feedback-textarea"
          placeholder="Share your thoughts on how this recommendation could be improved..."
          required
        ></textarea>
      </div>

      <div class="inline-feedback-actions">
        <button 
          type="button" 
          class="btn-inline-cancel"
          onclick="toggleSparkFeedback('${sessionId}')"
        >
          Cancel
        </button>
        <button type="submit" class="btn-inline-primary">
          Submit Feedback
        </button>
      </div>
    </form>
  `
}

/**
 * Render existing feedback inline
 * @param feedback - Existing feedback data
 * @returns HTML string for existing feedback display
 */
function renderInlineExistingFeedback(feedback: SparkFeedback): string {
  const rating = feedback.recommendation_feedback?.overall_feedback?.rating || 0
  const comments = feedback.recommendation_feedback?.overall_feedback?.comments || ''

  return `
    <div class="inline-existing-feedback">
      <h4 style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: #0369a1;">Your Feedback</h4>
      <div class="inline-feedback-rating">
        ${[1, 2, 3, 4, 5]
          .map(i => `<span class="${i <= rating ? 'star-filled' : 'star-empty'}">★</span>`)
          .join('')}
      </div>
      ${
        comments
          ? `<p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: #334155;">${escapeHtml(
              comments
            )}</p>`
          : ''
      }
    </div>
  `
}
