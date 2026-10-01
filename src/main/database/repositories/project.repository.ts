import type Database from 'better-sqlite3'

/**
 * Prepared statement creati una sola volta per istanza (nel costruttore)
 * invece che ad ogni chiamata: better-sqlite3 ricompila l'SQL a ogni
 * `.prepare()`, quindi ricrearli ad ogni invocazione dei metodi costa
 * inutilmente su percorsi frequenti come il caricamento della lista progetti.
 */
export class ProjectRepository {
  private readonly stmtList: Database.Statement
  private readonly stmtFindById: Database.Statement
  private readonly stmtInsertProject: Database.Statement
  private readonly stmtInsertSettings: Database.Statement
  private readonly stmtDelete: Database.Statement
  private readonly updateStmtCache = new Map<string, Database.Statement>()

  constructor(private db: Database.Database) {
    this.stmtList = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC')
    this.stmtFindById = db.prepare('SELECT * FROM projects WHERE id = ?')
    this.stmtInsertProject = db.prepare(
      `INSERT INTO projects (id, title, subtitle, author, year, description, notes, plot, fabula)
       VALUES (@id, @title, @subtitle, @author, @year, @description, @notes, @plot, @fabula)`
    )
    this.stmtInsertSettings = db.prepare(
      'INSERT INTO project_settings (project_id, settings) VALUES (?, ?)'
    )
    this.stmtDelete = db.prepare('DELETE FROM projects WHERE id = ?')
  }

  list() {
    return this.stmtList.all()
  }

  /**
   * Lista progetti con statistiche aggregate per le card della schermata di
   * selezione: parole totali (sum su tutte le scene/sezioni), numero
   * capitoli. Query separata da list() per non appesantire ogni chiamata
   * "semplice" (es. per popolare select in altre pagine) con i join.
   */
  listWithStats() {
    return this.db
      .prepare(
        `SELECT
           p.*,
           COALESCE(SUM(CASE WHEN d.node_type IN ('scene','section') THEN d.word_count ELSE 0 END), 0) as totalWords,
           COUNT(DISTINCT CASE WHEN d.node_type = 'chapter' THEN d.id END) as chapterCount
         FROM projects p
         LEFT JOIN document_nodes d ON d.project_id = p.id
         GROUP BY p.id
         ORDER BY p.updated_at DESC`
      )
      .all()
  }

  /** Aggiorna last_opened_at a "adesso": chiamato quando un progetto viene aperto. */
  touch(id: string) {
    this.db.prepare("UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?").run(id)
  }

  findById(id: string) {
    return this.stmtFindById.get(id)
  }

  insert(project: {
    id: string
    title: string
    subtitle: string
    author: string | null
    year: number | null
    description: string
    notes: string
    plot: string
    fabula: string
  }) {
    this.stmtInsertProject.run(project)
    // Ogni progetto nasce con impostazioni di default vuote (JSON), sovrascrivibili
    // dalla UI (autosave, soglie di versioning, ecc. — vedi config/database.yml)
    this.stmtInsertSettings.run(project.id, '{}')
  }

  /** Statement per `update` cachato per firma di colonne, come document.repository.ts. */
  update(id: string, patch: Record<string, unknown>) {
    const keys = Object.keys(patch)
    if (keys.length === 0) return
    const cacheKey = keys.join(',')
    let stmt = this.updateStmtCache.get(cacheKey)
    if (!stmt) {
      const setClause = keys.map((k) => `${k} = @${k}`).join(', ')
      stmt = this.db.prepare(
        `UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = @id`
      )
      this.updateStmtCache.set(cacheKey, stmt)
    }
    stmt.run({ ...patch, id })
  }

  delete(id: string) {
    this.stmtDelete.run(id)
  }

  /**
   * Stato di interfaccia del progetto (v0.3.9): dove riaprirlo — sezione
   * (lastRoute) e, se si stava scrivendo, quale scena (lastSceneId). Vive
   * nello stesso blob JSON "settings" già previsto per impostazioni future
   * specifiche del progetto (vedi insert()); un merge per chiave, non una
   * sostituzione integrale, così non serve conoscere l'intero stato per
   * aggiornarne solo una parte.
   */
  getUiState(projectId: string): Record<string, unknown> {
    const row = this.db.prepare('SELECT settings FROM project_settings WHERE project_id = ?').get(projectId) as
      | { settings: string }
      | undefined
    if (!row?.settings) return {}
    try {
      return JSON.parse(row.settings)
    } catch {
      return {}
    }
  }

  setUiState(projectId: string, patch: Record<string, unknown>): void {
    const next = { ...this.getUiState(projectId), ...patch }
    this.db
      .prepare(
        `INSERT INTO project_settings (project_id, settings) VALUES (?, ?)
         ON CONFLICT(project_id) DO UPDATE SET settings = excluded.settings`
      )
      .run(projectId, JSON.stringify(next))
  }
}
