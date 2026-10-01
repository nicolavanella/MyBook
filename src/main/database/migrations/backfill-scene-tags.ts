import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { findAllEntityTagOccurrences } from '@shared/entityTagScan'

/**
 * Ripopola `scene_tags` dal contenuto già salvato di ogni scena esistente
 * (v0.3.8). Va eseguita UNA volta, subito dopo che la migrazione
 * 019_scene_tags.sql crea la tabella per la prima volta: senza, i progetti
 * creati prima della v0.3.8 avrebbero tag già scritti nel testo ma nessuna
 * riga corrispondente in scene_tags, e sparirebbero da Analisi e da "Dove
 * compare" finché non si tocca di nuovo il contenuto di ogni scena.
 *
 * Le migrazioni di questo progetto sono file .sql puri (senza logica JS):
 * questo passo va quindi richiamato esplicitamente da db.ts, solo quando
 * runMigrations segnala che la versione 19 è stata applicata proprio in
 * questa esecuzione (mai più alle esecuzioni successive).
 */
export function backfillSceneTags(db: Database.Database): void {
  const scenes = db
    .prepare(
      `SELECT id, project_id, content FROM document_nodes
       WHERE node_type IN ('scene', 'section') AND content IS NOT NULL AND content != ''`
    )
    .all() as Array<{ id: string; project_id: string; content: string }>

  const insert = db.prepare(
    `INSERT INTO scene_tags (id, project_id, document_node_id, entity_type, entity_id, occurrence_index, snippet)
     VALUES (@id, @project_id, @document_node_id, @entity_type, @entity_id, @occurrence_index, @snippet)`
  )

  const run = db.transaction(() => {
    for (const scene of scenes) {
      for (const occ of findAllEntityTagOccurrences(scene.content)) {
        insert.run({
          id: uuid(),
          project_id: scene.project_id,
          document_node_id: scene.id,
          entity_type: occ.entityType,
          entity_id: occ.entityId,
          occurrence_index: occ.occurrenceIndex,
          snippet: occ.snippet
        })
      }
    }
  })
  run()
  console.log(`[db] scene_tags ripopolata da ${scenes.length} scene esistenti`)
}
