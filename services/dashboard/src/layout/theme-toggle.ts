/**
 * Theme toggle functionality for the dashboard
 * Handles dark/light mode switching and persists user preference
 */
export const themeToggleScript = `
  // Dark mode functionality
  ;(function () {
    const themeToggle = document.getElementById('theme-toggle')
    const lightIcon = document.getElementById('theme-icon-light')
    const darkIcon = document.getElementById('theme-icon-dark')
    const htmlElement = document.documentElement
    const hljsLightTheme = document.getElementById('hljs-light-theme')
    const hljsDarkTheme = document.getElementById('hljs-dark-theme')

    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light'
    htmlElement.setAttribute('data-theme', currentTheme)
    updateTheme(currentTheme)

    // Theme toggle functionality
    themeToggle.addEventListener('click', function () {
      const currentTheme = htmlElement.getAttribute('data-theme')
      const newTheme = currentTheme === 'light' ? 'dark' : 'light'

      htmlElement.setAttribute('data-theme', newTheme)
      localStorage.setItem('theme', newTheme)
      updateTheme(newTheme)
    })

    function updateTheme(theme) {
      updateThemeIcon(theme)
      updateHighlightTheme(theme)
    }

    function updateThemeIcon(theme) {
      if (theme === 'dark') {
        lightIcon.style.display = 'none'
        darkIcon.style.display = 'block'
      } else {
        lightIcon.style.display = 'block'
        darkIcon.style.display = 'none'
      }
    }

    function updateHighlightTheme(theme) {
      if (theme === 'dark') {
        hljsLightTheme.disabled = true
        hljsDarkTheme.disabled = false
      } else {
        hljsLightTheme.disabled = false
        hljsDarkTheme.disabled = true
      }
    }
  })()
`
