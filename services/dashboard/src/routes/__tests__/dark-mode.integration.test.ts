import { describe, it, expect, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { layout } from '../../layout/index.js'

/**
 * Test helpers for common dark mode assertions
 */
const expectThemeToggleButton = (html: string) => {
  expect(html).toContain('id="theme-toggle"')
  expect(html).toContain('title="Toggle dark mode"')
  expect(html).toContain('class="theme-toggle"')
}

const expectHighlightJsThemes = (html: string) => {
  // Check for highlight.js theme links with version-agnostic matching
  expect(html).toContain('id="hljs-light-theme"')
  expect(html).toMatch(/highlight\.js\/[\d.]+\/styles\/github\.min\.css/)

  expect(html).toContain('id="hljs-dark-theme"')
  expect(html).toMatch(/highlight\.js\/[\d.]+\/styles\/github-dark\.min\.css/)

  // Verify dark theme is disabled initially by checking the disabled attribute appears somewhere after the dark theme id
  const darkThemeIndex = html.indexOf('id="hljs-dark-theme"')
  const darkThemeElement = html.substring(darkThemeIndex, darkThemeIndex + 200)
  expect(darkThemeElement).toContain('disabled')
}

const expectThemeIcons = (html: string) => {
  expect(html).toContain('id="theme-icon-light"')
  expect(html).toContain('id="theme-icon-dark"')
  // Dark icon should be hidden initially
  expect(html).toContain('id="theme-icon-dark"')
  expect(html).toMatch(/id="theme-icon-dark"[^>]*style="display:none;"/)
}

const expectThemeScripts = (html: string) => {
  // Core theme functionality
  expect(html).toContain("localStorage.getItem('theme')")
  expect(html).toContain("htmlElement.setAttribute('data-theme'")
  expect(html).toContain("themeToggle.addEventListener('click'")
  expect(html).toContain('function updateTheme(theme)')
}

describe('Dark Mode Integration', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.get('/test', c => {
      return c.html(layout('Test Page', '<div>Test Content</div>', '', c))
    })
  })

  it('should include theme toggle components', async () => {
    const res = await app.request('/test')
    const html = await res.text()

    expectThemeToggleButton(html)
    expectThemeIcons(html)
  })

  it('should include theme stylesheets with proper configuration', async () => {
    const res = await app.request('/test')
    const html = await res.text()

    expectHighlightJsThemes(html)
  })

  it('should include theme initialization and switching scripts', async () => {
    const res = await app.request('/test')
    const html = await res.text()

    expectThemeScripts(html)
  })

  it('should define CSS variables for theming', async () => {
    const res = await app.request('/test')
    const html = await res.text()

    // Verify theme system is in place without checking exact values
    expect(html).toContain(':root {')
    expect(html).toContain('[data-theme="dark"] {')

    // Check that key theme variables are defined
    expect(html).toMatch(/--bg-primary:\s*#[0-9a-fA-F]+;/)
    expect(html).toMatch(/--text-primary:\s*#[0-9a-fA-F]+;/)
    expect(html).toMatch(/--btn-primary-bg:\s*#[0-9a-fA-F]+;/)
  })

  it('should apply dark mode CSS adjustments', async () => {
    const res = await app.request('/test')
    const html = await res.text()

    // Verify dark mode specific styles exist
    expect(html).toContain('[data-theme="dark"]')
    // Check for actual dark mode JSON viewer styles
    expect(html).toContain("[data-theme='dark'] andypf-json-viewer")
  })
})
