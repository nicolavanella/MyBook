/**
 * Utilità per la "Data" (da calendario) degli eventi della Timeline — v0.3.4.
 *
 * FORMATO DI ARCHIVIAZIONE
 * La data è salvata come stringa ISO "AAAA-MM-GG" (es. "2026-09-21"), oppure
 * stringa vuota "" se non impostata. Scelta motivata da:
 *  - nessuna ambiguità di fuso orario (una data di calendario non è un
 *    istante: "21 settembre" resta tale ovunque);
 *  - l'ordine alfabetico delle stringhe coincide con l'ordine cronologico
 *    (con anno a 4 cifre), quindi ordinare/confrontare è banale;
 *  - è esattamente il formato che produce/accetta <input type="date">.
 *
 * Il modulo è "shared" (nessuna dipendenza da DOM o Electron) perché serve sia
 * al processo main (validazione Zod) sia al renderer (formattazione, ricerca).
 */

/** Lingue supportate dall'interfaccia (vedi i18n/translations.ts). */
export type CalendarLanguage = 'it' | 'en'

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Locale usato SOLO per il nome del giorno della settimana. */
const WEEKDAY_LOCALE: Record<CalendarLanguage, string> = { it: 'it-IT', en: 'en-GB' }

/**
 * Costruisce una Date UTC dai componenti, gestendo gli anni < 100 (il
 * costruttore Date li interpreterebbe come 19xx). Usare UTC evita che il fuso
 * orario locale (o l'ora legale) sposti la data di un giorno.
 */
function utcDate(year: number, month: number, day: number): Date {
  const d = new Date(Date.UTC(2000, 0, 1))
  d.setUTCFullYear(year, month - 1, day)
  return d
}

/**
 * true se `value` è una data ISO "AAAA-MM-GG" ESISTENTE nel calendario
 * (rifiuta ad es. "2026-02-30" o "2026-13-01", che una semplice regex
 * accetterebbe).
 */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const d = utcDate(year, month, day)
  // Se il giorno "trabocca" nel mese successivo (30 febbraio -> 2 marzo) i componenti non coincidono più.
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

/**
 * Formatta una data ISO come "Nome giorno, GG/MM/AAAA"
 * (es. "lunedì, 21/09/2026"). Ritorna "" se il valore è vuoto o non valido,
 * così il chiamante può mostrare un segnaposto senza ulteriori controlli.
 */
export function formatCalendarDate(iso: string | null | undefined, language: CalendarLanguage = 'it'): string {
  if (!iso || !isValidIsoDate(iso)) return ''
  const [year, month, day] = iso.split('-').map(Number)
  const weekday = new Intl.DateTimeFormat(WEEKDAY_LOCALE[language], { weekday: 'long', timeZone: 'UTC' }).format(
    utcDate(year, month, day)
  )
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const yyyy = String(year).padStart(4, '0')
  return `${weekday}, ${dd}/${mm}/${yyyy}`
}

/**
 * true se due istanti cadono nello stesso giorno di calendario LOCALE
 * (v0.3.8) — non lo stesso giorno UTC: i timestamp del registro attività
 * sono salvati in UTC, ma "lo stesso giorno" per chi scrive deve seguire il
 * fuso orario del suo computer, altrimenti la giornata cambierebbe a
 * mezzanotte UTC invece che a mezzanotte locale (ore piccole diverse a
 * seconda del fuso). getFullYear/getMonth/getDate su un oggetto Date
 * restituiscono sempre i componenti nel fuso orario LOCALE del sistema,
 * quindi il confronto qui è già quello giusto.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
