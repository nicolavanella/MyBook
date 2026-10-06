/**
 * Lingua dell'interfaccia nel renderer (v0.4.0).
 *
 * Prima ogni componente che chiamava `useTranslation()` rileggeva le
 * impostazioni via IPC al proprio mount: con l'intera app localizzata
 * sarebbero decine di richieste identiche. Ora la lingua vive in UNO store
 * (zustand, già usato altrove nel progetto), idratato una volta sola da
 * `initLanguage()` all'avvio e riallineato dall'evento globale
 * `mybook-settings-changed` — lo stesso che già usano tema e scala UI.
 *
 * Il cambio lingua è immediato: lo store sostituisce `t`, e ogni componente
 * che lo seleziona si ridisegna senza riavviare l'app.
 */
import { create } from 'zustand'
import {
  createTranslator,
  localeOf,
  normalizeLanguage,
  type Language,
  type Translator
} from '@shared/i18n'

const STORAGE_KEY = 'mybook-language'
const SETTINGS_EVENT = 'mybook-settings-changed'

/** Cache sincrona in localStorage: evita il "lampo" in italiano al primo render, prima che arrivino le impostazioni dal main. */
function readCachedLanguage(): Language {
  try {
    return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'it'
  }
}

interface LanguageState {
  language: Language
  t: Translator
  /** Applica la lingua SOLO in memoria/cache (non scrive sulle impostazioni): usata per riallineare lo store a un valore già persistito. */
  applyLanguage: (language: Language) => void
}

export const useLanguageStore = create<LanguageState>((set) => {
  const initial = typeof window === 'undefined' ? 'it' : readCachedLanguage()
  return {
    language: initial,
    t: createTranslator(initial),
    applyLanguage: (language) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, language)
      } catch {
        /* localStorage non disponibile: la lingua resta valida in memoria */
      }
      if (typeof document !== 'undefined') document.documentElement.lang = language
      set({ language, t: createTranslator(language) })
    }
  }
})

let initialized = false

/**
 * Da chiamare una volta all'avvio (main.tsx): legge la lingua salvata e si
 * mette in ascolto dei cambi di impostazioni fatti da qualunque pagina.
 */
export function initLanguage(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const { applyLanguage } = useLanguageStore.getState()
  applyLanguage(readCachedLanguage())

  window.mybook.settings
    .get()
    .then((settings) => applyLanguage(normalizeLanguage(settings.language)))
    .catch(() => undefined)

  window.addEventListener(SETTINGS_EVENT, (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.language) applyLanguage(normalizeLanguage(detail.language))
  })
}

/** Traduzione "fuori dai componenti" (gestori di eventi, utility): usa la lingua corrente dello store, senza sottoscriversi. */
export const tNow: Translator = (key, params) => useLanguageStore.getState().t(key, params)

/**
 * Hook dei componenti: lingua corrente, funzione `t`, locale per le
 * formattazioni di date/numeri e setter che PERSISTE la scelta.
 */
export function useTranslation(): {
  language: Language
  locale: string
  t: Translator
  setLanguage: (language: Language) => void
} {
  const language = useLanguageStore((s) => s.language)
  const t = useLanguageStore((s) => s.t)
  const applyLanguage = useLanguageStore((s) => s.applyLanguage)

  const setLanguage = (next: Language): void => {
    applyLanguage(next)
    void window.mybook.settings
      .update({ language: next })
      .then((settings) => window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings })))
      .catch(() => undefined)
  }

  return { language, locale: localeOf(language), t, setLanguage }
}
