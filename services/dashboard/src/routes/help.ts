/**
 * Help page for Claude Code client setup
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import { layout } from '../layout/index.js'

const helpRoute = new Hono()

helpRoute.get('/', c => {
  const content = html`
    <div class="help-container">
      <div class="header-section">
        <h1>Claude Code Setup Guide</h1>
        <p class="subtitle">Configure Claude Code desktop client to use Claude Nexus Proxy</p>
      </div>

      <!-- Quick Start Section -->
      <div class="help-section">
        <h2>Quick Start</h2>
        <div class="info-box">
          <p>
            Claude Nexus Proxy acts as an intermediary between your Claude Code client and the
            Claude API, providing enhanced tracking, monitoring, and control over your API usage.
          </p>
          <div class="button-group">
            <a href="/dashboard" class="btn btn-primary">Get Your API Key</a>
          </div>
        </div>
      </div>

      <!-- Claude Code Configuration -->
      <div class="help-section">
        <h2>Claude Code Desktop Configuration</h2>
        <p>Follow these steps to configure Claude Code to use the proxy:</p>

        <div class="steps-container">
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h3>Open Claude Code Settings</h3>
              <p>
                Press <code>Cmd + ,</code> (Mac) or <code>Ctrl + ,</code> (Windows/Linux) to open
                settings.
              </p>
            </div>
          </div>

          <div class="step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h3>Configure Base URL</h3>
              <p>Search for <code>Anthropic Base URL</code> in the settings.</p>
              <p>Set the value to your proxy URL:</p>
              <div class="code-block-container">
                <pre><code id="dev-url">http://localhost:3000</code></pre>
                <button class="copy-btn" onclick="copyToClipboard('dev-url', this)">Copy</button>
              </div>
              <p class="note">For production, use your deployed proxy URL.</p>
            </div>
          </div>

          <div class="step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h3>Set Your API Key</h3>
              <p>Search for <code>Anthropic API Key</code> in the settings.</p>
              <p>Enter your proxy API key with the <code>cnp_live_</code> prefix:</p>
              <div class="code-block-container">
                <pre><code id="api-key-example">cnp_live_your_key_here</code></pre>
                <button class="copy-btn" onclick="copyToClipboard('api-key-example', this)">
                  Copy
                </button>
              </div>
              <p class="note">Get your API key from the <a href="/dashboard">Dashboard</a>.</p>
            </div>
          </div>

          <div class="step">
            <div class="step-number">4</div>
            <div class="step-content">
              <h3>Test Your Connection</h3>
              <p>Send a test message in Claude Code to verify the configuration.</p>
              <p>
                Check the <a href="/dashboard/requests">Requests</a> page to see your API calls.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Environment Variables Section -->
      <div class="help-section">
        <h2>Alternative: Environment Variables</h2>
        <p>You can also configure Claude Code using environment variables:</p>

        <div class="code-block-container">
          <pre><code id="env-vars"># Add to your .env file or shell profile
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="cnp_live_your_key_here"</code></pre>
          <button class="copy-btn" onclick="copyToClipboard('env-vars', this)">Copy</button>
        </div>

        <p class="note">Environment variables take precedence over settings configuration.</p>
      </div>

      <!-- Command Line Configuration -->
      <div class="help-section">
        <h2>Command Line Usage</h2>
        <p>For CLI tools or scripts, you can pass the proxy configuration directly:</p>

        <div class="code-block-container">
          <pre><code id="cli-example"># Using curl
curl -X POST http://localhost:3000/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer cnp_live_your_key_here" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{"model": "claude-3-5-sonnet-latest", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 100}'</code></pre>
          <button class="copy-btn" onclick="copyToClipboard('cli-example', this)">Copy</button>
        </div>
      </div>

      <!-- Troubleshooting Section -->
      <div class="help-section">
        <h2>Troubleshooting</h2>

        <details class="troubleshooting-item">
          <summary>Connection Refused</summary>
          <div class="troubleshooting-content">
            <p><strong>Problem:</strong> Claude Code cannot connect to the proxy.</p>
            <p><strong>Solutions:</strong></p>
            <ul>
              <li>
                Verify the proxy is running: <code>docker ps</code> or check if port 3000 is
                accessible
              </li>
              <li>
                Check the URL format: Should be <code>http://localhost:3000</code> (no trailing
                slash)
              </li>
              <li>Ensure no firewall is blocking port 3000</li>
              <li>For Docker users, make sure to use host networking or proper port mapping</li>
            </ul>
          </div>
        </details>

        <details class="troubleshooting-item">
          <summary>Authentication Failed</summary>
          <div class="troubleshooting-content">
            <p><strong>Problem:</strong> API key is rejected by the proxy.</p>
            <p><strong>Solutions:</strong></p>
            <ul>
              <li>Verify your API key starts with <code>cnp_live_</code></li>
              <li>Check for extra spaces or hidden characters in the key</li>
              <li>Ensure the key is active in your dashboard</li>
              <li>Regenerate the key if needed from the <a href="/dashboard">Dashboard</a></li>
            </ul>
          </div>
        </details>

        <details class="troubleshooting-item">
          <summary>Rate Limiting</summary>
          <div class="troubleshooting-content">
            <p><strong>Problem:</strong> Requests are being rate limited.</p>
            <p><strong>Solutions:</strong></p>
            <ul>
              <li>Check your usage on the <a href="/dashboard/token-usage">Token Usage</a> page</li>
              <li>Review rate limits in your account settings</li>
              <li>Consider implementing request queuing in your application</li>
              <li>Contact support if you need higher limits</li>
            </ul>
          </div>
        </details>

        <details class="troubleshooting-item">
          <summary>CORS Issues</summary>
          <div class="troubleshooting-content">
            <p><strong>Problem:</strong> Browser-based applications encounter CORS errors.</p>
            <p><strong>Solutions:</strong></p>
            <ul>
              <li>The proxy should handle CORS headers automatically</li>
              <li>Ensure you're not sending requests directly from frontend to the proxy</li>
              <li>Use a backend server to proxy requests</li>
              <li>Check if custom headers are properly configured</li>
            </ul>
          </div>
        </details>

        <details class="troubleshooting-item">
          <summary>Domain Routing Issues</summary>
          <div class="troubleshooting-content">
            <p><strong>Problem:</strong> Multi-domain setup not working correctly.</p>
            <p><strong>Solutions:</strong></p>
            <ul>
              <li>Include the <code>Host</code> header with your domain</li>
              <li>
                Verify domain credentials are configured in <code>credentials/</code> directory
              </li>
              <li>Check <a href="/dashboard/usage">Domain Stats</a> for domain-specific issues</li>
              <li>Ensure OAuth tokens are properly refreshed for OAuth-based domains</li>
            </ul>
          </div>
        </details>
      </div>

      <!-- Additional Resources -->
      <div class="help-section">
        <h2>Additional Resources</h2>
        <div class="resource-links">
          <a
            href="https://github.com/anthropics/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            class="resource-link"
          >
            Claude Code Documentation
          </a>
          <a href="/dashboard/requests" class="resource-link"> View Your Requests </a>
          <a href="/dashboard/token-usage" class="resource-link"> Monitor Token Usage </a>
          <a
            href="https://github.com/moonsong-labs/claude-nexus-proxy/issues"
            target="_blank"
            rel="noopener noreferrer"
            class="resource-link"
          >
            Report Issues
          </a>
        </div>
      </div>
    </div>

    <!-- Styles specific to help page -->
    <style>
      .help-container {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem;
      }

      .help-section {
        margin-bottom: 3rem;
        background: var(--bg-secondary);
        border-radius: 8px;
        padding: 1.5rem;
        border: 1px solid var(--border-color);
      }

      .help-section h2 {
        color: var(--text-primary);
        margin-bottom: 1rem;
        font-size: 1.5rem;
        font-weight: 600;
      }

      .info-box {
        background: var(--bg-tertiary);
        padding: 1.5rem;
        border-radius: 6px;
        margin-bottom: 1rem;
      }

      .info-box p {
        margin-bottom: 1rem;
        color: var(--text-secondary);
        line-height: 1.6;
      }

      .steps-container {
        margin-top: 1.5rem;
      }

      .step {
        display: flex;
        margin-bottom: 2rem;
        padding-bottom: 2rem;
        border-bottom: 1px solid var(--border-color-light);
      }

      .step:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .step-number {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        background: var(--btn-primary-bg);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        margin-right: 1.5rem;
      }

      .step-content {
        flex: 1;
      }

      .step-content h3 {
        margin-bottom: 0.5rem;
        color: var(--text-primary);
        font-size: 1.1rem;
        font-weight: 600;
      }

      .step-content p {
        margin-bottom: 0.75rem;
        color: var(--text-secondary);
        line-height: 1.6;
      }

      .code-block-container {
        position: relative;
        margin: 1rem 0;
      }

      .code-block-container pre {
        background: var(--bg-dark-section);
        color: #e5e7eb;
        padding: 1rem;
        border-radius: 6px;
        overflow-x: auto;
        margin: 0;
      }

      .code-block-container code {
        font-family: 'Courier New', monospace;
        font-size: 0.9rem;
      }

      .copy-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: var(--btn-secondary-bg);
        color: white;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: background 0.2s;
      }

      .copy-btn:hover {
        background: var(--btn-secondary-hover);
      }

      .copy-btn.copied {
        background: var(--color-success);
      }

      .note {
        font-size: 0.9rem;
        color: var(--text-tertiary);
        font-style: italic;
        margin-top: 0.5rem;
      }

      .troubleshooting-item {
        margin-bottom: 1rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
      }

      .troubleshooting-item summary {
        padding: 1rem;
        background: var(--bg-tertiary);
        cursor: pointer;
        font-weight: 500;
        color: var(--text-primary);
        user-select: none;
        transition: background 0.2s;
      }

      .troubleshooting-item summary:hover {
        background: var(--border-color-light);
      }

      .troubleshooting-item[open] summary {
        border-bottom: 1px solid var(--border-color);
      }

      .troubleshooting-content {
        padding: 1rem;
        background: var(--bg-secondary);
      }

      .troubleshooting-content p {
        margin-bottom: 0.75rem;
        color: var(--text-secondary);
      }

      .troubleshooting-content ul {
        margin-left: 1.5rem;
        color: var(--text-secondary);
      }

      .troubleshooting-content li {
        margin-bottom: 0.5rem;
        line-height: 1.6;
      }

      .troubleshooting-content code {
        background: var(--bg-tertiary);
        padding: 0.125rem 0.375rem;
        border-radius: 3px;
        font-size: 0.9rem;
        color: var(--text-primary);
      }

      .resource-links {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }

      .resource-link {
        display: block;
        padding: 1rem;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        text-align: center;
        color: var(--text-link);
        text-decoration: none;
        transition: all 0.2s;
      }

      .resource-link:hover {
        background: var(--border-color-light);
        border-color: var(--text-link);
        transform: translateY(-2px);
      }

      .button-group {
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
      }

      /* Dark mode adjustments */
      @media (prefers-color-scheme: dark) {
        .code-block-container code {
          color: #e5e7eb;
        }
      }
    </style>

    <!-- JavaScript for copy functionality -->
    <script>
      function copyToClipboard(elementId, button) {
        const element = document.getElementById(elementId)
        const text = element.textContent

        navigator.clipboard
          .writeText(text)
          .then(() => {
            const originalText = button.textContent
            button.textContent = 'Copied!'
            button.classList.add('copied')

            setTimeout(() => {
              button.textContent = originalText
              button.classList.remove('copied')
            }, 2000)
          })
          .catch(err => {
            console.error('Failed to copy:', err)
            button.textContent = 'Failed'
            setTimeout(() => {
              button.textContent = 'Copy'
            }, 2000)
          })
      }
    </script>
  `

  return c.html(layout('Help - Claude Nexus Proxy', content))
})

export { helpRoute as helpRouter }
