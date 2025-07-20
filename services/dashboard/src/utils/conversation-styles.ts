/**
 * Common styles for conversation detail views
 */

export const styles = {
  // Spacing
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    xxl: '2rem',
  },

  // Typography
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
  },

  // Colors
  colors: {
    blue: '#3b82f6',
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
    },
    green: '#10b981',
    red: '#ef4444',
  },

  // Common component styles
  button: {
    base: `
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      cursor: pointer;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s;
    `,
  },

  // Tab styles
  tab: {
    inactive: {
      borderBottom: '2px solid transparent',
      color: '#6b7280',
    },
    active: {
      borderBottom: '2px solid #3b82f6',
      color: '#3b82f6',
    },
    hover: {
      color: '#4b5563',
    },
  },

  // Stats grid
  statsGrid: {
    container:
      'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;',
    card: `
      background: #f9fafb;
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid #e5e7eb;
    `,
    label: 'font-size: 0.875rem; color: #6b7280; margin-bottom: 0.25rem;',
    value: 'font-size: 1.125rem; font-weight: 600; color: #1f2937;',
  },

  // Branch chip
  branchChip: {
    base: `
      display: inline-block;
      font-size: 0.875rem;
      padding: 0.125rem 0.75rem;
      border-radius: 0.25rem;
      text-decoration: none;
      border: 1px solid;
      transition: all 0.2s;
      white-space: nowrap;
    `,
    main: {
      background: '#f3f4f6',
      color: '#4b5563',
      borderColor: '#e5e7eb',
    },
    active: {
      background: '#f3f4f6',
      color: '#1f2937',
      borderColor: '#9ca3af',
      fontWeight: '600',
    },
  },

  // Request ID link
  requestIdLink: `
    font-size: 0.75rem;
    color: #3b82f6;
    text-decoration: none;
    font-family: monospace;
    border: 1px solid #e5e7eb;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: #f9fafb;
    transition: all 0.2s;
    display: inline-block;
  `,

  // Section styles
  section: {
    container: 'margin-bottom: 0.25rem;',
    header: `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 1rem;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem 0.5rem 0 0;
    `,
    content: `
      padding: 0.75rem 1rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 0.5rem 0.5rem;
    `,
  },

  // Tree view
  tree: {
    container: `
      width: 100%;
      position: relative;
      overflow: hidden;
      cursor: grab;
    `,
    innerContainer: `
      position: relative;
      transform: translate(0px, 0px);
    `,
  },
}

/**
 * Generate inline style string from style object
 */
export function styleToString(styleObj: Record<string, any>): string {
  return Object.entries(styleObj)
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
      return `${cssKey}: ${value}`
    })
    .join('; ')
}

/**
 * Get branch color based on branch name
 */
export function getBranchColor(branch: string): string {
  if (branch === 'main') {
    return styles.colors.gray[600]
  }

  // Use a hash function to generate consistent colors for branches
  let hash = 0
  for (let i = 0; i < branch.length; i++) {
    hash = branch.charCodeAt(i) + ((hash << 5) - hash)
  }

  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
  ]

  return colors[Math.abs(hash) % colors.length]
}
