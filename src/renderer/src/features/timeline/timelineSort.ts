/**
 * Criteri di ordinamento della "Vista compatta" della Timeline (v0.3.4).
 *  - 'none'      : ordine manuale (quello trascinabile) — comportamento storico
 *  - 'narrative' : per "Data narrativa" (testo libero)
 *  - 'date'      : per "Data" da calendario (ISO AAAA-MM-GG)
 *
 * L'ordinamento è SOLO una vista: non modifica mai order_index nel database,
 * quindi tornando a 'none' si ritrova esattamente l'ordine manuale.
 */
export type TimelineSortMode = 'none' | 'narrative' | 'date'

export interface SortableEvent {
  event_date: string
  calendar_date?: string
}

/**
 * Ritorna una NUOVA lista ordinata (l'input non viene mutato).
 *  - Gli eventi senza valore per il criterio scelto vanno sempre in fondo.
 *  - A parità di valore si mantiene l'ordine manuale (Array.prototype.sort è
 *    stabile), così l'ordinamento è deterministico.
 *  - La data narrativa è testo libero ("Anno 1200", "Giorno 3 dopo
 *    l'incendio"): si usa un confronto "naturale", che tratta le sequenze di
 *    cifre come numeri ("Anno 2" viene prima di "Anno 10") e ignora
 *    maiuscole/minuscole e accenti.
 *  - La data da calendario in formato ISO si ordina già cronologicamente
 *    come semplice stringa.
 */
export function sortTimelineEvents<T extends SortableEvent>(events: T[], mode: TimelineSortMode, locale = 'it'): T[] {
  if (mode === 'none') return events

  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const keyOf = (ev: T): string => (mode === 'narrative' ? ev.event_date : ev.calendar_date ?? '').trim()

  return [...events].sort((a, b) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    if (!ka && !kb) return 0
    if (!ka) return 1 // a senza valore -> dopo
    if (!kb) return -1 // b senza valore -> dopo
    return mode === 'narrative' ? collator.compare(ka, kb) : ka < kb ? -1 : ka > kb ? 1 : 0
  })
}
