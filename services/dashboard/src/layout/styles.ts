/**
 * Dashboard CSS styles
 */
export const dashboardStyles = `
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: #1f2937;
    background-color: #f9fafb;
  }
  .container {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1rem;
  }
  nav {
    background: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border-bottom: 1px solid #e5e7eb;
  }
  nav .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
  }
  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }
  h3 {
    font-size: 1.125rem;
    font-weight: 500;
    margin: 0 0 1rem 0;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .stat-label {
    font-size: 0.875rem;
    color: #6b7280;
  }
  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0.5rem 0;
  }
  .stat-meta {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .section {
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 1.5rem;
  }
  .section-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    font-weight: 500;
  }
  .section-content {
    padding: 1.5rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.875rem;
    color: #6b7280;
  }
  td {
    padding: 0.75rem;
    border-bottom: 1px solid #f3f4f6;
  }
  tr:hover {
    background-color: #f9fafb;
  }

  .btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    text-decoration: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    border: none;
    cursor: pointer;
  }
  .btn:hover {
    background: #2563eb;
  }
  .btn-secondary {
    background: #6b7280;
  }
  .btn-secondary:hover {
    background: #4b5563;
  }

  select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
    background: white;
  }

  /* Pagination styles */
  .pagination-link {
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    text-decoration: none;
    color: #374151;
    transition: all 0.15s;
  }
  .pagination-link:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }
  .pagination-current {
    padding: 0.5rem 0.75rem;
    background: #3b82f6;
    color: white;
    border-radius: 0.375rem;
  }
  .pagination-disabled {
    padding: 0.5rem 1rem;
    color: #9ca3af;
  }

  .text-sm {
    font-size: 0.875rem;
  }
  .text-gray-500 {
    color: #6b7280;
  }
  .text-gray-600 {
    color: #4b5563;
  }
  .text-blue-600 {
    color: #2563eb;
  }
  .mb-6 {
    margin-bottom: 1.5rem;
  }
  .space-x-4 > * + * {
    margin-left: 1rem;
  }

  .error-banner {
    background: #fee;
    border: 1px solid #fcc;
    color: #c33;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 0.375rem;
  }

  /* Conversation view styles */
  .conversation-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .message {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .message-index {
    flex-shrink: 0;
    width: 30px;
    padding-top: 0.5rem;
    text-align: center;
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: 500;
  }

  .message-meta {
    flex-shrink: 0;
    width: 80px;
    padding-top: 0.5rem;
    text-align: right;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .message-content {
    flex: 1;
    min-width: 0;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: #f9fafb;
    border-left: 4px solid #e5e7eb;
    position: relative;
  }

  .message-user .message-content {
    background: #eff6ff;
    border-left-color: #3b82f6;
  }

  .message-assistant .message-content {
    background: white;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #10b981;
  }

  /* Special styling for assistant responses in request details */
  .message-assistant-response .message-content {
    background: #f0fdf4;
    border: 2px solid #86efac;
    border-left: 6px solid #10b981;
    box-shadow: 0 2px 4px rgba(16, 185, 129, 0.1);
  }

  .message-text {
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* Code blocks in messages */
  .message-content pre {
    margin: 0.5rem 0;
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
  }

  .message-content code {
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: monospace;
  }

  .message-content pre code {
    padding: 0;
    font-size: 0.875rem;
  }

  /* Message role and time styles */
  .message-role {
    font-weight: 600;
    margin-top: 0.25rem;
  }

  /* Navigation arrows for user messages */
  .nav-arrow {
    background: none;
    border: none;
    padding: 0.125rem;
    cursor: pointer;
    color: #6b7280;
    transition: color 0.2s;
    display: block;
    margin: 0.125rem 0;
  }

  .nav-arrow:hover:not(:disabled) {
    color: #374151;
  }

  .nav-arrow:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-arrow svg {
    display: block;
  }

  /* Hide tools feature */
  .hide-tools .message-tool-use .message-content,
  .hide-tools .message-tool-result .message-content {
    max-height: 2rem;
    overflow: hidden;
    position: relative;
    opacity: 0.6;
  }

  .hide-tools .message-tool-use .message-content::after,
  .hide-tools .message-tool-result .message-content::after {
    content: '...';
    position: absolute;
    bottom: 0;
    right: 1rem;
    background: linear-gradient(to right, transparent, #f9fafb 20%);
    padding-left: 2rem;
    font-weight: 500;
  }

  .hide-tools .message-tool-use .message-content {
    background: #fef3c7;
  }

  .hide-tools .message-tool-result .message-content {
    background: #dcfce7;
  }

  /* Hide copy button for collapsed tool messages */
  .hide-tools .message-tool-use .copy-message-link,
  .hide-tools .message-tool-result .copy-message-link {
    display: none;
  }

  /* Tool name label for collapsed messages */
  .tool-name-label {
    font-weight: 600;
    color: #92400e;
    margin-right: 0.5rem;
  }

  .message-time {
    font-size: 0.675rem;
    color: #9ca3af;
  }

  /* Tool message styles */
  .message-tool-use .message-content {
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-left: 4px solid #f59e0b;
  }

  .message-tool-result .message-content {
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    border-left: 4px solid #22c55e;
  }

  /* Copy link button */
  .copy-message-link {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 0.25rem;
    margin-top: 0.25rem;
    transition: color 0.2s;
  }

  .copy-message-link:hover {
    color: #6b7280;
  }

  /* Tool call styles */
  .tool-calls {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e5e7eb;
  }
  
  .tool-call {
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
  
  .tool-name {
    font-weight: 600;
    color: #059669;
    margin-bottom: 0.25rem;
  }
  
  .tool-params {
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.7rem;
    overflow-x: auto;
  }

  /* Request details styles */
  .detail-grid {
    display: grid;
    gap: 1.5rem;
  }

  .detail-group {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .detail-item {
    margin-bottom: 1rem;
  }

  .detail-label {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.25rem;
  }

  .detail-value {
    font-size: 1rem;
    font-weight: 500;
  }

  /* Token usage styles */
  .usage-chart {
    height: 300px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 2rem;
  }

  .usage-bar {
    height: 40px;
    background: #f3f4f6;
    border-radius: 0.5rem;
    overflow: hidden;
    position: relative;
    margin: 1rem 0;
  }

  .usage-fill {
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s ease;
  }

  .usage-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.875rem;
    font-weight: 600;
    color: #1f2937;
  }

  /* Form styles */
  .login-container {
    max-width: 400px;
    margin: 4rem auto;
    padding: 2rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: #374151;
  }

  input[type="text"],
  input[type="password"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
  }

  input[type="text"]:focus,
  input[type="password"]:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  /* Search styles */
  .search-box {
    position: relative;
    margin-bottom: 1rem;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem;
    padding-left: 2.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }

  /* View toggle styles */
  .view-toggle {
    display: flex;
    gap: 0.5rem;
    margin: 1rem 0;
    border-bottom: 1px solid #e5e7eb;
  }

  .view-toggle button {
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 0.875rem;
    color: #6b7280;
    transition: all 0.2s;
  }

  .view-toggle button:hover {
    color: #374151;
  }

  .view-toggle button.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }

  /* Cost info styles */
  .cost-info {
    display: inline-flex;
    gap: 0.75rem;
    color: #6b7280;
  }

  .cost-info span {
    white-space: nowrap;
  }

  /* Message truncation styles */
  .message-truncated {
    position: relative;
  }

  .show-more-btn {
    color: #3b82f6;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    margin-left: 0.5rem;
    text-decoration: underline;
  }

  .show-more-btn:hover {
    color: #2563eb;
  }

  /* Utility classes */
  .text-right {
    text-align: right;
  }

  .text-center {
    text-align: center;
  }

  .font-mono {
    font-family: monospace;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hidden {
    display: none !important;
  }

  .flex {
    display: flex;
  }

  /* Conversation detail styles */
  .conversation-stats-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    margin-bottom: 1.5rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .conversation-stat-card {
    flex: 1 1 auto;
    min-width: 140px;
    padding: 0.875rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-right: 1px solid #e5e7eb;
  }

  .conversation-stat-card:last-child {
    border-right: none;
  }

  .conversation-stat-label {
    font-size: 0.875rem;
    color: #6b7280;
    white-space: nowrap;
  }

  .conversation-stat-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin-left: auto;
  }

  @media (max-width: 768px) {
    .conversation-stats-grid {
      flex-direction: column;
    }
    
    .conversation-stat-card {
      border-right: none;
      border-bottom: 1px solid #e5e7eb;
      min-width: 100%;
    }
    
    .conversation-stat-card:last-child {
      border-bottom: none;
    }
  }

  /* Branch filter styles */
  .branch-filter {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .branch-chip {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    border-radius: 9999px;
    text-decoration: none;
    transition: all 0.2s;
    border: 1px solid;
    font-weight: 500;
  }

  .branch-chip:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .branch-chip-active {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  /* Conversation graph container */
  .conversation-graph-container {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
    margin-top: 2rem;
  }

  .conversation-graph {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    position: sticky;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  .conversation-timeline {
    min-width: 0;
  }

  /* Responsive layout */
  @media (max-width: 1024px) {
    .conversation-graph-container {
      grid-template-columns: 1fr;
    }
    
    .conversation-graph {
      position: static;
      max-height: 500px;
    }
  }

  .items-center {
    align-items: center;
  }

  .justify-between {
    justify-content: space-between;
  }

  .gap-2 {
    gap: 0.5rem;
  }

  .gap-4 {
    gap: 1rem;
  }

  /* Responsive styles */
  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
    
    nav .container {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }
    
    .message-meta {
      display: none;
    }
    
    table {
      font-size: 0.75rem;
    }
    
    th, td {
      padding: 0.5rem;
    }
  }

  /* Loading spinner */
  .spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid rgba(59, 130, 246, 0.3);
    border-radius: 50%;
    border-top-color: #3b82f6;
    animation: spin 1s ease-in-out infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Code block styles */
  pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 1rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  code {
    font-family: 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  }

  /* Status badges */
  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 0.25rem;
  }

  .badge-success {
    background: #d1fae5;
    color: #065f46;
  }

  .badge-error {
    background: #fee2e2;
    color: #991b1b;
  }

  .badge-warning {
    background: #fef3c7;
    color: #92400e;
  }

  .badge-info {
    background: #dbeafe;
    color: #1e40af;
  }
`
