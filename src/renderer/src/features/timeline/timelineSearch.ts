export interface SearchableEvent {
  title: string
  event_date: string
  description: string
  /** Data da calendario in formato ISO "AAAA-MM-GG" ("" se non impostata) — aggiunta in v0.3.4. */
  calendar_date?: string
}

/**
 * Filtra gli eventi per titolo, data narrativa, data da calendario e
 * descrizione, case-insensitive.
 *
 * La data da calendario viene confrontata sia in formato ISO ("2026-09-21")
 * sia nella forma mostrata a schermo ("lunedì, 21/09/2026"), così l'utente può
 * cercare digitando ciò che vede ("21/09", "lunedì", "2026") oppure il
 * formato tecnico. `formatDate` è iniettato dal chiamante (invece di importare
 * qui il formattatore) per tenere questo modulo puro e indipendente dalla
 * lingua corrente dell'interfaccia.
 */
export function filterTimelineEvents<T extends SearchableEvent>(
  events: T[],
  query: string,
  formatDate?: (iso: string) => string
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return events
  return events.filter((ev) => {
    const iso = ev.calendar_date ?? ''
    const displayed = iso && formatDate ? formatDate(iso) : ''
    return (
      ev.title.toLowerCase().includes(q) ||
      ev.event_date.toLowerCase().includes(q) ||
      ev.description.toLowerCase().includes(q) ||
      iso.toLowerCase().includes(q) ||
      displayed.toLowerCase().includes(q)
    )
  })
}
