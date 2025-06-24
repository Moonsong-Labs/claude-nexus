import { describe, test, expect } from 'bun:test'
import { dashboardStyles } from '../../services/dashboard/src/layout/styles'

describe('CSS Validation', () => {
  test('should not contain smart quotes or curly quotes', () => {
    // Check for various types of smart quotes
    const smartQuotes = ['\u2018', '\u2019', '\u201C', '\u201D', '\u201E', '\u201A', '\u201F', '\u2033', '\u2032']
    
    smartQuotes.forEach(quote => {
      expect(dashboardStyles).not.toContain(quote)
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
      if (trimmedLine && 
          !trimmedLine.endsWith(';') && 
          !trimmedLine.endsWith('{') && 
          !trimmedLine.endsWith('}') &&
          !trimmedLine.endsWith(',') &&  // Multi-line selectors
          !trimmedLine.startsWith('/*') &&
          !trimmedLine.startsWith('*') &&
          !trimmedLine.startsWith('@') &&
          trimmedLine.includes(':') &&
          !lines[index + 1]?.trim().startsWith('}')) {
        throw new Error(`Line ${index + 1} appears to be missing semicolon: "${trimmedLine}"`)
      }
      
      // 2. Check for double semicolons
      if (line.includes(';;')) {
        throw new Error(`Line ${index + 1} contains double semicolon: "${trimmedLine}"`)
      }
      
      // 3. Check for invalid property format (missing colon)
      if (trimmedLine && 
          !trimmedLine.includes(':') && 
          !trimmedLine.includes('{') && 
          !trimmedLine.includes('}') &&
          !trimmedLine.startsWith('/*') &&
          !trimmedLine.startsWith('*') &&
          !trimmedLine.startsWith('@') &&
          trimmedLine.includes('-')) {
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
    const fontFamilyLines = dashboardStyles.split('\n').filter(line => line.includes('font-family:'))
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
        if (num !== 0 && !value.includes('line-height') && !value.includes('z-index') && 
            !value.includes('opacity') && !value.includes('flex') && !value.includes('order')) {
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