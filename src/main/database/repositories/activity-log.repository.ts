import type Database from 'better-sqlite3'
import type { ActivityLogEntry } from '@shared/ipc/channels'

/** Righe conservate per progetto: oltre questa soglia le più vecchie vengono eliminate ad ogni inserimento, per evitare una crescita illimitata su progetti di lunga durata. */
const MAX_ENTRIES_PER_PROJECT = 1000

export type NewActivityLogEntry = Omit<ActivityLogEntry, 'created_at'>

export class ActivityLogRepository {
  private readonly stmtInsert: Database.Statement
  private readonly stmtPrune: Database.Statement
  private readonly stmtRecentForProject: Database.Statement
  private readonly stmtRecentProjectIds: Database.Statement
  private readonly stmtGetTodo: Database.Statement
  private readonly stmtSetTodo: Database.Statement
  private readonly stmtMostRecentTimestamp: Database.Statement

  constructor(private db: Database.Database) {
    this.stmtInsert = db.prepare(
      `INSERT INTO activity_log (id, project_id, entity_type, action, entity_name, entity_id, details)
       VALUES (@id, @project_id, @entity_type, @action, @entity_name, @entity_id, @details)`
    )
    // Elimina le righe più vecchie della Nesima per questo progetto (vedi MAX_ENTRIES_PER_PROJECT).
    this.stmtPrune = db.prepare(
      `DELETE FROM activity_log
       WHERE project_id = ?
         AND id NOT IN (SELECT id FROM activity_log WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`
    )
    this.stmtRecentForProject = db.prepare(
      `SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`
    )
    // Progetti con almeno una voce di log, dal più recente: usata per il
    // recap all'avvio. A parità di timestamp (inserimenti nello stesso
    // millisecondo, frequente nei test e possibile anche in uso normale)
    // il pareggio è risolto con il rowid più alto, cioè l'inserimento più
    // recente in assoluto.
    this.stmtRecentProjectIds = db.prepare(
      `SELECT project_id, MAX(created_at) as lastAt, MAX(rowid) as lastRowid FROM activity_log
       GROUP BY project_id ORDER BY lastAt DESC, lastRowid DESC LIMIT ?`
    )
    this.stmtGetTodo = db.prepare(`SELECT text FROM project_todo WHERE project_id = ?`)
    this.stmtSetTodo = db.prepare(
      `INSERT INTO project_todo (project_id, text, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(project_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`
    )
    // v0.3.7: ultima voce per (entity_id, action) — usata per il throttle delle "Modificata" da autosave del testo.
    this.stmtMostRecentTimestamp = db.prepare(
      `SELECT created_at FROM activity_log WHERE entity_id = ? AND action = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
    )
  }

  insert(entry: NewActivityLogEntry): void {
    this.stmtInsert.run(entry)
    this.stmtPrune.run(entry.project_id, entry.project_id, MAX_ENTRIES_PER_PROJECT)
  }

  recentForProject(projectId: string, limit: number): ActivityLogEntry[] {
    return this.stmtRecentForProject.all(projectId, limit) as ActivityLogEntry[]
  }

  /** Id dei progetti con attività registrata, dal più recente, fino a `limit`. */
  recentProjectIds(limit: number): string[] {
    return (this.stmtRecentProjectIds.all(limit) as Array<{ project_id: string }>).map((r) => r.project_id)
  }

  getTodo(projectId: string): string {
    const row = this.stmtGetTodo.get(projectId) as { text: string } | undefined
    return row?.text ?? ''
  }

  /** Una stringa vuota è un ToDo "vuoto" a tutti gli effetti (vedi service): salvarla comunque tiene aggiornato updated_at senza bisogno di un ramo separato per la cancellazione. */
  setTodo(projectId: string, text: string): void {
    this.stmtSetTodo.run(projectId, text)
  }

  /** Istante (ISO) dell'ultima voce per questo (entity_id, action), o null se non ce ne sono — usato per il throttle. entity_id vuoto (voci storiche pre-v0.3.7) non produce mai un match, quindi non applica mai il throttle a quelle righe. */
  mostRecentTimestamp(entityId: string, action: string): string | null {
    if (!entityId) return null
    const row = this.stmtMostRecentTimestamp.get(entityId, action) as { created_at: string } | undefined
    return row?.created_at ?? null
  }
}
