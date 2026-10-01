import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'mybook-theme'
const EVENT = 'mybook-settings-changed'

function getCachedTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch { return 'light' }
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(getCachedTheme)

  useEffect(() => {
    let cancelled = false
    window.mybook.settings.get().then((settings) => {
      if (cancelled) return
      const next: Theme = settings.theme === 'dark' ? 'dark' : 'light'
      setThemeState(next)
      try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = theme
  }, [theme])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
    void window.mybook.settings.update({ theme: next }).then((settings) => {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: settings }))
    }).catch(() => undefined)
  }

  return { theme, setTheme }
}
