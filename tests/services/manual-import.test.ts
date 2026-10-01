import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'

/**
 * Verifica che resources/Manuale.mybook.json (v0.3.8, importato al primo
 * avvio — vedi main/index.ts) sia effettivamente un pacchetto valido e
 * importabile, così un errore di formattazione nel file non passerebbe
 * inosservato fino al primo avvio reale dell'app.
 */
describe('Manuale.mybook.json', () => {
  it('è un pacchetto mybook-project valido e si importa senza errori', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, path.join(__dirname, '../../database/migrations'))

    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../resources/Manuale.mybook.json'), 'utf-8'))
    const service = new ProjectTransferService(db)
    const projectId = service.importProject(raw)

    const project = db.prepare('SELECT title FROM projects WHERE id = ?').get(projectId) as any
    expect(project.title).toBe('Manuale di MyBook')

    const nodeCount = (db.prepare("SELECT COUNT(*) as n FROM document_nodes WHERE project_id = ?").get(projectId) as any).n
    expect(nodeCount).toBe(7) // 1 capitolo + 6 scene

    const scenes = db.prepare("SELECT title FROM document_nodes WHERE project_id = ? AND node_type = 'scene' ORDER BY order_index").all(projectId) as any[]
    expect(scenes.map((s) => s.title)).toEqual([
      'Benvenuto in MyBook', 'Il Manoscritto', 'Personaggi, Località, Oggetti',
      'Timeline e Mappa concettuale', 'Statistiche', 'Registro attività e Impostazioni'
    ])

    expect((db.prepare('SELECT COUNT(*) as n FROM characters WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM locations WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM objects WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM timeline_events WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM mindmap_nodes WHERE project_id=?').get(projectId) as any).n).toBe(2)
    expect((db.prepare('SELECT COUNT(*) as n FROM mindmap_edges WHERE project_id=?').get(projectId) as any).n).toBe(1)

    // Il capitolo è davvero il genitore delle sue 6 scene (parent_id remappato correttamente).
    const chapter = db.prepare("SELECT id FROM document_nodes WHERE project_id=? AND node_type='chapter'").get(projectId) as any
    const orphanScenes = db.prepare("SELECT COUNT(*) as n FROM document_nodes WHERE project_id=? AND node_type='scene' AND parent_id != ?").get(projectId, chapter.id) as any
    expect(orphanScenes.n).toBe(0)
  })
})
