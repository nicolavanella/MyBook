import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  db.prepare("INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,order_index) VALUES ('ch','p',NULL,'chapter','Capitolo 1',0)").run()
  db.prepare("INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,order_index) VALUES ('s1','p','ch','scene','Scena 1',0)").run()
  db.prepare("INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,order_index) VALUES ('s2','p','ch','scene','Scena 2',1)").run()
  return { db, repo: new SceneTagsRepository(db) }
}

describe('SceneTagsRepository (v0.3.8)', () => {
  it('replaceForScene inserisce i tag e usagesForEntity li ritrova con capitolo e scena', () => {
    const { repo } = setup()
    repo.replaceForScene('s1', 'p', [{ entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'Marco' }])
    const usages = repo.usagesForEntity('p', 'character', 'c1')
    expect(usages).toEqual([
      { sceneId: 's1', sceneTitle: 'Scena 1', chapterId: 'ch', chapterTitle: 'Capitolo 1', occurrenceIndex: 0, snippet: 'Marco' }
    ])
  })

  it('replaceForScene sostituisce interamente i tag precedenti della scena (non li accumula)', () => {
    const { repo } = setup()
    repo.replaceForScene('s1', 'p', [{ entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'Marco' }])
    repo.replaceForScene('s1', 'p', [{ entityType: 'character', entityId: 'c2', occurrenceIndex: 0, snippet: 'Luisa' }])
    expect(repo.usagesForEntity('p', 'character', 'c1')).toEqual([])
    expect(repo.usagesForEntity('p', 'character', 'c2')).toHaveLength(1)
  })

  it("un'entità taggata in più scene produce più righe, ordinate come nel Manoscritto", () => {
    const { repo } = setup()
    repo.replaceForScene('s2', 'p', [{ entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'Marco' }])
    repo.replaceForScene('s1', 'p', [{ entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'Marco' }])
    const usages = repo.usagesForEntity('p', 'character', 'c1')
    expect(usages.map((u) => u.sceneId)).toEqual(['s1', 's2']) // s1 ha order_index 0, s2 ha 1
  })

  it('countsByChapter somma le occorrenze per (capitolo, entità) su tutte le scene del capitolo', () => {
    const { repo } = setup()
    repo.replaceForScene('s1', 'p', [
      { entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'a' },
      { entityType: 'character', entityId: 'c1', occurrenceIndex: 1, snippet: 'b' }
    ])
    repo.replaceForScene('s2', 'p', [{ entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'c' }])
    expect(repo.countsByChapter('p')).toEqual([{ chapterId: 'ch', entityType: 'character', entityId: 'c1', count: 3 }])
  })

  it('eliminando la scena (ON DELETE CASCADE) i suoi tag scompaiono da soli', () => {
    const { db, repo } = setup()
    repo.replaceForScene('s1', 'p', [{ entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'Marco' }])
    db.prepare('DELETE FROM document_nodes WHERE id = ?').run('s1')
    expect(repo.usagesForEntity('p', 'character', 'c1')).toEqual([])
  })

  it('nessuna occorrenza -> array vuoto, nessun errore', () => {
    const { repo } = setup()
    expect(repo.usagesForEntity('p', 'character', 'inesistente')).toEqual([])
    expect(repo.countsByChapter('p')).toEqual([])
  })
})
