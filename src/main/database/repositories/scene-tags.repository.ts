import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export interface SceneTagInput {
  entityType: string
  entityId: string
  occurrenceIndex: number
  snippet: string
}

export interface SceneTagUsageRow {
  sceneId: string
  sceneTitle: string
  chapterId: string
  chapterTitle: string
  occurrenceIndex: number
  snippet: string
}

export interface ChapterTagCountRow {
  chapterId: string
  entityType: string
  entityId: string
  count: number
}

/**
 * Indice persistente dei tag (Personaggi/Località/Oggetti) presenti nel
 * testo delle scene — v0.3.8, vedi migrazione 019_scene_tags.sql. Questa
 * tabella è un RIFLESSO dell'ultimo contenuto salvato di ogni scena: la
 * scrive solo DocumentService (ad ogni salvataggio di una scena, tramite
 * replaceForScene), tutto il resto la legge soltanto.
 */
export class SceneTagsRepository {
  private readonly stmtDeleteForScene: Database.Statement
  private readonly stmtInsert: Database.Statement
  private readonly stmtUsagesForEntity: Database.Statement
  private readonly stmtCountsByChapter: Database.Statement

  constructor(private db: Database.Database) {
    this.stmtDeleteForScene = db.prepare('DELETE FROM scene_tags WHERE document_node_id = ?')
    this.stmtInsert = db.prepare(
      `INSERT INTO scene_tags (id, project_id, document_node_id, entity_type, entity_id, occurrence_index, snippet)
       VALUES (@id, @project_id, @document_node_id, @entity_type, @entity_id, @occurrence_index, @snippet)`
    )
    // Un personaggio/località/oggetto tenuto nella scheda: dove compare, nell'ordine del Manoscritto.
    this.stmtUsagesForEntity = db.prepare(
      `SELECT s.id as sceneId, s.title as sceneTitle, c.id as chapterId, c.title as chapterTitle,
              t.occurrence_index as occurrenceIndex, t.snippet as snippet
       FROM scene_tags t
       JOIN document_nodes s ON s.id = t.document_node_id
       JOIN document_nodes c ON c.id = s.parent_id
       WHERE t.project_id = ? AND t.entity_type = ? AND t.entity_id = ?
       ORDER BY c.order_index ASC, s.order_index ASC, t.occurrence_index ASC`
    )
    // Occorrenze per (capitolo, entità) — usata dall'Analisi per l'elenco "Tag presenti" di ogni capitolo.
    this.stmtCountsByChapter = db.prepare(
      `SELECT s.parent_id as chapterId, t.entity_type as entityType, t.entity_id as entityId, COUNT(*) as count
       FROM scene_tags t
       JOIN document_nodes s ON s.id = t.document_node_id
       WHERE t.project_id = ?
       GROUP BY s.parent_id, t.entity_type, t.entity_id`
    )
  }

  /**
   * Sostituisce TUTTI i tag registrati per una scena con `tags` (ricava
   * dall'ultimo contenuto salvato via findAllEntityTagOccurrences). Fatto
   * come DELETE + INSERT in un'unica transazione: più semplice e meno
   * soggetto a errori di un UPDATE differenziale, e il volume di righe per
   * scena è tipicamente piccolo (poche decine di tag al più).
   */
  replaceForScene(documentNodeId: string, projectId: string, tags: SceneTagInput[]): void {
    const tx = this.db.transaction(() => {
      this.stmtDeleteForScene.run(documentNodeId)
      for (const tag of tags) {
        this.stmtInsert.run({
          id: uuid(),
          project_id: projectId,
          document_node_id: documentNodeId,
          entity_type: tag.entityType,
          entity_id: tag.entityId,
          occurrence_index: tag.occurrenceIndex,
          snippet: tag.snippet
        })
      }
    })
    tx()
  }

  usagesForEntity(projectId: string, entityType: string, entityId: string): SceneTagUsageRow[] {
    return this.stmtUsagesForEntity.all(projectId, entityType, entityId) as SceneTagUsageRow[]
  }

  countsByChapter(projectId: string): ChapterTagCountRow[] {
    return this.stmtCountsByChapter.all(projectId) as ChapterTagCountRow[]
  }
}
