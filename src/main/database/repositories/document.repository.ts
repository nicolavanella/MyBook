import type Database from 'better-sqlite3'
import type { DocumentNode } from '@shared/schemas/document.schema'

/**
 * Prepared statement con SQL fissa: creati una sola volta nel costruttore.
 * `update()` ha invece SQL dinamica (dipende dalle chiavi del patch), quindi
 * usa una cache per "firma" di colonne coinvolte anziché un singolo statement
 * — è comunque una netta riduzione rispetto a ricompilare a ogni chiamata,
 * dato che in pratica i patch tipici (autosave: {content}, title: {title})
 * si ripetono sempre con le stesse chiavi.
 */
const DOCUMENT_UPDATE_COLUMNS = new Set(['title','subtitle','description','notes','status','order_index','parent_id','content','word_count','char_count','locked'])

export class DocumentRepository {
  private readonly stmtTree: Database.Statement
  private readonly stmtFindById: Database.Statement
  private readonly stmtMaxOrderIndex: Database.Statement
  private readonly stmtInsert: Database.Statement
  private readonly stmtDelete: Database.Statement
  private readonly stmtInsertRevision: Database.Statement
  private readonly stmtListRevisions: Database.Statement
  private readonly stmtFindRevision: Database.Statement
  private readonly stmtCountRevisions: Database.Statement
  private readonly stmtInsertSnapshot: Database.Statement
  private readonly stmtProjectStatistics: Database.Statement
  private readonly updateStmtCache = new Map<string, Database.Statement>()

  constructor(private db: Database.Database) {
    this.stmtTree = db.prepare(
      'SELECT * FROM document_nodes WHERE project_id = ? ORDER BY order_index ASC'
    )
    this.stmtFindById = db.prepare('SELECT * FROM document_nodes WHERE id = ?')
    this.stmtMaxOrderIndex = db.prepare(
      `SELECT MAX(order_index) as m FROM document_nodes
       WHERE project_id = ? AND parent_id IS ?`
    )
    this.stmtInsert = db.prepare(
      `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, subtitle, description, notes, order_index)
       VALUES (@id, @projectId, @parentId, @nodeType, @title, @subtitle, @description, @notes, @orderIndex)`
    )
    this.stmtDelete = db.prepare('DELETE FROM document_nodes WHERE id = ?')
    this.stmtInsertRevision = db.prepare(
      `INSERT INTO document_revisions (id, document_node_id, content, reason, word_count, char_count)
       VALUES (@id, @documentNodeId, @content, @reason, @wordCount, @charCount)`
    )
    this.stmtListRevisions = db.prepare(
      `SELECT id, reason, word_count, char_count, created_at
       FROM document_revisions WHERE document_node_id = ? ORDER BY created_at DESC`
    )
    this.stmtFindRevision = db.prepare('SELECT * FROM document_revisions WHERE id = ?')
    this.stmtCountRevisions = db.prepare(
      'SELECT COUNT(*) as c FROM document_revisions WHERE document_node_id = ?'
    )
    this.stmtInsertSnapshot = db.prepare(
      `INSERT INTO document_snapshots (id, document_node_id, revision_id, content)
       VALUES (@id, @documentNodeId, @revisionId, @content)`
    )
    this.stmtProjectStatistics = db.prepare(
      `SELECT
         COALESCE(SUM(word_count), 0) as totalWords,
         COALESCE(SUM(char_count), 0) as totalChars,
         COUNT(*) as totalNodes,
         SUM(CASE WHEN status = 'completo' THEN 1 ELSE 0 END) as completedNodes
       FROM document_nodes
       WHERE project_id = ? AND node_type IN ('scene', 'section')`
    )
  }

  tree(projectId: string): DocumentNode[] {
    return this.stmtTree.all(projectId) as DocumentNode[]
  }

  findById(id: string): DocumentNode | undefined {
    return this.stmtFindById.get(id) as DocumentNode | undefined
  }

  maxOrderIndex(projectId: string, parentId: string | null): number {
    const row = this.stmtMaxOrderIndex.get(projectId, parentId) as any
    return row?.m ?? -1
  }

  insert(node: {
    id: string
    projectId: string
    parentId: string | null
    nodeType: string
    title: string
    subtitle: string
    description: string
    notes: string
    orderIndex: number
  }): void {
    this.stmtInsert.run(node)
  }

  /** Statement per `update` cachato per firma di colonne (chiavi del patch, in ordine). */
  private getUpdateStmt(keys: string[]): Database.Statement {
    const cacheKey = keys.join(',')
    let stmt = this.updateStmtCache.get(cacheKey)
    if (!stmt) {
      const setClause = keys.map((k) => `${k} = @${k}`).join(', ')
      stmt = this.db.prepare(
        `UPDATE document_nodes SET ${setClause}, updated_at = datetime('now') WHERE id = @id`
      )
      this.updateStmtCache.set(cacheKey, stmt)
    }
    return stmt
  }

  update(id: string, patch: Record<string, unknown>): void {
    const keys = Object.keys(patch).sort()
    if (keys.length === 0) return
    const invalid = keys.filter((key) => !DOCUMENT_UPDATE_COLUMNS.has(key))
    if (invalid.length) throw new Error(`Campi documento non consentiti: ${invalid.join(', ')}`)
    this.getUpdateStmt(keys).run({ ...patch, id })
  }

  delete(id: string): void {
    this.stmtDelete.run(id)
  }

  /** Tutti i figli diretti di un nodo, ordinati — usato per la duplicazione ricorsiva (capitolo -> sue scene). */
  children(parentId: string): DocumentNode[] {
    return this.db
      .prepare('SELECT * FROM document_nodes WHERE parent_id = ? ORDER BY order_index ASC')
      .all(parentId) as DocumentNode[]
  }

  /**
   * Riordino via drag&drop: riscrive order_index per l'elenco di id ricevuto
   * (fratelli con lo stesso parent_id — capitoli tra loro, o scene dello
   * stesso capitolo tra loro). Se newParentId è indicato, sposta anche il
   * nodo trascinato in un capitolo diverso prima di riordinare.
   */
  reorder(orderedIds: string[], movedNodeId?: string, newParentId?: string | null): void {
    const stmt = this.db.prepare('UPDATE document_nodes SET order_index = ? WHERE id = ?')
    const run = this.db.transaction(() => {
      if (movedNodeId !== undefined && newParentId !== undefined) {
        this.db.prepare('UPDATE document_nodes SET parent_id = ? WHERE id = ?').run(newParentId, movedNodeId)
      }
      orderedIds.forEach((id, index) => stmt.run(index, id))
    })
    run()
  }

  insertRevision(rev: {
    id: string
    documentNodeId: string
    content: string
    reason: string
    wordCount: number
    charCount: number
  }): void {
    this.stmtInsertRevision.run(rev)
  }

  listRevisions(documentNodeId: string): any[] {
    return this.stmtListRevisions.all(documentNodeId)
  }

  findRevision(id: string): any {
    return this.stmtFindRevision.get(id)
  }

  countRevisionsSince(documentNodeId: string): number {
    const row = this.stmtCountRevisions.get(documentNodeId) as any
    return row.c
  }

  insertSnapshot(snap: { id: string; documentNodeId: string; revisionId: string; content: string }): void {
    this.stmtInsertSnapshot.run(snap)
  }

  projectStatistics(projectId: string): {
    totalWords: number
    totalChars: number
    totalNodes: number
    completedNodes: number
  } {
    return this.stmtProjectStatistics.get(projectId) as any
  }

  /**
   * Spaccato per capitolo: numero scene, parole totali, e conteggio scene
   * per stato (idea/bozza/revisione/completo) — usato dalla pagina Statistiche.
   */
  chapterBreakdown(projectId: string): Array<{
    chapterId: string
    chapterTitle: string
    sceneCount: number
    wordCount: number
    idea: number
    bozza: number
    revisione: number
    completo: number
  }> {
    const rows = this.db
      .prepare(
        `SELECT
           c.id as chapterId,
           c.title as chapterTitle,
           COUNT(s.id) as sceneCount,
           COALESCE(SUM(s.word_count), 0) as wordCount,
           SUM(CASE WHEN s.status = 'idea' THEN 1 ELSE 0 END) as idea,
           SUM(CASE WHEN s.status = 'bozza' THEN 1 ELSE 0 END) as bozza,
           SUM(CASE WHEN s.status = 'revisione' THEN 1 ELSE 0 END) as revisione,
           SUM(CASE WHEN s.status = 'completo' THEN 1 ELSE 0 END) as completo
         FROM document_nodes c
         LEFT JOIN document_nodes s ON s.parent_id = c.id AND s.node_type IN ('scene', 'section')
         WHERE c.project_id = ? AND c.node_type = 'chapter'
         GROUP BY c.id
         ORDER BY c.order_index ASC`
      )
      .all(projectId)
    return rows as any
  }

  /**
   * Contenuto (JSON TipTap) di tutte le scene del progetto, raggruppato per
   * capitolo e nell'ordine del Manoscritto — usato dalla scheda Statistiche >
   * Analisi (v0.3.5) per calcolare parole/caratteri/frasi/paragrafi/parole
   * chiave sia sull'intero progetto sia per singolo capitolo, cosa che le
   * colonne cache word_count/char_count (pensate per conteggi semplici) non
   * permettono da sole: serve il testo vero.
   */
  chapterContents(projectId: string): Array<{ chapterId: string; chapterTitle: string; sceneContents: string[] }> {
    const rows = this.db
      .prepare(
        `SELECT c.id as chapterId, c.title as chapterTitle, s.content as content
         FROM document_nodes c
         LEFT JOIN document_nodes s ON s.parent_id = c.id AND s.node_type IN ('scene', 'section')
         WHERE c.project_id = ? AND c.node_type = 'chapter'
         ORDER BY c.order_index ASC, s.order_index ASC`
      )
      .all(projectId) as Array<{ chapterId: string; chapterTitle: string; content: string | null }>

    const byChapter = new Map<string, { chapterId: string; chapterTitle: string; sceneContents: string[] }>()
    for (const row of rows) {
      let entry = byChapter.get(row.chapterId)
      if (!entry) {
        entry = { chapterId: row.chapterId, chapterTitle: row.chapterTitle, sceneContents: [] }
        byChapter.set(row.chapterId, entry)
      }
      if (row.content) entry.sceneContents.push(row.content)
    }
    return [...byChapter.values()]
  }

  /**
   * Contenuto grezzo di tutte le scene del progetto, in un unico elenco
   * (senza raggruppamento) — v0.3.6, usato per calcolare i caratteri totali
   * "senza spazi" nella scheda Statistiche > Principale. I caratteri "con
   * spazi" restano quelli già in cache (SUM(char_count) in projectStatistics):
   * qui serve solo l'altro numero, che non ha una colonna cache dedicata.
   */
  allSceneContents(projectId: string): string[] {
    return (
      this.db
        .prepare(`SELECT content FROM document_nodes WHERE project_id = ? AND node_type IN ('scene', 'section')`)
        .all(projectId) as Array<{ content: string | null }>
    ).map((r) => r.content ?? '')
  }
}
