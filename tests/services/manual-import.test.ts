import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'

/**
 * Verifica che i progetti-manuale (v0.3.8; dalla 0.4.0 in italiano E in
 * inglese, importati al primo avvio — vedi main/index.ts) siano pacchetti
 * validi e importabili, così un errore di formattazione nel file non passa
 * inosservato fino al primo avvio reale dell'app.
 */
const MANUALS = [
  {
    file: 'Manuale.mybook.json',
    title: 'Manuale di MyBook',
    bookLanguage: 'it',
    scenes: [
      'Benvenuto in MyBook', 'Il Manoscritto', 'Personaggi, Località, Oggetti',
      'Timeline e Mappa concettuale', 'Statistiche', 'Registro attività e Impostazioni',
      'Cerca, scorciatoie e lingue'
    ]
  },
  {
    file: 'Manual.en.mybook.json',
    title: 'MyBook Manual',
    bookLanguage: 'en',
    scenes: [
      'Welcome to MyBook', 'The Manuscript', 'Characters, Locations, Objects',
      'Timeline and Mind map', 'Statistics', 'Activity log and Settings',
      'Find, shortcuts and languages'
    ]
  }
]

describe.each(MANUALS)('$file', ({ file, title, bookLanguage, scenes }) => {
  it('è un pacchetto mybook-project valido e si importa senza errori', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, path.join(__dirname, '../../database/migrations'))

    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../resources', file), 'utf-8'))
    const service = new ProjectTransferService(db)
    const projectId = service.importProject(raw)

    const project = db.prepare('SELECT title, book_language FROM projects WHERE id = ?').get(projectId) as any
    expect(project.title).toBe(title)
    // v0.4.0: ogni manuale è scritto nella propria lingua e lo dichiara (Lingua del libro).
    expect(project.book_language).toBe(bookLanguage)

    const nodeCount = (db.prepare('SELECT COUNT(*) as n FROM document_nodes WHERE project_id = ?').get(projectId) as any).n
    expect(nodeCount).toBe(1 + scenes.length)

    const sceneRows = db.prepare("SELECT title FROM document_nodes WHERE project_id = ? AND node_type = 'scene' ORDER BY order_index").all(projectId) as any[]
    expect(sceneRows.map((s) => s.title)).toEqual(scenes)

    expect((db.prepare('SELECT COUNT(*) as n FROM characters WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM locations WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM objects WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM timeline_events WHERE project_id=?').get(projectId) as any).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as n FROM mindmap_nodes WHERE project_id=?').get(projectId) as any).n).toBe(2)
    expect((db.prepare('SELECT COUNT(*) as n FROM mindmap_edges WHERE project_id=?').get(projectId) as any).n).toBe(1)

    // Il capitolo è davvero il genitore di tutte le sue scene (parent_id remappato correttamente).
    const chapter = db.prepare("SELECT id FROM document_nodes WHERE project_id=? AND node_type='chapter'").get(projectId) as any
    const orphanScenes = db.prepare("SELECT COUNT(*) as n FROM document_nodes WHERE project_id=? AND node_type='scene' AND parent_id != ?").get(projectId, chapter.id) as any
    expect(orphanScenes.n).toBe(0)
  })

  it('il contenuto di ogni scena è un documento TipTap valido con testo', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../resources', file), 'utf-8'))
    for (const node of raw.data.documentNodes.filter((n: any) => n.node_type === 'scene')) {
      const doc = JSON.parse(node.content)
      expect(doc.type).toBe('doc')
      expect(doc.content.length).toBeGreaterThan(0)
    }
  })
})
