import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { backfillSceneTags } from '../../src/main/database/migrations/backfill-scene-tags'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'

function tiptapWithTag(text: string, entityType: string, entityId: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'entityTag', attrs: { entityType, entityId } }] }] }]
  })
}

describe('runMigrations — versioni applicate (v0.3.8)', () => {
  it('ritorna solo le versioni applicate in QUESTA chiamata, non quelle già presenti', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const dir = path.join(__dirname, '../../database/migrations')
    const firstRun = runMigrations(db, dir)
    expect(firstRun.length).toBeGreaterThan(0)
    expect(firstRun).toContain(19)
    const secondRun = runMigrations(db, dir)
    expect(secondRun).toEqual([])
  })
})

describe('backfillSceneTags (v0.3.8)', () => {
  it('ripopola scene_tags dal contenuto già salvato di scene preesistenti', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const dir = path.join(__dirname, '../../database/migrations')
    // Simula un database v0.3.7 (prima di scene_tags): applica solo fino alla 018 in una cartella temporanea.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'))
    for (const f of fs.readdirSync(dir).filter((n) => parseInt(n) <= 18)) fs.copyFileSync(path.join(dir, f), path.join(tmp, f))
    runMigrations(db, tmp)

    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
    db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
    db.prepare("INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,order_index,content) VALUES ('ch','p',NULL,'chapter','Capitolo 1',0,'')").run()
    db.prepare("INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,order_index,content) VALUES ('s1','p','ch','scene','Scena 1',0,?)").run(
      tiptapWithTag('Marco', 'character', 'c1')
    )

    const applied = runMigrations(db, dir) // ora applica anche la 019 (crea scene_tags, ancora vuota)
    expect(applied).toContain(19)
    expect(new SceneTagsRepository(db).usagesForEntity('p', 'character', 'c1')).toEqual([])

    backfillSceneTags(db)
    const usages = new SceneTagsRepository(db).usagesForEntity('p', 'character', 'c1')
    expect(usages).toEqual([{ sceneId: 's1', sceneTitle: 'Scena 1', chapterId: 'ch', chapterTitle: 'Capitolo 1', occurrenceIndex: 0, snippet: 'Marco' }])

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('non fa nulla (nessun errore) su un database senza scene con tag', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, path.join(__dirname, '../../database/migrations'))
    expect(() => backfillSceneTags(db)).not.toThrow()
    expect(new SceneTagsRepository(db).countsByChapter('qualunque')).toEqual([])
  })
})
