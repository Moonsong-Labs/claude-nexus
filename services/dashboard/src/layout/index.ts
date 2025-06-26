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
        /* JSON Viewer VSCode-like theme styles */
        andypf-json-viewer {
          --font-family:
            'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          --font-size: 13px;
          --line-height: 1.5;
          --color: #1e1e1e;
          --background-color: #ffffff;
          --string-color: #0a3069;
          --number-color: #098658;
          --boolean-color: #0969da;
          --null-color: #6e7781;
          --property-color: #953800;
          --preview-color: #6e7781;
          --highlight-color: #2f81f7;
          --highlight-background: #f6f8fa;
          --border-color: #d1d9e0;
          --toolbar-background: #f6f8fa;
          --toolbar-color: #1f2328;
          display: block;
          padding: 1rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border-color);
          background-color: #ffffff;
          overflow: auto;
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          andypf-json-viewer {
            --color: #cccccc;
            --background-color: #1e1e1e;
            --string-color: #ce9178;
            --number-color: #b5cea8;
            --boolean-color: #569cd6;
            --null-color: #808080;
            --property-color: #9cdcfe;
            --preview-color: #808080;
            --highlight-color: #569cd6;
            --highlight-background: #264f78;
            --border-color: #3e3e3e;
            --toolbar-background: #252526;
            --toolbar-color: #cccccc;
          }
        }

        /* Style the JSON viewer containers */
        .section-content andypf-json-viewer {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
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
