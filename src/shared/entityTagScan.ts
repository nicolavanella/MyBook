/**
 * Ricerca delle occorrenze del mark "entityTag" (tag su Personaggi,
 * Località, Oggetti — vedi editor/extensions/editorExtensions.ts) dentro un
 * contenuto TipTap salvato come stringa JSON. Modulo puro e senza
 * dipendenze da ProseMirror: usato lato main (per elencare, nella scheda di
 * un personaggio/località/oggetto, in quali capitoli/scene compare) e in
 * teoria riusabile anche lato renderer.
 *
 * L'ordine e il conteggio delle occorrenze DEVONO coincidere con quelli che
 * produce editor/markScan.ts::findMarkOccurrences sull'editor live (stesso
 * JSON, stesso ordine di visita in profondità): è quell'indice (0, 1, 2…)
 * che permette di "ritrovare" la stessa occorrenza dopo la navigazione verso
 * la scena, quando l'editor la carica di nuovo da zero — vedi
 * SceneEditor.tsx (gestione di pendingTagJump).
 */

interface TiptapNode {
  type?: string
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: TiptapNode[]
}

export interface EntityTagOccurrence {
  /** Indice (0-based) dell'occorrenza nell'ordine del documento — stabile finché il contenuto non cambia. */
  occurrenceIndex: number
  /** Il testo taggato stesso, da mostrare come contesto nell'elenco degli usi. */
  snippet: string
}

function hasMatchingTag(node: TiptapNode, entityType: string, entityId: string): boolean {
  return (
    node.marks?.some(
      (m) => m.type === 'entityTag' && m.attrs?.entityType === entityType && m.attrs?.entityId === entityId
    ) ?? false
  )
}

/**
 * Visita `nodes` (i figli di UN nodo, cioè un singolo array `content`)
 * accumulando le occorrenze in `occurrences`. Due nodi di testo consecutivi
 * con lo stesso tag vengono uniti in una sola occorrenza (stessa logica di
 * findMarkOccurrences per la formattazione mista, es. una parola in
 * grassetto in mezzo al testo taggato); un nodo non di testo (immagine…) o
 * un array `content` annidato chiude sempre l'occorrenza corrente prima di
 * proseguire, così un tag non "salta" oltre un confine di blocco.
 */
function collectRuns(
  nodes: TiptapNode[],
  entityType: string,
  entityId: string,
  occurrences: EntityTagOccurrence[],
  indexRef: { value: number }
): void {
  let current: { text: string } | null = null
  const flush = (): void => {
    if (current) {
      occurrences.push({ occurrenceIndex: indexRef.value++, snippet: current.text })
      current = null
    }
  }
  for (const node of nodes) {
    if (node.type === 'text' && typeof node.text === 'string') {
      if (hasMatchingTag(node, entityType, entityId)) {
        current = current ? { text: current.text + node.text } : { text: node.text }
      } else {
        flush()
      }
      continue
    }
    flush()
    if (Array.isArray(node.content)) collectRuns(node.content, entityType, entityId, occurrences, indexRef)
  }
  flush()
}

/**
 * Tutte le occorrenze del tag (entityType, entityId) in un contenuto TipTap.
 * Ritorna array vuoto per contenuto assente, non valido, o senza occorrenze.
 */
export function findEntityTagOccurrences(
  tiptapJson: string | null | undefined,
  entityType: string,
  entityId: string
): EntityTagOccurrence[] {
  if (!tiptapJson || !entityType || !entityId) return []
  let doc: TiptapNode
  try {
    doc = JSON.parse(tiptapJson)
  } catch {
    return []
  }
  if (!Array.isArray(doc.content)) return []
  const occurrences: EntityTagOccurrence[] = []
  collectRuns(doc.content, entityType, entityId, occurrences, { value: 0 })
  return occurrences
}

export interface EntityTagCount {
  entityType: string
  entityId: string
  count: number
}

/** Tutte le coppie (entityType, entityId) taggate da qualche parte nel documento, senza doppioni. */
function collectDistinctTagKeys(nodes: TiptapNode[], keys: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'text' && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'entityTag' && mark.attrs?.entityType && mark.attrs?.entityId) {
          keys.add(`${mark.attrs.entityType}:${mark.attrs.entityId}`)
        }
      }
    }
    if (Array.isArray(node.content)) collectDistinctTagKeys(node.content, keys)
  }
}

/**
 * Conta le occorrenze di OGNI tag presente in un contenuto TipTap (non solo
 * di una singola entità) — usato dalla scheda Statistiche > Analisi per
 * l'elenco "tag presenti" di ogni capitolo (v0.3.6). Ogni voce riusa
 * findEntityTagOccurrences per il conteggio, così la definizione di
 * "occorrenza" (nodi di testo adiacenti con lo stesso tag = una sola) resta
 * unica e coerente in tutta l'app, invece di essere ridefinita qui.
 */
export function countAllEntityTags(tiptapJson: string | null | undefined): EntityTagCount[] {
  if (!tiptapJson) return []
  let doc: TiptapNode
  try {
    doc = JSON.parse(tiptapJson)
  } catch {
    return []
  }
  if (!Array.isArray(doc.content)) return []
  const keys = new Set<string>()
  collectDistinctTagKeys(doc.content, keys)
  return [...keys].map((key) => {
    const separatorIndex = key.indexOf(':')
    const entityType = key.slice(0, separatorIndex)
    const entityId = key.slice(separatorIndex + 1)
    return { entityType, entityId, count: findEntityTagOccurrences(tiptapJson, entityType, entityId).length }
  })
}

export interface EntityTagOccurrenceFull extends EntityTagOccurrence {
  entityType: string
  entityId: string
}

/**
 * Tutte le occorrenze di TUTTI i tag presenti in un contenuto TipTap, con
 * l'entità di ciascuna (v0.3.8) — usata per popolare/aggiornare la tabella
 * `scene_tags` ogni volta che una scena viene salvata (vedi
 * DocumentService), senza dover conoscere in anticipo quali entità sono
 * taggate: le scopre da sole scansionando il documento una volta.
 */
export function findAllEntityTagOccurrences(tiptapJson: string | null | undefined): EntityTagOccurrenceFull[] {
  if (!tiptapJson) return []
  let doc: TiptapNode
  try {
    doc = JSON.parse(tiptapJson)
  } catch {
    return []
  }
  if (!Array.isArray(doc.content)) return []
  const keys = new Set<string>()
  collectDistinctTagKeys(doc.content, keys)
  const result: EntityTagOccurrenceFull[] = []
  for (const key of keys) {
    const separatorIndex = key.indexOf(':')
    const entityType = key.slice(0, separatorIndex)
    const entityId = key.slice(separatorIndex + 1)
    for (const occ of findEntityTagOccurrences(tiptapJson, entityType, entityId)) {
      result.push({ ...occ, entityType, entityId })
    }
  }
  return result
}
