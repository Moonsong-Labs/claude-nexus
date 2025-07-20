import { html, raw } from 'hono/html'
import { dashboardStyles } from './styles.js'
import { themeToggleScript } from './theme-toggle.js'
import { Context } from 'hono'

/**
 * Dashboard HTML layout template
 *
 * Generates the main HTML structure for all dashboard pages including:
 * - Theme switching (dark/light mode)
 * - Navigation with links to different dashboard sections
 * - CSRF protection when context is provided
 * - External dependencies (highlight.js, htmx, json-viewer)
 *
 * @param title - Page title to display in browser tab
 * @param content - HTML content to render in the main section (can be async)
 * @param additionalScripts - Optional JavaScript to include at the end of the page
 * @param context - Optional Hono context for CSRF token extraction
 * @returns Complete HTML page as a template literal
 */
export const layout = (
  title: string,
  content: string | Promise<string>,
  additionalScripts: string = '',
  context?: Context
) => {
  // Get CSRF token if context is provided
  // The token is stored in the context by middleware and used for request validation
  const csrfToken = context?.get('csrfToken') || ''

  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title} - Claude Nexus Dashboard</title>
        ${/* CSRF token meta tag - Used by HTMX to add token to all requests */ ''}
        ${csrfToken ? html`<meta name="csrf-token" content="${csrfToken}" />` : ''}
        <style>
          ${raw(dashboardStyles)}
        </style>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"
          id="hljs-light-theme"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css"
          id="hljs-dark-theme"
          disabled
        />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/@andypf/json-viewer@2.1.10/dist/iife/index.js"></script>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        ${csrfToken
          ? raw(`
      <script>
        // CSRF Protection Implementation
        // Automatically adds the CSRF token from the meta tag to all HTMX requests
        // This ensures that all AJAX requests include the token for server-side validation
        document.addEventListener('DOMContentLoaded', function() {
          document.body.addEventListener('htmx:configRequest', function(evt) {
            const token = document.querySelector('meta[name="csrf-token"]')?.content;
            if (token) {
              evt.detail.headers['X-CSRF-Token'] = token;
            }
          });
        });
      </script>`)
          : ''}
        ${additionalScripts}
      </head>
      <body>
        <nav>
          <div class="container">
            <h1>Claude Nexus Dashboard</h1>
            <div class="space-x-4" style="display: flex; align-items: center;">
              <a href="/dashboard" class="text-sm text-blue-600">Dashboard</a>
              <a href="/dashboard/requests" class="text-sm text-blue-600">Requests</a>
              <a href="/dashboard/usage" class="text-sm text-blue-600">Domain Stats</a>
              <a href="/dashboard/token-usage" class="text-sm text-blue-600">Token Usage</a>
              <a href="/dashboard/prompts" class="text-sm text-blue-600">Prompts</a>
              <span class="text-sm text-gray-600" id="current-domain">All Domains</span>
              <a href="/dashboard/logout" class="text-sm text-blue-600">Logout</a>
              <button class="theme-toggle" id="theme-toggle" title="Toggle dark mode">
                <svg
                  id="theme-icon-light"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <svg
                  id="theme-icon-dark"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  style="display:none;"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </nav>
        <main class="container" style="padding: 2rem 1rem;">${content}</main>
        <script>
          ${raw(themeToggleScript)}
        </script>
      </body>
    </html>
  `
}
