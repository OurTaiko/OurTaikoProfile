// Applies the saved colour theme before the page draws (a file, not inline, for the CSP).
;(() => {
  let theme = 'system'
  try {
    theme = localStorage.getItem('ourtaiko-profile-theme') || 'system'
  } catch {
    /* Storage may be unavailable. */
  }
  const dark =
    theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.add(dark ? 'scheme-dark' : 'scheme-light')
})()
