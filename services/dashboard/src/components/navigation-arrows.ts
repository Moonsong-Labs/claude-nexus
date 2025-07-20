/**
 * Props for navigation arrows component
 */
interface NavigationArrowsProps {
  currentIndex: number
  userMessageIndices: number[]
  currentUserIndex: number
}

/**
 * Creates navigation arrow buttons for jumping between user messages
 */
export function navigationArrows({
  userMessageIndices,
  currentUserIndex,
}: NavigationArrowsProps): string {
  const hasPrev = currentUserIndex < userMessageIndices.length - 1
  const hasNext = currentUserIndex > 0

  const prevIndex = hasNext ? userMessageIndices[currentUserIndex - 1] : -1
  const nextIndex = hasPrev ? userMessageIndices[currentUserIndex + 1] : -1

  return `
    <div class="nav-arrows-container">
      <button 
        class="nav-arrow nav-up" 
        ${!hasNext ? 'disabled' : ''} 
        onclick="${hasNext ? `scrollToMessage(${prevIndex})` : ''}"
        title="Previous user message"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
      <button 
        class="nav-arrow nav-down" 
        ${!hasPrev ? 'disabled' : ''} 
        onclick="${hasPrev ? `scrollToMessage(${nextIndex})` : ''}"
        title="Next user message"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
    </div>
  `
}

/**
 * JavaScript function for scrolling to messages
 */
export const scrollToMessageScript = `
function scrollToMessage(messageIndex) {
  const element = document.getElementById('message-' + messageIndex);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
`
