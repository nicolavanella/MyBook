/** Sottoinsieme di Element usato qui, per poter testare la logica senza un vero DOM. */
export interface ClosestCapable {
  closest: (selector: string) => unknown
}

/**
 * true solo per campi di testo genuini (input, textarea, l'editor
 * contenteditable) — mai per pulsanti, div, icone e simili — e MAI per le
 * barre di ricerca (marcate con l'attributo `data-search-input`), anche se
 * sono tecnicamente degli <input>. Usata dal listener globale in
 * MainLayout.tsx per sopprimere il menu contestuale nativo (e con esso il
 * correttore ortografico) ovunque non abbia senso mostrarlo.
 */
export function shouldShowContextMenu(target: ClosestCapable | null): boolean {
  if (!target) return false
  if (target.closest('[data-search-input]')) return false
  return !!target.closest('input, textarea, [contenteditable="true"]')
}
