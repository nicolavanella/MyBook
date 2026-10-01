import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface MarkOccurrence {
  from: number
  to: number
  attrs: Record<string, any>
}

/**
 * Trova tutte le occorrenze di un mark nel documento, in ordine di
 * posizione (dall'inizio alla fine del testo) — usato dalle sezioni
 * "Commenti" e "Tag" del pannello scena per elencare le annotazioni
 * nell'ordine in cui compaiono nel testo, non nell'ordine di creazione.
 * Occorrenze consecutive dello stesso mark con gli stessi attributi (es. lo
 * stesso commento esteso su più nodi di testo per via di altra formattazione
 * mista) vengono unite in una sola voce.
 */
export function findMarkOccurrences(doc: ProseMirrorNode, markName: string): MarkOccurrence[] {
  const occurrences: MarkOccurrence[] = []
  let current: MarkOccurrence | null = null

  doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = node.marks.find((m) => m.type.name === markName)
    if (!mark) {
      current = null
      return
    }
    const sameAsCurrent =
      current !== null &&
      current.to === pos &&
      Object.keys(mark.attrs).every((k) => mark.attrs[k] === (current as MarkOccurrence).attrs[k])
    if (sameAsCurrent && current) {
      current.to = pos + node.nodeSize
    } else {
      current = { from: pos, to: pos + node.nodeSize, attrs: { ...mark.attrs } }
      occurrences.push(current)
    }
  })

  return occurrences
}

/**
 * Tutti gli intervalli del documento che portano il mark `markName` con
 * ESATTAMENTE gli attributi indicati (es. { commentId: 'abc' }).
 *
 * Serve a rimuovere un singolo commento: il suo testo può occupare PIÙ nodi di
 * testo (un pezzo in grassetto in mezzo al passaggio commentato spezza il
 * testo in tre nodi) o più intervalli separati (dopo un copia/incolla). Le
 * occorrenze consecutive sono già unite da findMarkOccurrences.
 */
export function findMarkRanges(
  doc: ProseMirrorNode,
  markName: string,
  attrs: Record<string, any>
): { from: number; to: number }[] {
  return findMarkOccurrences(doc, markName)
    .filter((occ) => Object.keys(attrs).every((k) => occ.attrs[k] === attrs[k]))
    .map(({ from, to }) => ({ from, to }))
}

/**
 * Aggiunge alla transazione `tr` la rimozione del mark `markName` (con gli
 * attributi indicati) da TUTTI i suoi intervalli. Ritorna quanti intervalli
 * sono stati ripuliti (0 = il mark non era presente).
 *
 * Fix v0.3.4: la versione precedente di "Elimina commento" rimuoveva il mark
 * solo dal PRIMO nodo di testo trovato, lasciando sottolineata la parte di
 * testo commentato che stava in nodi successivi.
 *
 * `tr` è tipizzata in modo strutturale (solo i metodi usati) per non
 * dipendere da tipi di prosemirror-state: in produzione è la transazione
 * di TipTap, nei test una Transaction reale di prosemirror-state.
 */
export function removeMarkOccurrences(
  tr: { doc: ProseMirrorNode; removeMark(from: number, to: number, mark: any): unknown },
  markType: any,
  attrs: Record<string, any>
): number {
  const ranges = findMarkRanges(tr.doc, markType.name, attrs)
  // removeMark non cambia la lunghezza del documento, quindi le posizioni calcolate in anticipo restano valide.
  for (const { from, to } of ranges) tr.removeMark(from, to, markType)
  return ranges.length
}
