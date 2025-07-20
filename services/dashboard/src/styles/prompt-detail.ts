/**
 * Styles for MCP prompt detail page
 */

export const promptDetailStyles = `
  .header-section {
    margin-bottom: 2rem;
  }

  .back-link {
    color: #3b82f6;
    text-decoration: none;
    margin-bottom: 1rem;
    display: inline-block;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .subtitle {
    color: #6b7280;
    margin-top: 0.5rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .info-card {
    background-color: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
  }

  .info-card h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    margin: 0 0 0.5rem 0;
  }

  .info-card p {
    margin: 0;
    color: #1f2937;
  }

  .mono {
    font-family: monospace;
    font-size: 0.875rem;
  }

  .section {
    background-color: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .section h3 {
    margin: 0 0 1rem 0;
    color: #1f2937;
  }

  .content-container {
    background-color: #f9fafb;
    border-radius: 0.375rem;
    padding: 1rem;
    overflow-x: auto;
  }

  .content-container pre {
    margin: 0;
  }

  .content-container code {
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .error-container {
    text-align: center;
    padding: 3rem;
  }

  .error-container h2 {
    color: #dc2626;
    margin-bottom: 1rem;
  }

  .error-container p {
    color: #6b7280;
    margin-bottom: 2rem;
  }

  .btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    text-decoration: none;
    border-radius: 0.375rem;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .btn-primary {
    background-color: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background-color: #2563eb;
  }
`
