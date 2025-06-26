import { html, raw } from 'hono/html'
import { dashboardStyles } from './styles.js'

/**
 * Dashboard HTML layout template
 */
export const layout = (title: string, content: any, additionalScripts: string = '') => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title} - Claude Nexus Dashboard</title>
      <style>
        ${raw(dashboardStyles)}
      </style>
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"
      />
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/@andypf/json-viewer@2.1.10/dist/iife/index.js"></script>
      <style>
        /* JSON Viewer styling */
        andypf-json-viewer {
          display: block;
          padding: 1rem;
          border-radius: 0.375rem;
          overflow: auto;
        }


        /* Ensure code blocks in these containers have light backgrounds */
        .hljs {
          background: transparent !important;
          color: #1f2937 !important;
        }

        /* Chunk containers */
        #chunks-container > div > div {
          background-color: white !important;
        }

        /* Tool use and conversation code blocks */
        .message-content pre,
        .message-content code,
        .conversation-container pre,
        .conversation-container code {
          background-color: #f9fafb !important;
          color: #1f2937 !important;
          border: 1px solid #e5e7eb;
        }

        .message-content pre code,
        .conversation-container pre code {
          background-color: transparent !important;
          border: none;
        }

        /* Specific language code blocks */
        .language-json,
        .language-javascript,
        .language-python,
        .language-bash,
        .language-shell,
        pre.hljs,
        code.hljs {
          background-color: #f9fafb !important;
          color: #1f2937 !important;
        }
      </style>
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
      ${additionalScripts}
    </head>
    <body>
      <nav>
        <div class="container">
          <h1>Claude Nexus Dashboard</h1>
          <div class="space-x-4">
            <a href="/dashboard" class="text-sm text-blue-600">Dashboard</a>
            <a href="/dashboard/requests" class="text-sm text-blue-600">Requests</a>
            <a href="/dashboard/token-usage" class="text-sm text-blue-600">Token Usage</a>
            <span class="text-sm text-gray-600" id="current-domain">All Domains</span>
            <a href="/dashboard/logout" class="text-sm text-blue-600">Logout</a>
          </div>
        </div>
      </nav>
      <main class="container" style="padding: 2rem 1rem;">${content}</main>
    </body>
  </html>
`
