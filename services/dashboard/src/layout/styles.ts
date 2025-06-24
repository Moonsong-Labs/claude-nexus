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
    border-radius: 0.375rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    margin-bottom: 1rem;
    border: 1px solid #e5e7eb;
  }
  .section-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    font-weight: 500;
    font-size: 0.9rem;
  }
  .section-content {
    padding: 1rem;
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
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .message-meta {
    flex-shrink: 0;
    width: 65px;
    padding-top: 0.5rem;
    text-align: right;
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }

  .message-content {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: #f3f4f6;
  }

  .message.user .message-content {
    background: #e0e7ff;
  }

  .message.assistant .message-content {
    background: white;
    border: 1px solid #e5e7eb;
  }

  .message-text {
    white-space: pre-wrap;
    word-wrap: break-word;
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

  .flex {
    display: flex;
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
