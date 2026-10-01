import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ProjectDuplicationService } from '../../src/main/services/project-duplication.service'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  return db
}

describe('project transfer', () => {
  it('duplica anche nodi di mappa il cui gruppo è stato creato dopo', () => {
    const db = database()
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p','Originale')
    db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p','{}')
    db.prepare('INSERT INTO mindmaps (id,project_id,name) VALUES (?,?,?)').run('m','p','Mappa')
    db.prepare("INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,label) VALUES ('child','p','m','free_note','Nodo')").run()
    db.prepare("INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,label) VALUES ('group','p','m','group','Gruppo')").run()
    db.prepare("UPDATE mindmap_nodes SET group_id='group' WHERE id='child'").run()

    const newId = new ProjectDuplicationService(db).duplicate('p')
    const copied = db.prepare('SELECT group_id FROM mindmap_nodes WHERE project_id=? AND label=?').get(newId,'Nodo') as any
    expect(copied.group_id).toBeTruthy()
    db.close()
  })

  it('esporta e importa un progetto rigenerando gli identificativi', () => {
    const db = database()
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p','Romanzo')
    db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p','{"theme":"dark"}')
    db.prepare("INSERT INTO characters (id,project_id,name) VALUES ('c','p','Ada')").run()
    const transfer = new ProjectTransferService(db)
    const packageData = transfer.exportProject('p')
    const newId = transfer.importProject(packageData)
    expect(newId).not.toBe('p')
    expect((db.prepare('SELECT title FROM projects WHERE id=?').get(newId) as any).title).toBe('Romanzo')
    expect((db.prepare('SELECT name FROM characters WHERE project_id=?').get(newId) as any).name).toBe('Ada')
    expect((db.prepare('SELECT settings FROM project_settings WHERE project_id=?').get(newId) as any).settings).toBe('{"theme":"dark"}')
    db.close()
  })

  it('duplicazione ed export/import conservano la Data da calendario degli eventi (v0.3.4)', () => {
    const db = database()
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p','Romanzo')
    db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p','{}')
    db.prepare("INSERT INTO timelines (id,project_id,name) VALUES ('t','p','T')").run()
    db.prepare("INSERT INTO timeline_events (id,project_id,timeline_id,title,calendar_date) VALUES ('e','p','t','Evento','2026-09-21')").run()

    const dupId = new ProjectDuplicationService(db).duplicate('p')
    expect((db.prepare('SELECT calendar_date FROM timeline_events WHERE project_id=?').get(dupId) as any).calendar_date).toBe('2026-09-21')

    const transfer = new ProjectTransferService(db)
    const importedId = transfer.importProject(transfer.exportProject('p'))
    expect((db.prepare('SELECT calendar_date FROM timeline_events WHERE project_id=?').get(importedId) as any).calendar_date).toBe('2026-09-21')

    // Un export precedente alla v0.3.4 (senza la colonna) si importa con data vuota, senza errori.
    const legacy = transfer.exportProject('p') as any
    for (const ev of legacy.data?.timelineEvents ?? legacy.timelineEvents ?? []) delete ev.calendar_date
    const legacyId = transfer.importProject(legacy)
    expect((db.prepare('SELECT calendar_date FROM timeline_events WHERE project_id=?').get(legacyId) as any).calendar_date).toBe('')
    db.close()
  })
})
