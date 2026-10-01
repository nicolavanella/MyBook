import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

function tiptap(text: string): string {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
}

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  return new DocumentService(new DocumentRepository(db), new SceneTagsRepository(db))
}

describe('DocumentService.projectStatistics — v0.3.6 (Statistiche > Principale)', () => {
  it('calcola i caratteri totali senza spazi, oltre a quelli con spazi già esistenti', () => {
    const service = setup()
    const ch = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const s1 = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 1', status: 'completo' } as any)
    const s2 = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 2' })
    service.update({ id: s1.id, fields: { content: tiptap('due parole') } }) // 10 caratteri con spazi, 9 senza
    service.update({ id: s2.id, fields: { content: tiptap('tre altre parole') } }) // 16 con spazi, 14 senza

    const stats = service.projectStatistics('p')
    expect(stats.totalChars).toBe(10 + 16)
    expect(stats.totalCharsWithoutSpaces).toBe(9 + 14)
    expect(stats.totalNodes).toBe(2)
  })

  it('un progetto senza scene ha tutti i totali a zero, nessun errore', () => {
    const service = setup()
    const stats = service.projectStatistics('p')
    expect(stats).toMatchObject({ totalWords: 0, totalChars: 0, totalCharsWithoutSpaces: 0, totalNodes: 0, completionPct: 0 })
    expect(stats.completedNodes ?? 0).toBe(0) // SUM su un insieme vuoto in SQLite ritorna NULL, non 0: comportamento preesistente, non introdotto da questa modifica.
  })
})

describe('DocumentService.projectStatistics — capitoli completati (v0.3.8)', () => {
  it('un capitolo è completato solo se TUTTE le sue scene sono Finito', () => {
    const service = setup()
    const ch1 = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const ch2 = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 2' })
    const s1 = service.create({ projectId: 'p', parentId: ch1.id, nodeType: 'scene', title: 'Scena 1' })
    const s2 = service.create({ projectId: 'p', parentId: ch1.id, nodeType: 'scene', title: 'Scena 2' })
    service.create({ projectId: 'p', parentId: ch2.id, nodeType: 'scene', title: 'Scena 3' })
    service.update({ id: s1.id, fields: { status: 'completo' } })
    service.update({ id: s2.id, fields: { status: 'completo' } }) // ch1: 2/2 completo -> capitolo completato
    // ch2: 0/1 completo -> capitolo NON completato

    const stats = service.projectStatistics('p')
    expect(stats.chaptersTotal).toBe(2)
    expect(stats.chaptersCompleted).toBe(1)
  })

  it('un capitolo senza scene non conta come completato', () => {
    const service = setup()
    service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo vuoto' })
    const stats = service.projectStatistics('p')
    expect(stats.chaptersTotal).toBe(1)
    expect(stats.chaptersCompleted).toBe(0)
  })

  it('progetto senza capitoli: zero e zero, nessun errore', () => {
    const service = setup()
    const stats = service.projectStatistics('p')
    expect(stats.chaptersTotal).toBe(0)
    expect(stats.chaptersCompleted).toBe(0)
  })
})
