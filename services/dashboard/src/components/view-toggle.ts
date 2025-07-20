/**
 * Creates the view toggle buttons and hide tools checkbox
 */
export function viewToggle(): string {
  return `
    <div class="view-toggle" style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; gap: 0.5rem;">
        <button class="active" onclick="showView('conversation')">Conversation</button>
        <button onclick="showView('raw')">Raw JSON</button>
        <button onclick="showView('headers')">Headers & Metadata</button>
      </div>
      <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem; color: #374151; margin-bottom: 0;">
        <input
          type="checkbox"
          id="hide-tools-checkbox"
          onchange="toggleToolMessages()"
          style="cursor: pointer;"
        />
        <span>Hide tool use/results</span>
      </label>
    </div>
  `
}

/**
 * JavaScript for view toggle functionality
 */
export const viewToggleScript = `
function showView(view) {
  const conversationView = document.getElementById('conversation-view');
  const rawView = document.getElementById('raw-view');
  const headersView = document.getElementById('headers-view');
  const buttons = document.querySelectorAll('.view-toggle button');
  
  // Hide all views
  conversationView.classList.add('hidden');
  rawView.classList.add('hidden');
  headersView.classList.add('hidden');
  
  // Remove active from all buttons
  buttons.forEach(btn => btn.classList.remove('active'));
  
  if (view === 'conversation') {
    conversationView.classList.remove('hidden');
    buttons[0].classList.add('active');
  } else if (view === 'raw') {
    rawView.classList.remove('hidden');
    buttons[1].classList.add('active');
    
    // Initialize JSON viewers if not already done
    if (typeof setupJsonViewer === 'function') {
      setupJsonViewer('request-json-container', requestData);
      setupJsonViewer('response-json-container', responseData);
      
      // Parse and render streaming chunks
      if (typeof streamingChunks !== 'undefined') {
        streamingChunks.forEach((chunk, i) => {
          const chunkContainer = document.getElementById('chunk-' + i);
          if (chunkContainer) {
            try {
              const chunkData = JSON.parse(chunk.data);
              // Create a andypf-json-viewer element for each chunk
              const viewer = document.createElement('andypf-json-viewer');
              viewer.setAttribute('expand-icon-type', 'arrow');
              viewer.setAttribute('expanded', 'true');
              viewer.setAttribute('expand-level', '2');
              viewer.setAttribute('show-copy', 'true');
              viewer.setAttribute(
                'theme',
                '{"base00": "#f9fafb", "base01": "#f3f4f6", "base02": "#e5e7eb", "base03": "#d1d5db", "base04": "#9ca3af", "base05": "#374151", "base06": "#1f2937", "base07": "#111827", "base08": "#ef4444", "base09": "#f97316", "base0A": "#eab308", "base0B": "#22c55e", "base0C": "#06b6d4", "base0D": "#3b82f6", "base0E": "#8b5cf6", "base0F": "#ec4899"}'
              );
              viewer.data = chunkData;
              chunkContainer.innerHTML = '';
              chunkContainer.appendChild(viewer);
            } catch (e) {
              // If not valid JSON, display as text
              chunkContainer.textContent = chunk.data;
            }
          }
        });
      }
    }
  } else if (view === 'headers') {
    headersView.classList.remove('hidden');
    buttons[2].classList.add('active');
    
    // Render headers and metadata using andypf-json-viewer
    setTimeout(() => {
      // Render request headers
      if (requestHeaders) {
        const requestHeadersViewer = document.getElementById('request-headers');
        if (requestHeadersViewer) {
          requestHeadersViewer.data = requestHeaders;
        }
      }
      
      // Render response headers
      if (responseHeaders) {
        const responseHeadersViewer = document.getElementById('response-headers');
        if (responseHeadersViewer) {
          responseHeadersViewer.data = responseHeaders;
        }
      }
      
      // Render request metadata
      const metadataViewer = document.getElementById('request-metadata');
      if (metadataViewer && requestMetadata) {
        metadataViewer.data = requestMetadata;
      }
      
      // Render telemetry data
      if (telemetryData) {
        const telemetryViewer = document.getElementById('telemetry-data');
        if (telemetryViewer) {
          telemetryViewer.data = telemetryData;
        }
      }
    }, 100);
  }
}

function toggleToolMessages() {
  const checkbox = document.getElementById('hide-tools-checkbox');
  const conversationView = document.getElementById('conversation-view');
  
  if (checkbox.checked) {
    conversationView.classList.add('hide-tools');
    localStorage.setItem('hideToolMessages', 'true');
  } else {
    conversationView.classList.remove('hide-tools');
    localStorage.setItem('hideToolMessages', 'false');
  }
}
`
