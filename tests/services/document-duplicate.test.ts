import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'

// document.service.ts importa config.ts, che importa 'electron' per leggere
// app.isPackaged (usato solo per risolvere il percorso di config/database.yml
// dev/prod — vedi config.ts). In ambiente Vitest (Node puro, non Electron)
// il pacchetto 'electron' non è un vero binario installato e il suo require
// fallirebbe al solo import, quindi va mockato con uno stub minimo.
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  const service = new DocumentService(new DocumentRepository(db), new SceneTagsRepository(db))
  return { db, service }
}

describe('DocumentService.duplicate', () => {
  it('duplica un capitolo insieme a tutte le sue scene', () => {
    const { db, service } = setup()
    const chapter = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo Uno' })
    service.create({ projectId: 'p', parentId: chapter.id, nodeType: 'scene', title: 'Scena A' })
    service.create({ projectId: 'p', parentId: chapter.id, nodeType: 'scene', title: 'Scena B' })

    const copy = service.duplicate(chapter.id)

    expect(copy.title).toBe('Capitolo Uno (copia)')
    expect(copy.id).not.toBe(chapter.id)

    const copiedScenes = db.prepare('SELECT title FROM document_nodes WHERE parent_id = ? ORDER BY title').all(copy.id) as { title: string }[]
    // Le scene copiate NON ricevono il suffisso "(copia)": solo il nodo di
    // primo livello lo riceve, altrimenti "Capitolo (copia) / Scena (copia)" sarebbe ridondante.
    expect(copiedScenes.map((s) => s.title)).toEqual(['Scena A', 'Scena B'])

    const originalScenes = db.prepare('SELECT id FROM document_nodes WHERE parent_id = ?').all(chapter.id) as { id: string }[]
    expect(originalScenes).toHaveLength(2) // l'originale resta intatto
  })

  it('duplica una singola scena senza toccare le altre scene del capitolo', () => {
    const { db, service } = setup()
    const chapter = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo' })
    const scene = service.create({ projectId: 'p', parentId: chapter.id, nodeType: 'scene', title: 'Scena' })

    const copy = service.duplicate(scene.id)

    expect(copy.title).toBe('Scena (copia)')
    expect(copy.parent_id).toBe(chapter.id)
    const siblings = db.prepare('SELECT id FROM document_nodes WHERE parent_id = ?').all(chapter.id) as { id: string }[]
    expect(siblings).toHaveLength(2) // originale + copia
  })

  it('copia il contenuto e i conteggi della scena originale', () => {
    const { service } = setup()
    const chapter = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo' })
    const scene = service.create({ projectId: 'p', parentId: chapter.id, nodeType: 'scene', title: 'Scena' })
    service.update({ id: scene.id, fields: { content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Testo originale qui' }] }] }) } })

    const copy = service.duplicate(scene.id)

    expect(copy.content).toContain('Testo originale qui')
    expect(copy.word_count).toBeGreaterThan(0)
  })

  it('lancia un errore per un id inesistente', () => {
    const { service } = setup()
    expect(() => service.duplicate('non-esiste')).toThrow()
  })
})
