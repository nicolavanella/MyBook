import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'

// document.service.ts importa config.ts, che importa 'electron' per app.isPackaged.
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

describe('DocumentService.update — locked (v0.3.0: blocca capitolo/gruppo)', () => {
  it('un nodo nuovo non è bloccato di default', () => {
    const { service } = setup()
    const chapter = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo' })
    expect(chapter.locked).toBe(0)
  })

  it('blocca un capitolo: locked=true viene convertito in 1 (better-sqlite3 non accetta booleani JS)', () => {
    const { service } = setup()
    const chapter = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo' })
    const updated = service.update({ id: chapter.id, fields: { locked: true } })
    expect(updated?.locked).toBe(1)
  })

  it('sblocca un capitolo precedentemente bloccato', () => {
    const { service } = setup()
    const chapter = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo' })
    service.update({ id: chapter.id, fields: { locked: true } })
    const updated = service.update({ id: chapter.id, fields: { locked: false } })
    expect(updated?.locked).toBe(0)
  })

  it('blocca un gruppo allo stesso modo di un capitolo', () => {
    const { service } = setup()
    const group = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte Prima' })
    const updated = service.update({ id: group.id, fields: { locked: true } })
    expect(updated?.locked).toBe(1)
  })
})
