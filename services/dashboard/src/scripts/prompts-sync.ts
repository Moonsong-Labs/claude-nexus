/**
 * Client-side script for MCP prompts sync functionality
 */

export const promptsSyncScript = `
  async function triggerSync() {
    const button = document.getElementById('sync-button');
    if (!button) return;
    
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Syncing...';

    try {
      // Get CSRF token from meta tag
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

      const response = await fetch('/dashboard/api/mcp/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-CSRF-Token': csrfToken || '',
        },
      });

      if (response.ok) {
        // Reload page after a short delay to show updated status
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        let errorMessage = 'Unknown error';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText || errorMessage;
        }
        
        // Display error in UI instead of alert
        const errorElement = document.getElementById('sync-error');
        if (errorElement) {
          errorElement.textContent = 'Sync failed: ' + errorMessage;
          errorElement.style.display = 'block';
        } else {
          console.error('Sync failed:', errorMessage);
        }
        
        button.disabled = false;
        button.textContent = originalText;
      }
    } catch (error) {
      console.error('Sync request failed:', error);
      
      // Display error in UI
      const errorElement = document.getElementById('sync-error');
      if (errorElement) {
        errorElement.textContent = 'Sync failed: ' + (error instanceof Error ? error.message : 'Network error');
        errorElement.style.display = 'block';
      }
      
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  // Make function available globally
  window.triggerSync = triggerSync;
`
