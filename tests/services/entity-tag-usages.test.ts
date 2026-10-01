import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

function tiptapWithTag(text: string, entityType: string, entityId: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'entityTag', attrs: { entityType, entityId } }] }] }]
  })
}

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  return new DocumentService(new DocumentRepository(db), new SceneTagsRepository(db))
}

describe('DocumentService.findEntityTagUsages (v0.3.6)', () => {
  it('trova la scena e il capitolo dove compare un tag', () => {
    const service = setup()
    const ch = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const scene = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 1' })
    service.update({ id: scene.id, fields: { content: tiptapWithTag('Marco', 'character', 'c1') } })

    const usages = service.findEntityTagUsages('p', 'character', 'c1')
    expect(usages).toEqual([
      { chapterId: ch.id, chapterTitle: 'Capitolo 1', sceneId: scene.id, sceneTitle: 'Scena 1', occurrenceIndex: 0, snippet: 'Marco' }
    ])
  })

  it('nessuna occorrenza -> array vuoto', () => {
    const service = setup()
    expect(service.findEntityTagUsages('p', 'character', 'inesistente')).toEqual([])
  })

  it('più scene con lo stesso tag producono più righe, ciascuna con la propria scena', () => {
    const service = setup()
    const ch = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const s1 = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 1' })
    const s2 = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 2' })
    service.update({ id: s1.id, fields: { content: tiptapWithTag('Marco', 'character', 'c1') } })
    service.update({ id: s2.id, fields: { content: tiptapWithTag('Marco', 'character', 'c1') } })

    const usages = service.findEntityTagUsages('p', 'character', 'c1')
    expect(usages.map((u) => u.sceneTitle).sort()).toEqual(['Scena 1', 'Scena 2'])
  })

  it('non confonde tag su entità diverse (tipo o id diversi)', () => {
    const service = setup()
    const ch = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const scene = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 1' })
    service.update({ id: scene.id, fields: { content: tiptapWithTag('Marco', 'character', 'c1') } })

    expect(service.findEntityTagUsages('p', 'character', 'c2')).toEqual([])
    expect(service.findEntityTagUsages('p', 'location', 'c1')).toEqual([])
  })
})
