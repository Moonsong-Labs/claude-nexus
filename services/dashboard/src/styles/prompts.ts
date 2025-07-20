/**
 * Styles for MCP prompts pages
 */

export const promptsStyles = `
  .header-section {
    margin-bottom: 2rem;
  }

  .subtitle {
    color: var(--text-secondary);
    margin-top: 0.5rem;
  }

  .sync-status {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: var(--shadow-sm);
  }

  .sync-status.error {
    background-color: var(--color-error-bg);
  }

  .sync-status.syncing {
    background-color: var(--color-info-bg);
  }

  .sync-status.success {
    background-color: var(--color-success-bg);
  }

  .sync-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .status-label {
    font-weight: 600;
  }

  .status-value {
    text-transform: capitalize;
  }

  .status-value.error {
    color: var(--color-error);
  }

  .status-value.syncing {
    color: var(--color-info);
  }

  .status-value.success {
    color: var(--color-success);
  }

  .sync-time {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .error-message {
    color: var(--color-error);
    font-size: 0.875rem;
  }

  .search-container {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: var(--shadow-sm);
  }

  .search-form {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: 400px;
  }

  .search-input {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    flex: 1;
    min-width: 200px;
    background-color: var(--bg-secondary);
    color: var(--text-primary);
  }

  .prompts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .prompt-card {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .prompt-card:hover {
    box-shadow: var(--shadow-md);
  }

  .prompt-name {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
  }

  .prompt-description {
    color: var(--text-secondary);
    margin: 0.5rem 0;
    line-height: 1.5;
  }

  .prompt-meta {
    display: flex;
    gap: 1rem;
    margin: 1rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .prompt-id {
    font-family: monospace;
    background-color: var(--bg-tertiary);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }

  .prompt-actions {
    margin-top: 1rem;
  }

  .btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    text-decoration: none;
    transition: background-color 0.2s;
    cursor: pointer;
    border: none;
  }

  .btn-primary {
    background-color: var(--btn-primary-bg);
    color: white;
  }

  .btn-primary:hover {
    background-color: var(--btn-primary-hover);
  }

  .btn-primary:disabled {
    background-color: var(--text-tertiary);
    cursor: not-allowed;
  }

  .btn-secondary {
    background-color: var(--btn-secondary-bg);
    color: white;
  }

  .btn-secondary:hover {
    background-color: var(--btn-secondary-hover);
  }

  .btn-small {
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary);
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
  }
`
