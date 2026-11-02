import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { MindmapService } from '../../src/main/services/mindmap.service'
import { ProjectDuplicationService } from '../../src/main/services/project-duplication.service'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'
import { MindmapEdgeUpdateInput, MindmapReorderNodesInput } from '../../src/shared/schemas/domain.schema'

const MIGRATIONS = path.join(__dirname, '../../database/migrations')

/** Progetto con una mappa, due gruppi (G1, G2) e alcune card. */
function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  db.prepare("INSERT INTO projects (id,title) VALUES ('p','Prog')").run()
  db.prepare("INSERT INTO mindmaps (id,project_id,name) VALUES ('m','p','Mappa')").run()
  db.prepare("INSERT INTO mindmaps (id,project_id,name) VALUES ('m2','p','Altra')").run()
  const node = (id: string, type: string, groupId: string | null, order = 0, map = 'm') =>
    db.prepare(
      'INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,label,group_id,order_index) VALUES (?,?,?,?,?,?,?)'
    ).run(id, 'p', map, type, id, groupId, order)
  node('G1', 'group', null)
  node('G2', 'group', null)
  node('a', 'free_note', 'G1', 0)
  node('b', 'free_note', 'G1', 1)
  node('c', 'free_note', 'G1', 2)
  node('x', 'free_note', 'G2', 0)
  node('u', 'free_note', null, 0)
  node('foreign', 'free_note', null, 0, 'm2')
  return { db, service: new MindmapService(db) }
}

const orderOf = (db: Database.Database, groupId: string | null) =>
  (db.prepare("SELECT id FROM mindmap_nodes WHERE mindmap_id='m' AND group_id IS ? AND node_type!='group' ORDER BY order_index, rowid").all(groupId) as any[]).map((r) => r.id)

describe('migrazione 026', () => {
  it('colonne e default: order_index 0, backup_prompt_shown 0, todo_recap_enabled 1', () => {
    const { db } = setup()
    const s = db.prepare('SELECT backup_prompt_shown, todo_recap_enabled FROM app_settings').get() as any
    expect(s.backup_prompt_shown).toBe(0)
    expect(s.todo_recap_enabled).toBe(1)
    const n = db.prepare("SELECT order_index FROM mindmap_nodes WHERE id='a'").get() as any
    expect(typeof n.order_index).toBe('number')
  })

  it('su un database 0.4.0 il backfill conserva l\'ordine di inserimento dei nodi, per gruppo', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'))
    for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x < '026')) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(tmp, f))
    runMigrations(db, tmp)
    db.prepare("INSERT INTO projects (id,title) VALUES ('p','P')").run()
    db.prepare("INSERT INTO mindmaps (id,project_id,name) VALUES ('m','p','M')").run()
    const ins = db.prepare("INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,label,group_id) VALUES (?,?,?,?,?,?)")
    ins.run('G', 'p', 'm', 'group', 'G', null)
    ins.run('n1', 'p', 'm', 'free_note', '1', 'G')
    ins.run('n2', 'p', 'm', 'free_note', '2', null)
    ins.run('n3', 'p', 'm', 'free_note', '3', 'G')
    ins.run('n4', 'p', 'm', 'free_note', '4', null)
    runMigrations(db, MIGRATIONS)
    const idx = (id: string) => (db.prepare('SELECT order_index FROM mindmap_nodes WHERE id=?').get(id) as any).order_index
    expect([idx('n1'), idx('n3')]).toEqual([0, 1]) // gruppo G: n1 prima di n3
    expect([idx('n2'), idx('n4')].sort()).toEqual([1, 2]) // "senza gruppo" ricomincia il conteggio (il gruppo G stesso, con group_id NULL, conta come primo)
    expect(idx('n2')).toBeLessThan(idx('n4'))
  })
})

describe('MindmapService.nextOrderIndex', () => {
  it('è il massimo del gruppo + 1', () => {
    const { service } = setup()
    expect(service.nextOrderIndex('m', 'G1')).toBe(3)
    expect(service.nextOrderIndex('m', 'G2')).toBe(1)
  })
  it('un gruppo vuoto parte da 0', () => {
    const { db, service } = setup()
    db.prepare("INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,label) VALUES ('G3','p','m','group','G3')").run()
    expect(service.nextOrderIndex('m', 'G3')).toBe(0)
  })
  it('"senza gruppo" ignora i nodi-gruppo (che hanno group_id nullo)', () => {
    const { service } = setup()
    expect(service.nextOrderIndex('m', null)).toBe(1) // solo la card "u" (order 0)
  })
  it('non guarda le altre mappe', () => {
    const { db, service } = setup()
    db.prepare("UPDATE mindmap_nodes SET order_index = 99 WHERE id = 'foreign'").run()
    expect(service.nextOrderIndex('m', null)).toBe(1)
  })
})

describe('MindmapService.reorderNodes', () => {
  it('riordina dentro lo stesso gruppo', () => {
    const { db, service } = setup()
    service.reorderNodes({ mindmapId: 'm', groupId: 'G1', orderedIds: ['c', 'a', 'b'] })
    expect(orderOf(db, 'G1')).toEqual(['c', 'a', 'b'])
  })

  it('sposta una card in un altro gruppo, nella posizione richiesta', () => {
    const { db, service } = setup()
    service.reorderNodes({ mindmapId: 'm', groupId: 'G2', orderedIds: ['a', 'x'] })
    expect(orderOf(db, 'G2')).toEqual(['a', 'x'])
    expect(orderOf(db, 'G1')).toEqual(['b', 'c'])
    expect((db.prepare("SELECT group_id FROM mindmap_nodes WHERE id='a'").get() as any).group_id).toBe('G2')
  })

  it('verso "senza gruppo" (groupId null)', () => {
    const { db, service } = setup()
    service.reorderNodes({ mindmapId: 'm', groupId: null, orderedIds: ['u', 'b'] })
    expect((db.prepare("SELECT group_id FROM mindmap_nodes WHERE id='b'").get() as any).group_id).toBeNull()
    expect(orderOf(db, null)).toEqual(['u', 'b'])
  })

  it('un gruppo di destinazione di un\'altra mappa o inesistente viene rifiutato e nulla cambia', () => {
    const { db, service } = setup()
    db.prepare("INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,label) VALUES ('GX','p','m2','group','GX')").run()
    expect(() => service.reorderNodes({ mindmapId: 'm', groupId: 'GX', orderedIds: ['a'] })).toThrow()
    expect(() => service.reorderNodes({ mindmapId: 'm', groupId: 'nope', orderedIds: ['a'] })).toThrow()
    expect(orderOf(db, 'G1')).toEqual(['a', 'b', 'c'])
  })

  it('una card di un\'altra mappa o un nodo-gruppo non possono essere riordinati', () => {
    const { service } = setup()
    expect(() => service.reorderNodes({ mindmapId: 'm', groupId: 'G1', orderedIds: ['foreign'] })).toThrow()
    expect(() => service.reorderNodes({ mindmapId: 'm', groupId: 'G1', orderedIds: ['G2'] })).toThrow()
  })

  it('è una transazione: se un id non è valido NESSUNA modifica viene applicata', () => {
    const { db, service } = setup()
    expect(() => service.reorderNodes({ mindmapId: 'm', groupId: 'G1', orderedIds: ['c', 'a', 'foreign', 'b'] })).toThrow()
    expect(orderOf(db, 'G1')).toEqual(['a', 'b', 'c'])
    expect((db.prepare("SELECT group_id FROM mindmap_nodes WHERE id='c'").get() as any).group_id).toBe('G1')
  })

  it('id duplicati vengono rifiutati', () => {
    const { service } = setup()
    expect(() => service.reorderNodes({ mindmapId: 'm', groupId: 'G1', orderedIds: ['a', 'a'] })).toThrow()
  })

  it('lo schema IPC richiede uuid e un array', () => {
    expect(MindmapReorderNodesInput.safeParse({ mindmapId: 'x', groupId: null, orderedIds: [] }).success).toBe(false)
    const u = '123e4567-e89b-42d3-a456-426614174000'
    expect(MindmapReorderNodesInput.safeParse({ mindmapId: u, groupId: null, orderedIds: [u] }).success).toBe(true)
  })
})

describe('MindmapService.updateEdgeLabel', () => {
  function withEdge() {
    const ctx = setup()
    ctx.db.prepare("INSERT INTO mindmap_edges (id,project_id,mindmap_id,source_node_id,target_node_id,label) VALUES ('e','p','m','a','x','')").run()
    return ctx
  }

  it('aggiunge un\'etichetta e segnala la modifica', () => {
    const { db, service } = withEdge()
    const r = service.updateEdgeLabel('e', 'amico di')
    expect(r).toMatchObject({ projectId: 'p', sourceLabel: 'a', targetLabel: 'x', changed: true })
    expect((db.prepare("SELECT label FROM mindmap_edges WHERE id='e'").get() as any).label).toBe('amico di')
  })

  it('modifica ed elimina l\'etichetta (stringa vuota)', () => {
    const { db, service } = withEdge()
    service.updateEdgeLabel('e', 'prima')
    service.updateEdgeLabel('e', 'dopo')
    expect((db.prepare("SELECT label FROM mindmap_edges WHERE id='e'").get() as any).label).toBe('dopo')
    expect(service.updateEdgeLabel('e', '')?.changed).toBe(true)
    expect((db.prepare("SELECT label FROM mindmap_edges WHERE id='e'").get() as any).label).toBe('')
  })

  it('ripulisce gli spazi ai bordi e non segnala modifica se il testo è lo stesso', () => {
    const { service } = withEdge()
    service.updateEdgeLabel('e', 'rivale')
    expect(service.updateEdgeLabel('e', '  rivale  ')?.changed).toBe(false)
  })

  it('un arco inesistente → null', () => {
    expect(setup().service.updateEdgeLabel('nope', 'x')).toBeNull()
  })

  it('lo schema IPC accetta solo il campo label', () => {
    const u = '123e4567-e89b-42d3-a456-426614174000'
    expect(MindmapEdgeUpdateInput.safeParse({ id: u, fields: { label: 'x' } }).success).toBe(true)
    expect(MindmapEdgeUpdateInput.safeParse({ id: u, fields: { label: 'x', style: 'dashed' } }).success).toBe(false)
  })
})

describe('l\'ordine delle card sopravvive a duplicazione ed export/import', () => {
  it('duplicazione e import mantengono l\'ordine scelto dall\'utente', () => {
    const { db, service } = setup()
    service.reorderNodes({ mindmapId: 'm', groupId: 'G1', orderedIds: ['c', 'a', 'b'] })
    const labelsOfGroup = (projectId: string) =>
      (db.prepare(
        `SELECT n.label FROM mindmap_nodes n JOIN mindmap_nodes g ON g.id=n.group_id
         WHERE n.project_id=? AND g.label='G1' ORDER BY n.order_index, n.rowid`
      ).all(projectId) as any[]).map((r) => r.label)
    db.prepare("INSERT INTO project_settings (project_id,settings) VALUES ('p','{}')").run()

    const copyId = new ProjectDuplicationService(db).duplicate('p')
    expect(labelsOfGroup(copyId)).toEqual(['c', 'a', 'b'])

    const transfer = new ProjectTransferService(db)
    const importedId = transfer.importProject(transfer.exportProject('p'))
    expect(labelsOfGroup(importedId)).toEqual(['c', 'a', 'b'])
  })

  it('un pacchetto esportato prima della 0.4.1 (senza order_index) si importa senza errori', () => {
    const { db } = setup()
    db.prepare("INSERT INTO project_settings (project_id,settings) VALUES ('p','{}')").run()
    const transfer = new ProjectTransferService(db)
    const pack = transfer.exportProject('p') as any
    for (const n of pack.data.mindmapNodes) delete n.order_index
    expect(() => transfer.importProject(pack)).not.toThrow()
  })
})
