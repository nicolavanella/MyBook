import { useEffect } from 'react'

const EVENT = 'mybook-settings-changed'
type UiFontSize = 'small' | 'medium' | 'large'

/**
 * Percentuali applicate a `html { font-size }`: dato che le utility
 * Tailwind (text-sm, p-4, gap-2...) sono quasi tutte in rem, scalare la
 * radice del documento scala automaticamente l'intera interfaccia — sidebar,
 * albero del Manoscritto, modali, ecc. — senza dover toccare ogni
 * componente uno per uno. È lo stesso principio con cui i browser
 * implementano l'ingrandimento testo per l'accessibilità.
 */
export const UI_FONT_SCALE: Record<UiFontSize, string> = { small: '87.5%', medium: '100%', large: '112.5%' }

function applyScale(size: UiFontSize | undefined): void {
  document.documentElement.style.fontSize = UI_FONT_SCALE[size ?? 'medium'] ?? UI_FONT_SCALE.medium
}

/** Applica la dimensione testo dell'interfaccia salvata in Impostazioni > Generale, e la aggiorna in tempo reale se cambia. */
export function useUiScale(): void {
  useEffect(() => {
    let cancelled = false
    window.mybook.settings.get().then((s: any) => {
      if (!cancelled) applyScale(s.ui_font_size)
    })
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) applyScale(detail.ui_font_size)
    }
    window.addEventListener(EVENT, handler)
    return () => {
      cancelled = true
      window.removeEventListener(EVENT, handler)
    }
  }, [])
}
