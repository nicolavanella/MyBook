/** Sentinella per il contenitore di primo livello (capitoli senza gruppo + gruppi): non è un id reale di alcun nodo. */
export const ROOT_CONTAINER = 'root'

export type DragMoveResult =
  | { type: 'reorder'; orderedIds: string[] }
  | { type: 'move'; orderedIds: string[]; movedNodeId: string; newParentId: string | null }
  | null

/**
 * Decide l'esito di un drag&drop nell'albero del manoscritto: un semplice
 * riordino se il nodo resta nello stesso contenitore (radice o stesso
 * gruppo), oppure uno spostamento tra contenitori (il nodo cambia
 * gruppo/esce o entra nella radice) se containerId cambia. Pura e priva di
 * dipendenze da React/dnd-kit: testabile in isolamento (vedi
 * tests/renderer/tree-dnd.test.ts) e usata da ChapterTree.tsx dentro
 * l'handler reale di onDragEnd.
 *
 * @param isGroup true se il nodo trascinato è un gruppo (i gruppi vivono solo alla radice, non possono entrare in un altro gruppo)
 * @param siblingsOf risolve gli id (in ordine) dei fratelli di un dato containerId
 */
export function resolveDragMove(params: {
  activeId: string
  overId: string
  activeContainer: string
  overContainer: string
  isGroup: boolean
  siblingsOf: (containerId: string) => string[]
}): DragMoveResult {
  const { activeId, overId, activeContainer, overContainer, isGroup, siblingsOf } = params
  if (activeId === overId) return null
  if (isGroup && overContainer !== ROOT_CONTAINER) return null // i gruppi non possono entrare in un altro gruppo

  if (activeContainer === overContainer) {
    const siblings = siblingsOf(activeContainer)
    const oldIndex = siblings.indexOf(activeId)
    const newIndex = siblings.indexOf(overId)
    if (oldIndex === -1 || newIndex === -1) return null
    const reordered = [...siblings]
    reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, activeId)
    return { type: 'reorder', orderedIds: reordered }
  }

  const newParentId = overContainer === ROOT_CONTAINER ? null : overContainer
  const targetSiblings = siblingsOf(overContainer)
  const overIndex = targetSiblings.indexOf(overId)
  const insertAt = overIndex === -1 ? targetSiblings.length : overIndex
  const orderedIds = [...targetSiblings]
  orderedIds.splice(insertAt, 0, activeId)
  return { type: 'move', orderedIds, movedNodeId: activeId, newParentId }
}
