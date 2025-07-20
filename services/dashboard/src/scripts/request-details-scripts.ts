/**
 * Client-side JavaScript for the request details page
 * This consolidates all the inline JavaScript into a single organized module
 */

import { copyToClipboardScript } from '../components/copy-button.js'
import { scrollToMessageScript } from '../components/navigation-arrows.js'
import { viewToggleScript } from '../components/view-toggle.js'

/**
 * Additional scripts specific to request details page
 */
const messageToggleScript = `
// Function to toggle message expansion
window.toggleMessage = function(messageId) {
  const idx = messageId.split('-')[1];
  const content = document.getElementById('content-' + idx);
  const truncated = document.getElementById('truncated-' + idx);
  
  if (content && truncated) {
    if (content.classList.contains('hidden')) {
      content.classList.remove('hidden');
      truncated.classList.add('hidden');
    } else {
      content.classList.add('hidden');
      truncated.classList.remove('hidden');
    }
  }
}
`

const jsonViewerScript = `
// Function to get JSON data from hidden elements
const getJsonData = id => {
  const el = document.getElementById(id);
  return el ? JSON.parse(el.textContent) : null;
}

// Function to set up JSON viewer with selective collapse using MutationObserver
function setupJsonViewer(containerId, data, keysToCollapse = ['tools', 'system']) {
  const container = document.getElementById(containerId);
  if (!container || !data) return;
  
  container.innerHTML = ''; // Clear existing content
  
  // Add show-copy class to container to enable copy functionality
  container.classList.add('show-copy');
  
  // Create a single viewer for visual cohesion
  const viewer = document.createElement('andypf-json-viewer');
  viewer.setAttribute('expand-icon-type', 'arrow');
  viewer.setAttribute('expanded', 'true');
  viewer.setAttribute('expand-level', '10');
  viewer.setAttribute('show-copy', 'true');
  viewer.setAttribute(
    'theme',
    '{"base00": "#f9fafb", "base01": "#f3f4f6", "base02": "#e5e7eb", "base03": "#d1d5db", "base04": "#9ca3af", "base05": "#374151", "base06": "#1f2937", "base07": "#111827", "base08": "#ef4444", "base09": "#f97316", "base0A": "#eab308", "base0B": "#22c55e", "base0C": "#06b6d4", "base0D": "#3b82f6", "base0E": "#8b5cf6", "base0F": "#ec4899"}'
  );
  viewer.data = data;
  container.appendChild(viewer);
  
  // Use MutationObserver to detect when content is rendered and collapse specific keys
  customElements.whenDefined('andypf-json-viewer').then(() => {
    // Inject dense styles into shadow DOM
    function injectDenseStyles() {
      if (!viewer.shadowRoot) return;
      
      // Check if we already injected styles
      if (viewer.shadowRoot.querySelector('#dense-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'dense-styles';
      style.textContent = \`
        /* Row and general spacing */
        .data-row { line-height: 1.2 !important; padding: 1px 0 !important; margin: 0 !important; }
        .data-row .data-row { padding-left: 16px !important; margin-left: 4px !important; border-left: solid 1px var(--base02) !important; }
        .key-value-wrapper { display: inline-flex !important; align-items: center !important; }
        .key, .value, .property { font-size: 10px !important; line-height: 1.05 !important; }
        .comma, .bracket { font-size: 10px !important; }
        /* Copy icon sizing and spacing */
        .copy.icon { width: 6px !important; height: 8px !important; margin-left: 6px !important; opacity: 0 !important; transition: opacity 0.2s !important; }
        .key-value-wrapper:hover .copy.icon { opacity: 1 !important; }
        .icon-wrapper:has(.copy.icon) { display: inline-flex !important; width: 20px !important; margin-left: 4px !important; flex-shrink: 0 !important; }
        .copy.icon:before { width: 6px !important; height: 8px !important; }
        /* CSS Triangle Arrow sizing - override the border-based arrow */
        .expand-icon-arrow .expand.icon {
          width: 0 !important; height: 0 !important;
          border-left: solid 4px var(--base0E) !important;
          border-top: solid 4px transparent !important;
          border-bottom: solid 4px transparent !important;
          margin-right: 4px !important; margin-left: 2px !important;
        }
        .expand-icon-arrow .expanded>.key-value-wrapper .expand.icon,
        .expand-icon-arrow .expanded.icon.expand {
          border-left-color: var(--base0D) !important;
        }
        /* Square/Circle icon sizing */
        .expand-icon-square .expand.icon, .expand-icon-circle .expand.icon {
          width: 7px !important; height: 7px !important;
        }
        /* Icon wrapper spacing */
        .icon-wrapper { margin-right: 2px !important; }
      \`;
      viewer.shadowRoot.appendChild(style);
    }
    
    // Function to collapse specific keys by clicking on the SVG expand/collapse icons
    function collapseSpecificKeys() {
      if (!viewer.shadowRoot) {
        return false;
      }
      
      let collapsedCount = 0;
      
      // Strategy: Find all .data-row elements that contain our target keys
      const dataRows = viewer.shadowRoot.querySelectorAll('.data-row');
      
      dataRows.forEach((row, index) => {
        // Look for the key element specifically, not just text content
        const keyElement = row.querySelector('.key');
        if (!keyElement) return;
        
        const keyText = keyElement.textContent || '';
        
        keysToCollapse.forEach(keyToCollapse => {
          // Check if this key element exactly matches our target
          if (keyText === '"' + keyToCollapse + '"' || keyText === keyToCollapse) {
            // Look for the expand icon within this row - it has class "expand icon clickable"
            const expandIcon = row.querySelector('.expand.icon.clickable');
            if (expandIcon) {
              expandIcon.click();
              collapsedCount++;
            }
          }
        });
      });
      
      return collapsedCount > 0;
    }
    
    // Start observing the shadow root for changes
    if (viewer.shadowRoot) {
      // Inject dense styles first
      injectDenseStyles();
      
      // Collapse specific keys after a short delay to ensure DOM is ready
      setTimeout(() => {
        collapseSpecificKeys();
      }, 100);
    }
  });
}

// Copy JSON to clipboard
function copyJsonToClipboard(type) {
  let data;
  if (type === 'request') {
    data = requestData;
  } else if (type === 'response') {
    data = responseData;
  }
  
  if (data) {
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard
      .writeText(jsonString)
      .then(() => {
        // Find the button that was clicked and update its text
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
          if (btn.onclick && btn.onclick.toString().includes("'" + type + "'")) {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.background = '#10b981';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.style.background = '';
            }, 2000);
          }
        });
      })
      .catch(err => {
        console.error('Failed to copy to clipboard:', err);
        alert('Failed to copy to clipboard');
      });
  }
}
`

const initializationScript = `
// Add copy link functionality
document.addEventListener('DOMContentLoaded', function() {
  // Restore tool messages visibility preference
  const hideToolsPref = localStorage.getItem('hideToolMessages');
  if (hideToolsPref === 'true') {
    const checkbox = document.getElementById('hide-tools-checkbox');
    const conversationView = document.getElementById('conversation-view');
    if (checkbox && conversationView) {
      checkbox.checked = true;
      conversationView.classList.add('hide-tools');
    }
  }
  
  // Function to show image in lightbox
  function showImageLightbox(imgSrc) {
    // Create lightbox overlay
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    
    // Create image element
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = 'Enlarged image';
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-lightbox-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close image');
    
    // Add elements to lightbox
    lightbox.appendChild(img);
    lightbox.appendChild(closeBtn);
    
    // Add to body
    document.body.appendChild(lightbox);
    
    // Click handlers to close
    const closeLightbox = () => {
      lightbox.remove();
    };
    
    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });
    
    // ESC key to close
    const escHandler = e => {
      if (e.key === 'Escape') {
        closeLightbox();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }
  
  // Add click handler using event delegation for thumbnail images
  document.addEventListener('click', function(e) {
    const target = e.target;
    
    // Handle thumbnail images - show lightbox
    if (target.tagName === 'IMG' && target.getAttribute('data-thumbnail-expand') === 'true') {
      e.preventDefault();
      e.stopPropagation();
      showImageLightbox(target.src);
    }
    // Handle regular tool-result images - also show lightbox
    else if (target.tagName === 'IMG' && target.classList.contains('tool-result-image')) {
      e.preventDefault();
      e.stopPropagation();
      showImageLightbox(target.src);
    }
  });
  
  // Add tooltips to existing thumbnail images
  document.querySelectorAll('img[data-thumbnail-expand="true"]').forEach(img => {
    img.title = 'Click to enlarge image';
  });
  
  // Add tooltips to regular tool-result images
  document.querySelectorAll('img.tool-result-image').forEach(img => {
    img.title = 'Click to enlarge image';
  });
  
  // Handle copy link buttons
  document.querySelectorAll('.copy-message-link').forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      const messageIndex = this.getAttribute('data-message-index');
      const url = window.location.origin + window.location.pathname + '#message-' + messageIndex;
      
      navigator.clipboard
        .writeText(url)
        .then(() => {
          // Show feedback
          const originalHtml = this.innerHTML;
          this.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg>';
          this.style.color = '#10b981';
          
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.style.color = '';
          }, 2000);
        })
        .catch(err => {
          console.error('Failed to copy link:', err);
        });
    });
  });
  
  // Scroll to message if hash is present
  if (window.location.hash) {
    const messageElement = document.querySelector(window.location.hash);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageElement.style.backgroundColor = '#fef3c7';
      setTimeout(() => {
        messageElement.style.backgroundColor = '';
      }, 2000);
    }
  }
  
  // Initialize syntax highlighting
  if (typeof hljs !== 'undefined') {
    hljs.highlightAll();
  }
  
  // Initialize JSON viewers on page load if raw view is active
  if (!document.getElementById('raw-view').classList.contains('hidden')) {
    setupJsonViewer('request-json-container', requestData);
    setupJsonViewer('response-json-container', responseData);
  }
});
`

/**
 * Combines all scripts into a single script block
 */
export function getRequestDetailsScripts(): string {
  return `
    ${copyToClipboardScript}
    ${scrollToMessageScript}
    ${viewToggleScript}
    ${messageToggleScript}
    ${jsonViewerScript}
    ${initializationScript}
  `
}
