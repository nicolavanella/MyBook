/**
 * Soglia di larghezza sotto la quale il pannello "Dove compare" (schede di
 * Personaggi/Località/Oggetti, v0.3.7) si nasconde automaticamente perché
 * non c'è spazio a sufficienza per mostrarlo insieme al resto della scheda.
 * Valore scelto empiricamente (sidebar entità + scheda + pannello restano
 * tutti leggibili da questa larghezza in su); non è collegato a un
 * breakpoint Tailwind esistente perché qui la soglia dipende dal layout a
 * tre colonne di questa pagina, non da un design responsive generale.
 */
export const TAG_PANEL_MIN_WINDOW_WIDTH = 1100

/** true se la finestra è abbastanza larga da poter mostrare il pannello "Dove compare". */
export function canShowTagPanel(windowWidth: number): boolean {
  return windowWidth >= TAG_PANEL_MIN_WINDOW_WIDTH
}
