/**
 * Regole di interazione del canvas dei grafi (v0.5.0): selezione, collegamenti
 * ed eliminazione. Codice puro, senza React né DOM: il componente GraphCanvas
 * decide COSA mostrare e quando chiamare queste funzioni, qui sta la logica che
 * deve restare identica e verificabile (tests/renderer/graph-interaction.test.ts).
 *
 * Contiene anche la correzione di tre difetti della versione con React Flow:
 *  - eliminare un collegamento con Canc non lo toglieva dal database;
 *  - spostando più nodi selezionati si salvava la posizione di uno solo;
 *  - collegare due nodi già collegati creava un duplicato nel database, nascosto
 *    nella vista finché non si riapriva la mappa.
 */

import type { Point } from './graphGeometry'

export interface GraphSelection {
  nodes: string[]
  edges: string[]
}
export const EMPTY_SELECTION: GraphSelection = { nodes: [], edges: [] }

/** Riferimento minimo a un collegamento, quanto basta alle regole. */
export interface EdgeRef {
  id: string
  source: string
  target: string
}

/** Quanto bisogna muovere il mouse (in pixel) perché un click diventi un trascinamento. */
export const DRAG_THRESHOLD_PX = 3

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
}

const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

export interface NodePressResult {
  selection: GraphSelection
  /** true se, rilasciando SENZA aver trascinato, la selezione va ridotta al solo nodo cliccato. */
  collapseOnRelease: boolean
  /** false se la pressione ha deselezionato il nodo: non si deve avviare un trascinamento. */
  draggable: boolean
}

/**
 * Pressione del mouse su un nodo.
 *  - con Ctrl/Cmd/Maiusc (`additive`): aggiunge o toglie il nodo dalla selezione;
 *  - senza: se il nodo NON era selezionato diventa l'unico selezionato; se lo era
 *    la selezione resta com'è, così si può trascinare l'intero gruppo. Solo se poi
 *    si rilascia senza trascinare la selezione si riduce a quel nodo
 *    (`collapseOnRelease`), come in ogni editor grafico.
 */
export function pressNode(selection: GraphSelection, id: string, additive: boolean): NodePressResult {
  if (additive) {
    const nodes = toggle(selection.nodes, id)
    return { selection: { nodes, edges: selection.edges }, collapseOnRelease: false, draggable: nodes.includes(id) }
  }
  if (selection.nodes.includes(id)) {
    return {
      selection,
      collapseOnRelease: selection.nodes.length > 1 || selection.edges.length > 0,
      draggable: true
    }
  }
  return { selection: { nodes: [id], edges: [] }, collapseOnRelease: false, draggable: true }
}

/** Selezione ridotta a un solo nodo. */
export function selectOnly(id: string): GraphSelection {
  return { nodes: [id], edges: [] }
}

/** Pressione del mouse su un collegamento: lo seleziona (con `additive` lo aggiunge o toglie). */
export function pressEdge(selection: GraphSelection, id: string, additive: boolean): GraphSelection {
  if (additive) return { nodes: selection.nodes, edges: toggle(selection.edges, id) }
  return { nodes: [], edges: [id] }
}

/** Esito di un riquadro di selezione: sostituisce la selezione, o con `additive` la estende. */
export function selectBox(previous: GraphSelection, nodeIds: string[], additive: boolean): GraphSelection {
  if (!additive) return { nodes: nodeIds, edges: [] }
  return { nodes: [...previous.nodes, ...nodeIds.filter((id) => !previous.nodes.includes(id))], edges: previous.edges }
}

/**
 * Toglie dalla selezione ciò che non esiste più (nodo o collegamento eliminato,
 * mappa ricaricata). Se non cambia nulla ritorna lo STESSO oggetto, così React
 * non ridisegna inutilmente.
 */
export function pruneSelection(
  selection: GraphSelection,
  existingNodes: ReadonlySet<string>,
  existingEdges: ReadonlySet<string>
): GraphSelection {
  const nodes = selection.nodes.filter((id) => existingNodes.has(id))
  const edges = selection.edges.filter((id) => existingEdges.has(id))
  if (nodes.length === selection.nodes.length && edges.length === selection.edges.length) return selection
  return { nodes, edges }
}

export type HandleKind = 'source' | 'target'

/**
 * Da dove e dove è stato trascinato un collegamento → quale nodo è l'origine e
 * quale la destinazione. Dalla maniglia in BASSO (source) si va verso un altro
 * nodo, che diventa la destinazione; dalla maniglia in ALTO (target) il nodo di
 * partenza è la destinazione. Un nodo non si collega a se stesso (null).
 */
export function resolveConnection(
  from: { nodeId: string; handle: HandleKind },
  dropNodeId: string
): { source: string; target: string } | null {
  if (from.nodeId === dropNodeId) return null
  return from.handle === 'source'
    ? { source: from.nodeId, target: dropNodeId }
    : { source: dropNodeId, target: from.nodeId }
}

/**
 * Il collegamento si può creare? No se unisce un nodo a se stesso o se esiste già
 * lo stesso collegamento nella stessa direzione. Il verso opposto (B→A quando c'è
 * A→B) è ammesso: sono due relazioni diverse.
 */
export function canConnect(edges: readonly EdgeRef[], connection: { source: string; target: string }): boolean {
  if (connection.source === connection.target) return false
  return !edges.some((edge) => edge.source === connection.source && edge.target === connection.target)
}

export interface DeletionPlan {
  /** Nodi da eliminare dal database. */
  nodeIds: string[]
  /** Collegamenti selezionati da eliminare in modo esplicito (non attaccati a un nodo che sparisce). */
  edgeIds: string[]
  /**
   * Collegamenti che spariscono PERCHÉ un loro nodo viene eliminato: il database
   * li elimina da solo (ON DELETE CASCADE), qui servono per aggiornare la vista.
   */
  cascadedEdgeIds: string[]
}

/**
 * Cosa eliminare alla pressione di Canc. Separa i collegamenti selezionati
 * (da eliminare esplicitamente: è la correzione del difetto per cui restavano nel
 * database) da quelli che cadono insieme ai loro nodi (nessuna chiamata in più, e
 * soprattutto nessuna eliminazione doppia di una riga già sparita).
 */
export function planDeletion(selection: GraphSelection, edges: readonly EdgeRef[]): DeletionPlan {
  const deletedNodes = new Set(selection.nodes)
  const cascadedEdgeIds = edges.filter((e) => deletedNodes.has(e.source) || deletedNodes.has(e.target)).map((e) => e.id)
  const cascaded = new Set(cascadedEdgeIds)
  const existing = new Set(edges.map((e) => e.id))
  return {
    nodeIds: [...selection.nodes],
    edgeIds: selection.edges.filter((id) => existing.has(id) && !cascaded.has(id)),
    cascadedEdgeIds
  }
}

export interface NodeMove {
  id: string
  x: number
  y: number
}

/**
 * Nuove posizioni di TUTTI i nodi trascinati (non solo di quello afferrato:
 * è la correzione del difetto per cui, spostando una selezione multipla, si
 * salvava la posizione di un nodo solo). `delta` è in coordinate del mondo.
 */
export function movesFor(ids: readonly string[], positions: Readonly<Record<string, Point>>, delta: Point): NodeMove[] {
  const moves: NodeMove[] = []
  for (const id of ids) {
    const base = positions[id]
    if (base) moves.push({ id, x: base.x + delta.x, y: base.y + delta.y })
  }
  return moves
}
