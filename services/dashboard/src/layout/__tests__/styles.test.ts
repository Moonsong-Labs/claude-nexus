import { describe, it, expect, test } from 'bun:test'
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

/**
 * CSS Validation Tests
 * Validates CSS syntax, formatting, and common errors in dashboard styles
 */
describe('CSS Validation', () => {
  test('should not contain smart quotes or curly quotes', () => {
    // Check for various types of smart quotes
    const smartQuotes = [
      '\u2018',
      '\u2019',
      '\u201C',
      '\u201D',
      '\u201E',
      '\u201A',
      '\u201F',
      '\u2033',
      '\u2032',
    ]

    smartQuotes.forEach(quote => {
      expect(dashboardStyles).not.toContain(quote)
    })
  })

  test('should not contain HTML entities', () => {
    // Check for common HTML entities that might break CSS
    const htmlEntities = ['&quot;', '&#39;', '&apos;', '&lt;', '&gt;', '&amp;', '&#x27;', '&#x22;']

    htmlEntities.forEach(entity => {
      expect(dashboardStyles).not.toContain(entity)
    })
  })

  test('should have valid CSS syntax', () => {
    // Basic CSS syntax checks
    const lines = dashboardStyles.split('\n')
    let braceCount = 0

    lines.forEach((line, index) => {
      // Count braces
      braceCount += (line.match(/{/g) || []).length
      braceCount -= (line.match(/}/g) || []).length

      // Check for common CSS syntax errors
      // 1. Properties should end with semicolon (except before closing brace)
      const trimmedLine = line.trim()
      if (
        trimmedLine &&
        !trimmedLine.endsWith(';') &&
        !trimmedLine.endsWith('{') &&
        !trimmedLine.endsWith('}') &&
        !trimmedLine.endsWith(',') && // Multi-line selectors
        !trimmedLine.startsWith('/*') &&
        !trimmedLine.startsWith('*') &&
        !trimmedLine.startsWith('@') &&
        trimmedLine.includes(':') &&
        !lines[index + 1]?.trim().startsWith('}')
      ) {
        throw new Error(`Line ${index + 1} appears to be missing semicolon: "${trimmedLine}"`)
      }

      // 2. Check for double semicolons
      if (line.includes(';;')) {
        throw new Error(`Line ${index + 1} contains double semicolon: "${trimmedLine}"`)
      }

      // 3. Check for invalid property format (missing colon)
      if (
        trimmedLine &&
        !trimmedLine.includes(':') &&
        !trimmedLine.includes('{') &&
        !trimmedLine.includes('}') &&
        !trimmedLine.startsWith('/*') &&
        !trimmedLine.startsWith('*') &&
        !trimmedLine.startsWith('@') &&
        !trimmedLine.endsWith(',') && // Allow selectors that end with comma
        trimmedLine.includes('-')
      ) {
        throw new Error(`Line ${index + 1} might be missing colon: "${trimmedLine}"`)
      }
    })

    // Ensure all braces are balanced
    expect(braceCount).toBe(0)
  })

  test('should use consistent quote style', () => {
    // Extract all quoted strings
    const singleQuoteMatches = dashboardStyles.match(/'[^']*'/g) || []
    const doubleQuoteMatches = dashboardStyles.match(/"[^"]*"/g) || []

    // We should have some quotes in CSS
    expect(singleQuoteMatches.length + doubleQuoteMatches.length).toBeGreaterThan(0)

    // Check font-family declarations use consistent quotes
    const fontFamilyLines = dashboardStyles
      .split('\n')
      .filter(line => line.includes('font-family:'))
    fontFamilyLines.forEach(line => {
      // Font names with spaces should be quoted
      const fontNames = line.split(':')[1]?.split(',') || []
      fontNames.forEach(font => {
        const trimmedFont = font.trim().replace(/;$/, '')
        if (trimmedFont.includes(' ') && !trimmedFont.includes("'") && !trimmedFont.includes('"')) {
          throw new Error(`Font name with spaces should be quoted: ${trimmedFont}`)
        }
      })
    })
  })

  test('should have valid color values', () => {
    // Check hex colors
    const hexColors = dashboardStyles.match(/#[0-9a-fA-F]{3,8}/g) || []
    hexColors.forEach(color => {
      const validLengths = [4, 7, 9] // #RGB, #RRGGBB, #RRGGBBAA
      if (!validLengths.includes(color.length)) {
        throw new Error(`Invalid hex color length: ${color}`)
      }
    })

    // Check rgb/rgba colors
    const rgbColors = dashboardStyles.match(/rgba?\([^)]+\)/g) || []
    rgbColors.forEach(color => {
      if (color.startsWith('rgb(')) {
        const values = color.match(/\d+/g) || []
        expect(values.length).toBe(3)
        values.forEach(v => {
          const num = parseInt(v)
          expect(num).toBeGreaterThanOrEqual(0)
          expect(num).toBeLessThanOrEqual(255)
        })
      } else if (color.startsWith('rgba(')) {
        const values = color.match(/[\d.]+/g) || []
        expect(values.length).toBe(4)
        // Check RGB values
        for (let i = 0; i < 3; i++) {
          const num = parseInt(values[i])
          expect(num).toBeGreaterThanOrEqual(0)
          expect(num).toBeLessThanOrEqual(255)
        }
        // Check alpha value
        const alpha = parseFloat(values[3])
        expect(alpha).toBeGreaterThanOrEqual(0)
        expect(alpha).toBeLessThanOrEqual(1)
      }
    })
  })

  test('should have valid units', () => {
    // Check for common unit errors
    const propertyValues = dashboardStyles.match(/:\s*[^;{]+/g) || []
    propertyValues.forEach(value => {
      // Check for missing units on non-zero values
      const matches = value.match(/\b\d+\b(?!px|rem|em|%|vh|vw|s|ms|deg)/g) || []
      matches.forEach(match => {
        const num = parseInt(match)
        // 0 doesn't need units, line-height can be unitless, and some other properties
        if (
          num !== 0 &&
          !value.includes('line-height') &&
          !value.includes('z-index') &&
          !value.includes('opacity') &&
          !value.includes('flex') &&
          !value.includes('order')
        ) {
          console.warn(`Possible missing unit for value: ${match} in "${value}"`)
        }
      })
    })
  })

  test('should not have duplicate properties in same rule', () => {
    const rules = dashboardStyles.split('}').filter(r => r.trim())

    rules.forEach(rule => {
      const lines = rule.split('\n').filter(l => l.includes(':'))
      const properties = new Set()

      lines.forEach(line => {
        const prop = line.split(':')[0].trim()
        if (properties.has(prop)) {
          throw new Error(`Duplicate property "${prop}" in rule`)
        }
        properties.add(prop)
      })
    })
  })

  test('should have valid media queries', () => {
    const mediaQueries = dashboardStyles.match(/@media[^{]+{/g) || []
    mediaQueries.forEach(query => {
      // Basic media query validation
      expect(query).toMatch(/@media\s+[\w\s\-(),:]+\s*{/)
    })
  })

  test('should have valid keyframes', () => {
    const keyframes = dashboardStyles.match(/@keyframes\s+\w+\s*{[^}]*}/g) || []
    keyframes.forEach(keyframe => {
      // Check for valid keyframe syntax
      expect(keyframe).toMatch(/@keyframes\s+\w+/)
      // Should contain at least from/to or percentage values
      expect(keyframe).toMatch(/(from|to|\d+%)\s*{/)
    })
  })
})
