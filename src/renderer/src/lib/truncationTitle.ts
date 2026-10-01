/**
 * Tooltip "solo se serve" per testo troncato con CSS (`truncate` =
 * overflow:hidden + text-overflow:ellipsis) — v0.3.4.
 *
 * Un attributo `title` fisso mostrerebbe il tooltip anche per nomi brevi,
 * già leggibili per intero: rumoroso. Qui invece, al passaggio del mouse,
 * si misura l'elemento e il `title` (tooltip nativo del sistema) viene
 * impostato solo se il contenuto è davvero più largo dello spazio
 * disponibile, altrimenti viene rimosso.
 *
 * Uso: <span className="truncate" onMouseEnter={(e) => titleIfTruncated(e.currentTarget, nome)}>
 */

/** Sottoinsieme di HTMLElement realmente usato: permette di testare la funzione senza DOM. */
export interface TruncatableElement {
  scrollWidth: number
  clientWidth: number
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** true se il contenuto dell'elemento è più largo del suo spazio visibile (cioè è troncato). */
export function isTruncated(el: Pick<TruncatableElement, 'scrollWidth' | 'clientWidth'>): boolean {
  return el.scrollWidth > el.clientWidth
}

/** Imposta `title` = testo completo se l'elemento è troncato, lo rimuove altrimenti. */
export function titleIfTruncated(el: TruncatableElement, fullText: string): void {
  if (isTruncated(el)) el.setAttribute('title', fullText)
  else el.removeAttribute('title')
}
