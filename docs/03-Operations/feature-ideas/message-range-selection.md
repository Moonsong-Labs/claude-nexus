# Message Range Selection Feature

This document preserves feature ideas found in the deprecated `services/dashboard/public/message-selection.js` file during code grooming on 2025-07-20.

## Overview

The deprecated file contained advanced message selection functionality that could enhance the current message view in `request-details.ts`.

## Features to Consider

### 1. URL Hash-Based Range Selection

**Current State**: The dashboard supports single message selection via hash (e.g., `#message-5`)

**Proposed Enhancement**: Support range selection via hash:

- Format: `#messages-3-7` (select messages 3 through 7)
- Use case: Share links that reference a specific conversation segment

### 2. Shift+Click for Range Selection

**Current State**: Messages can be navigated with up/down arrows

**Proposed Enhancement**:

- Click a message to select it
- Shift+click another message to select the range between them
- Visual highlighting for selected messages

### 3. Toast Notifications

**Current State**: No visual feedback for copy operations

**Proposed Enhancement**:

- Show toast notification when message link is copied
- Fade-out animation after 3 seconds
- Accessible with ARIA attributes

## Implementation Reference

Key functions from the deprecated file:

```javascript
// Parse hash for range selection
function parseMessageHash(hash) {
  if (!hash || !hash.startsWith('#messages-')) return null

  const parts = hash.substring('#messages-'.length).split('-')

  if (parts.length === 1) {
    const index = parseInt(parts[0], 10)
    return { start: index, end: index }
  } else if (parts.length === 2) {
    const start = parseInt(parts[0], 10)
    const end = parseInt(parts[1], 10)
    return { start, end }
  }
  return null
}

// Highlight message range
function highlightMessages(start, end) {
  document.querySelectorAll('.message').forEach(msg => msg.classList.remove('message-selected'))

  for (let i = start; i <= end; i++) {
    const message = document.getElementById(`message-${i}`)
    if (message) {
      message.classList.add('message-selected')
    }
  }
}
```

## Benefits

1. **Enhanced Sharing**: Users can share links to specific conversation segments
2. **Better UX**: Familiar shift+click pattern for multi-selection
3. **Visual Feedback**: Toast notifications improve user confidence in actions

## Considerations

- Would require CSS for `.message-selected` and `.toast-notification` classes
- Need to ensure compatibility with existing message navigation
- Consider mobile/touch device support for range selection
