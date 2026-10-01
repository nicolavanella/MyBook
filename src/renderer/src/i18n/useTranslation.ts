import { useCallback, useEffect, useState } from 'react'
import { translations, type Language, type TranslationKey } from './translations'

const STORAGE_KEY = 'mybook-language'
const EVENT = 'mybook-settings-changed'

function getCachedLanguage(): Language {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'it'
  } catch {
    return 'it'
  }
}

/**
 * Lingua corrente + funzione di traduzione `t(key)`. Le chiavi non ancora
 * tradotte (il dizionario copre per ora solo navigazione e Impostazioni,
 * vedi translations.ts) ricadono sull'italiano invece di mostrare la chiave
 * grezza o una stringa vuota.
 */
export function useTranslation(): { language: Language; setLanguage: (l: Language) => void; t: (key: TranslationKey) => string } {
  const [language, setLanguageState] = useState<Language>(getCachedLanguage)

  useEffect(() => {
    let cancelled = false
    window.mybook.settings
      .get()
      .then((settings) => {
        if (cancelled) return
        const next: Language = settings.language === 'en' ? 'en' : 'it'
        setLanguageState(next)
        try {
          window.localStorage.setItem(STORAGE_KEY, next)
        } catch {}
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.language) {
        const next: Language = detail.language === 'en' ? 'en' : 'it'
        setLanguageState(next)
        try {
          window.localStorage.setItem(STORAGE_KEY, next)
        } catch {}
      }
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  const setLanguage = (next: Language) => {
    setLanguageState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {}
    void window.mybook.settings
      .update({ language: next })
      .then((settings) => {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: settings }))
      })
      .catch(() => undefined)
  }

  const t = useCallback(
    (key: TranslationKey) => translations[language][key] ?? translations.it[key] ?? key,
    [language]
  )

  return { language, setLanguage, t }
}
