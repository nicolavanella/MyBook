/**
 * MyBook — operazioni della Mappa concettuale con una logica da proteggere (v0.4.1).
 *
 * Le altre operazioni della mappa vivono ancora direttamente in
 * `ipc/mindmap.ipc.ts`. Quelle qui sono state estratte perché hanno regole
 * che meritano di essere verificate con dei test (ordine dei nodi nel
 * gruppo, appartenenza alla stessa mappa) e il file IPC dipende da Electron,
 * quindi non è testabile senza avviarlo.
 */
import type Database from 'better-sqlite3'

export interface ReorderNodesInput {
  mindmapId: string
  /** Gruppo di destinazione (nodo di tipo 'group'); null = colonna "Senza gruppo". */
  groupId: string | null
  /** Id dei nodi nel loro nuovo ordine, dal primo all'ultimo. */
  orderedIds: string[]
}

export class MindmapService {
  constructor(private readonly db: Database.Database) {}

  /**
   * Posizione "in fondo" per un nuovo nodo o per un nodo che entra in un
   * gruppo: massimo attuale + 1 (0 se il gruppo è vuoto). Così una card
   * appena creata o spostata con la finestra di modifica va in coda, invece
   * di comparire in cima con order_index 0.
   */
  nextOrderIndex(mindmapId: string, groupId: string | null): number {
    const row = this.db
      .prepare('SELECT MAX(order_index) AS m FROM mindmap_nodes WHERE mindmap_id = ? AND group_id IS ? AND node_type != \'group\'')
      .get(mindmapId, groupId) as { m: number | null }
    return row.m === null || row.m === undefined ? 0 : row.m + 1
  }

  /**
   * Riordina (ed eventualmente sposta) un insieme di nodi nel gruppo di
   * destinazione, in un'unica transazione: o si applica tutto o niente.
   * Scrive group_id e order_index 0,1,2… nell'ordine ricevuto.
   *
   * Validazioni (un renderer difettoso non deve poter corrompere la mappa):
   * ogni nodo deve appartenere alla mappa, non può essere un gruppo, gli id
   * non possono ripetersi, e il gruppo di destinazione deve essere un
   * gruppo della stessa mappa.
   */
  reorderNodes({ mindmapId, groupId, orderedIds }: ReorderNodesInput): void {
    if (new Set(orderedIds).size !== orderedIds.length) throw new Error('Duplicate node ids in reorder request')

    if (groupId !== null) {
      const group = this.db
        .prepare("SELECT 1 AS ok FROM mindmap_nodes WHERE id = ? AND mindmap_id = ? AND node_type = 'group'")
        .get(groupId, mindmapId)
      if (!group) throw new Error('Target group does not belong to the mind map')
    }

    const apply = this.db.transaction(() => {
      const check = this.db.prepare("SELECT 1 AS ok FROM mindmap_nodes WHERE id = ? AND mindmap_id = ? AND node_type != 'group'")
      const update = this.db.prepare(
        "UPDATE mindmap_nodes SET group_id = ?, order_index = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      )
      orderedIds.forEach((id, index) => {
        if (!check.get(id, mindmapId)) throw new Error(`Node ${id} cannot be reordered in this mind map`)
        update.run(groupId, index, id)
      })
    })
    apply()
  }

  /**
   * Imposta l'etichetta di un collegamento (stringa vuota = nessuna etichetta).
   * Restituisce i dati per il registro attività, o null se l'arco non esiste.
   */
  updateEdgeLabel(
    id: string,
    label: string
  ): { projectId: string; sourceLabel: string; targetLabel: string; changed: boolean } | null {
    const before = this.db
      .prepare(
        `SELECT e.project_id AS projectId, e.label AS label, sn.label AS sourceLabel, tn.label AS targetLabel
         FROM mindmap_edges e
         LEFT JOIN mindmap_nodes sn ON sn.id = e.source_node_id
         LEFT JOIN mindmap_nodes tn ON tn.id = e.target_node_id
         WHERE e.id = ?`
      )
      .get(id) as { projectId: string; label: string; sourceLabel: string | null; targetLabel: string | null } | undefined
    if (!before) return null
    const next = label.trim()
    this.db
      .prepare("UPDATE mindmap_edges SET label = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(next, id)
    return {
      projectId: before.projectId,
      sourceLabel: before.sourceLabel ?? '?',
      targetLabel: before.targetLabel ?? '?',
      changed: before.label !== next
    }
  }
}
