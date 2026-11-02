/**
 * MyBook — calcolo del riordino delle card nel kanban della Mappa concettuale (v0.4.1).
 *
 * Funzione PURA (nessun DOM, nessun dnd-kit): dato lo stato delle colonne,
 * la card trascinata e il bersaglio del rilascio, dice qual è il nuovo
 * ordine della colonna di destinazione. Tenerla separata dal componente
 * permette di verificare con dei test tutti i casi limite (stessa colonna
 * in giù/in su, colonna vuota, rilascio sullo spazio vuoto, nessun cambio)
 * senza simulare un trascinamento.
 */

/** Identificatore della colonna fissa "Senza gruppo" (le altre colonne usano l'id del nodo-gruppo). */
export const UNGROUPED_COLUMN = '__ungrouped__'

export type KanbanDropTarget =
  /** Rilasciata SU un'altra card: va prima o dopo di essa. */
  | { kind: 'card'; overId: string; after: boolean }
  /** Rilasciata sulla colonna ma non su una card (spazio vuoto, intestazione, colonna vuota): va in fondo. */
  | { kind: 'column'; columnId: string }

export interface KanbanMove {
  /** Colonna di destinazione (id del gruppo o UNGROUPED_COLUMN). */
  columnId: string
  /** group_id da salvare (null per "Senza gruppo"). */
  groupId: string | null
  /** Id delle card della colonna di destinazione nel nuovo ordine. */
  orderedIds: string[]
}

/**
 * @param columns colonna → id delle card nell'ordine attuale (incluse le colonne vuote)
 * @returns il nuovo ordine della colonna di destinazione, oppure null se non cambia nulla
 */
export function computeKanbanMove(
  columns: Readonly<Record<string, readonly string[]>>,
  activeId: string,
  target: KanbanDropTarget
): KanbanMove | null {
  const sourceColumn = Object.keys(columns).find((key) => columns[key].includes(activeId))
  if (sourceColumn === undefined) return null

  let destColumn: string
  if (target.kind === 'card') {
    if (target.overId === activeId) return null // rilasciata su se stessa
    const found = Object.keys(columns).find((key) => columns[key].includes(target.overId))
    if (found === undefined) return null
    destColumn = found
  } else {
    if (!(target.columnId in columns)) return null
    destColumn = target.columnId
  }

  // Si toglie la card dalla colonna di destinazione (che può essere la stessa di partenza) e la si reinserisce.
  const others = columns[destColumn].filter((id) => id !== activeId)
  const index = target.kind === 'card' ? others.indexOf(target.overId) + (target.after ? 1 : 0) : others.length
  const orderedIds = [...others.slice(0, index), activeId, ...others.slice(index)]

  const unchanged =
    destColumn === sourceColumn &&
    orderedIds.length === columns[sourceColumn].length &&
    orderedIds.every((id, i) => id === columns[sourceColumn][i])
  if (unchanged) return null

  return { columnId: destColumn, groupId: destColumn === UNGROUPED_COLUMN ? null : destColumn, orderedIds }
}

/**
 * Il centro verticale della card trascinata è sotto il centro della card
 * bersaglio? Decide se inserire DOPO (true) o PRIMA (false) di essa.
 */
export function isBelowCenter(active: { top: number; height: number }, over: { top: number; height: number }): boolean {
  return active.top + active.height / 2 > over.top + over.height / 2
}
