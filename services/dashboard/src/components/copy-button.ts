import { escapeHtml } from '../utils/formatters.js'

/**
 * Props for the copy button component
 */
interface CopyButtonProps {
  text: string
  title?: string
  size?: 'small' | 'medium'
  className?: string
}

/**
 * Creates a copy button component that copies text to clipboard
 */
export function copyButton({
  text,
  title = 'Copy',
  size = 'small',
  className = '',
}: CopyButtonProps): string {
  const iconSize = size === 'small' ? 14 : 16
  const padding = size === 'small' ? '0.25rem' : '0.5rem'

  // Generate a unique ID for this button instance
  const buttonId = `copy-btn-${Math.random().toString(36).substr(2, 9)}`

  return `
    <button
      id="${buttonId}"
      class="copy-btn ${className}"
      title="${escapeHtml(title)}"
      style="
        padding: ${padding};
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        background: white;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      "
      onclick="copyToClipboard('${escapeHtml(text).replace(/'/g, "\\'")}', '${buttonId}')"
      onmouseover="this.style.backgroundColor='#f3f4f6'"
      onmouseout="this.style.backgroundColor='white'"
    >
      <svg
        width="${iconSize}"
        height="${iconSize}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  `
}

/**
 * JavaScript function to be included in the page for copy functionality
 * This should be included once in the page's script section
 */
export const copyToClipboardScript = `
function copyToClipboard(text, buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const originalHTML = button.innerHTML;
      
      // Show success icon
      button.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg>';
      button.style.borderColor = '#10b981';
      
      // Revert after 2 seconds
      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.borderColor = '#e5e7eb';
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy:', err);
      // Show error feedback
      button.style.borderColor = '#ef4444';
      setTimeout(() => {
        button.style.borderColor = '#e5e7eb';
      }, 2000);
    });
}
`
