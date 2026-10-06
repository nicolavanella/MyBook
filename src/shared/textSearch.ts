/**
 * MyBook — motore di ricerca/sostituzione del testo (v0.4.0).
 *
 * Modulo PURO (nessuna dipendenza da ProseMirror/DOM): lavora su stringhe e
 * restituisce intervalli; l'adattamento al documento dell'editor sta in
 * features/editor/extensions/searchExtension.ts. Così tutta la logica
 * delicata (parole intere con accenti, maiuscole, navigazione) è testata
 * con vitest senza avviare l'editor.
 *
 * Perché non si riusa la vecchia ricerca della toolbar (≤ 0.3.9): cercava
 * dentro ogni singolo nodo di testo, quindi una parola a cavallo di un
 * cambio di formattazione ("ciao **mondo**") non veniva trovata. Qui la
 * ricerca avviene sul testo CONTINUO di ogni paragrafo.
 */

export interface SearchOptions {
  /** "Distingui maiuscole e minuscole". */
  caseSensitive: boolean
  /** "Solo parole intere". */
  wholeWord: boolean
}

export interface TextRange {
  from: number
  to: number
}

/** Carattere sentinella con cui l'editor sostituisce i nodi non testuali (es. a capo forzato): non è mai una lettera, quindi non "attacca" due parole. */
export const LEAF_PLACEHOLDER = '\ufffc'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Costruisce l'espressione di ricerca. Note:
 *  - flag `u`: necessario per \p{L} e per il confronto Unicode;
 *  - maiuscole ignorate con il flag `i` (e non con toLowerCase sul testo):
 *    toLowerCase può cambiare la LUNGHEZZA della stringa ("İ" → "i̇"),
 *    sfasando tutti gli indici; con `i` gli indici restano quelli originali;
 *  - parola intera: lookaround con lettere/cifre/underscore Unicode al posto
 *    di \b, che in JavaScript considera "parola" solo [A-Za-z0-9_] e quindi
 *    sbaglia con le accentate ("perché", "già").
 */
export function buildSearchRegExp(query: string, options: SearchOptions): RegExp | null {
  if (query === '') return null
  const body = escapeRegExp(query)
  const pattern = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body
  return new RegExp(pattern, options.caseSensitive ? 'gu' : 'giu')
}

/** Tutte le occorrenze (non sovrapposte) di `query` in `text`, come intervalli di indici. */
export function findInText(text: string, query: string, options: SearchOptions): TextRange[] {
  const re = buildSearchRegExp(query, options)
  if (!re) return []
  const result: TextRange[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++ // sicurezza contro match vuoti: non può accadere con query non vuota, ma un ciclo infinito qui bloccherebbe l'app
      continue
    }
    result.push({ from: m.index, to: m.index + m[0].length })
  }
  return result
}

/**
 * Indice della prossima occorrenza rispetto a `position`, con giro completo.
 *  - avanti: la prima che inizia a `position` o dopo (se la selezione è
 *    l'occorrenza corrente, si passa `selection.to` e si va alla successiva);
 *  - indietro: l'ultima che finisce a `position` o prima.
 * -1 se non ci sono occorrenze.
 */
export function pickMatchIndex(matches: readonly TextRange[], position: number, direction: 'next' | 'prev'): number {
  if (matches.length === 0) return -1
  if (direction === 'next') {
    const index = matches.findIndex((m) => m.from >= position)
    return index === -1 ? 0 : index
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].to <= position) return i
  }
  return matches.length - 1
}

/** Indice dell'occorrenza che coincide ESATTAMENTE con la selezione (per "3 di 12" e per "Sostituisci"), o -1. */
export function indexOfSelection(matches: readonly TextRange[], from: number, to: number): number {
  return matches.findIndex((m) => m.from === from && m.to === to)
}
