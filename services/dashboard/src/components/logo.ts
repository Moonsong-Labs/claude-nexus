/**
 * Nexus logo component - A simple SVG representing interconnected nodes
 * Uses currentColor to automatically adapt to light/dark themes
 */
export const nexusLogo = (): string => {
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style="display: inline-block; vertical-align: middle;"
    >
      <!-- Central node -->
      <circle cx="12" cy="12" r="3"/>
      
      <!-- Outer nodes -->
      <circle cx="12" cy="4" r="2"/>
      <circle cx="20" cy="12" r="2"/>
      <circle cx="12" cy="20" r="2"/>
      <circle cx="4" cy="12" r="2"/>
      
      <!-- Connections -->
      <path d="M12 9 L12 7"/>
      <path d="M15 12 L18 12"/>
      <path d="M12 15 L12 18"/>
      <path d="M9 12 L6 12"/>
    </svg>
  `
}
