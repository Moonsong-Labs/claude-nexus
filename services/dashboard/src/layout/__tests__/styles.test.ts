import { describe, it, expect } from 'bun:test'
import { dashboardStyles } from '../styles.js'

/**
 * Tests for the dashboard theme system CSS variables.
 * Validates that all required CSS variables are defined and have correct values
 * for both light and dark themes.
 */
describe('Dashboard Theme CSS Variables', () => {
  /**
   * Extracts CSS variables from a style string for a given selector.
   * Handles complex CSS values including rgba(), calc(), and nested parentheses.
   */
  const extractCSSVariables = (styles: string, selector: string): Record<string, string> => {
    // Escape special regex characters in selector
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const selectorRegex = new RegExp(`${escapedSelector}\\s*{([^}]+)}`, 's')
    const match = styles.match(selectorRegex)
    if (!match) {
      return {}
    }

    // Parse CSS variables line by line for better accuracy
    const content = match[1]
    const variables: Record<string, string> = {}

    // Split into lines and process each line
    const lines = content.split('\n')
    let currentVar = ''
    let currentValue = ''
    let inValue = false

    for (const line of lines) {
      const trimmedLine = line.trim()

      // Check if this line starts a new CSS variable
      if (trimmedLine.startsWith('--')) {
        // Save previous variable if exists
        if (currentVar && currentValue) {
          variables[currentVar] = currentValue.trim().replace(/;$/, '')
        }

        // Parse new variable
        const colonIndex = trimmedLine.indexOf(':')
        if (colonIndex > -1) {
          currentVar = trimmedLine.substring(0, colonIndex).trim()
          currentValue = trimmedLine.substring(colonIndex + 1).trim()
          inValue = true
        }
      } else if (inValue && trimmedLine) {
        // Continue collecting multi-line values
        currentValue += ' ' + trimmedLine
      }

      // Check if value is complete (ends with semicolon not inside parentheses)
      if (currentValue && currentValue.match(/;\s*$/)) {
        const openParens = (currentValue.match(/\(/g) || []).length
        const closeParens = (currentValue.match(/\)/g) || []).length
        if (openParens === closeParens) {
          variables[currentVar] = currentValue.trim().replace(/;$/, '')
          currentVar = ''
          currentValue = ''
          inValue = false
        }
      }
    }

    // Save last variable if exists
    if (currentVar && currentValue) {
      variables[currentVar] = currentValue.trim().replace(/;$/, '')
    }

    return variables
  }

  // Define expected CSS variables structure
  const EXPECTED_CSS_VARIABLES = {
    backgrounds: ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-dark-section'],
    text: [
      '--text-primary',
      '--text-secondary',
      '--text-tertiary',
      '--text-link',
      '--text-link-hover',
    ],
    borders: ['--border-color', '--border-color-light'],
    buttons: [
      '--btn-primary-bg',
      '--btn-primary-hover',
      '--btn-secondary-bg',
      '--btn-secondary-hover',
    ],
    status: ['--color-success', '--color-error', '--color-warning', '--color-info'],
    messages: ['--msg-user-bg', '--msg-assistant-bg', '--msg-tool-use-bg', '--msg-tool-result-bg'],
  }

  // Define expected color values for themes
  const THEME_COLORS = {
    light: {
      '--bg-primary': '#f9fafb',
      '--bg-secondary': '#ffffff',
      '--text-primary': '#1f2937',
      '--text-secondary': '#6b7280',
      '--border-color': '#e5e7eb',
      '--btn-primary-bg': '#3b82f6',
      '--msg-user-bg': '#eff6ff',
      '--msg-assistant-bg': '#ffffff',
      '--msg-tool-use-bg': '#fef3c7',
      '--msg-tool-result-bg': '#dcfce7',
    },
    dark: {
      '--bg-primary': '#0f172a',
      '--bg-secondary': '#1e293b',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#cbd5e1',
      '--border-color': '#334155',
      '--btn-primary-bg': '#2563eb',
      '--msg-user-bg': '#1e3a8a',
      '--msg-assistant-bg': '#1e293b',
      '--msg-tool-use-bg': '#78350f',
      '--msg-tool-result-bg': '#14532d',
    },
  }

  /**
   * Helper function to test variable existence for a theme
   */
  const testVariableExistence = (themeName: string, selector: string) => {
    describe(`${themeName} theme variable existence`, () => {
      const vars = extractCSSVariables(dashboardStyles, selector)

      Object.entries(EXPECTED_CSS_VARIABLES).forEach(([category, variables]) => {
        it(`should define all ${category} variables`, () => {
          variables.forEach(varName => {
            expect(vars[varName]).toBeDefined()
          })
        })
      })
    })
  }

  /**
   * Helper function to test specific color values for a theme
   */
  const testColorValues = (themeName: 'light' | 'dark', selector: string) => {
    describe(`${themeName} theme color values`, () => {
      it(`should have correct color values`, () => {
        const vars = extractCSSVariables(dashboardStyles, selector)
        const expectedColors = THEME_COLORS[themeName]

        Object.entries(expectedColors).forEach(([varName, expectedValue]) => {
          expect(vars[varName]).toBe(expectedValue)
        })
      })
    })
  }

  // Test light theme
  testVariableExistence('Light', ':root')
  testColorValues('light', ':root')

  // Test dark theme
  testVariableExistence('Dark', '[data-theme="dark"]')
  testColorValues('dark', '[data-theme="dark"]')

  describe('Theme component styles', () => {
    it('should include theme toggle styles', () => {
      expect(dashboardStyles).toContain('.theme-toggle {')
      expect(dashboardStyles).toContain('width: 36px')
      expect(dashboardStyles).toContain('height: 36px')
      expect(dashboardStyles).toContain('.theme-toggle:hover {')
      expect(dashboardStyles).toContain('.theme-toggle svg {')
    })

    it('should include dark mode specific adjustments', () => {
      // Check for dark mode code block adjustments
      expect(dashboardStyles).toContain('[data-theme="dark"] .message-content pre')
      expect(dashboardStyles).toContain('[data-theme="dark"] .message-content code')
      expect(dashboardStyles).toContain('[data-theme="dark"] .hljs')

      // Check that styles use CSS variables
      expect(dashboardStyles).toContain('background: var(--bg-secondary)')
      expect(dashboardStyles).toContain('color: var(--text-primary)')
      expect(dashboardStyles).toContain('border-color: var(--border-color)')
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle missing selectors gracefully', () => {
      const result = extractCSSVariables(dashboardStyles, '.non-existent-selector')
      expect(result).toEqual({})
    })

    it('should handle empty style content', () => {
      const result = extractCSSVariables('', ':root')
      expect(result).toEqual({})
    })

    it('should handle malformed CSS', () => {
      const malformedCSS = ':root { --color: }'
      const result = extractCSSVariables(malformedCSS, ':root')
      // Should not throw and should handle gracefully
      expect(typeof result).toBe('object')
    })
  })
})
