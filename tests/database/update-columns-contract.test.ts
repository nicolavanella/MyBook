import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository, DOCUMENT_UPDATE_COLUMNS } from '../../src/main/database/repositories/document.repository'
import { EVENT_COLUMNS } from '../../src/main/database/repositories/timeline.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'
import { NODE_COLUMNS } from '../../src/main/ipc/mindmap.ipc'
import { UpdateDocumentNodeInput } from '../../src/shared/schemas/document.schema'
import { MindmapNodeUpdateInput, TimelineEventUpdateInput } from '../../src/shared/schemas/domain.schema'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' }, ipcMain: { handle: vi.fn() } }))

const MIGRATIONS = path.join(__dirname, '../../database/migrations')

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  const repo = new DocumentRepository(db)
  const svc = new DocumentService(repo, new SceneTagsRepository(db))
  return { db, repo, svc }
}

const columnsOf = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

/**
 * REGRESSIONE (difetto presente anche nella 0.4.1): l'editor invia
 * `cursor_position` insieme al testo a ogni salvataggio, ma la lista di
 * colonne del repository non la includeva. Ogni salvataggio falliva con
 * "Document fields not allowed: cursor_position": il pulsante tornava a
 * "Salva" e la data di salvataggio restava ferma. Nessun test inviava il
 * campo, quindi nessuno se n'era accorto.
 */
describe('salvataggio di una scena così come lo invia l\'editor', () => {
  it('REGRESSIONE: content + cursor_position vengono salvati entrambi', () => {
    const { svc } = setup()
    const scene = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'S' } as any)
    const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Il gatto dorme.' }] }] })

    const payload = UpdateDocumentNodeInput.parse({ id: scene.id, fields: { content, cursor_position: 15 } }) // come arriva dall'IPC
    const saved = svc.update(payload) as any

    expect(saved.content).toBe(content)
    expect(saved.cursor_position).toBe(15)
    expect(saved.word_count).toBe(3)
  })

  it('anche il solo cursor_position (senza testo) si salva', () => {
    const { svc } = setup()
    const scene = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'S' } as any)
    expect((svc.update({ id: scene.id, fields: { cursor_position: 7 } } as any) as any).cursor_position).toBe(7)
  })

  it('REGRESSIONE: tutti i contenuti reali dei manuali inclusi nell\'app si salvano con la posizione del cursore', () => {
    const { svc } = setup()
    const scene = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'S' } as any)
    const dir = path.join(__dirname, '../../resources')
    let provati = 0
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mybook.json'))) {
      const pack = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
      for (const node of pack.data.documentNodes as { content?: unknown }[]) {
        if (typeof node.content !== 'string') continue
        provati++
        const payload = UpdateDocumentNodeInput.parse({ id: scene.id, fields: { content: node.content, cursor_position: 3 } })
        expect(() => svc.update(payload), file).not.toThrow()
      }
    }
    expect(provati).toBeGreaterThan(0)
  })

  it('un campo davvero sconosciuto continua a essere rifiutato (la lista resta una protezione)', () => {
    const { repo, svc } = setup()
    const scene = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'S' } as any)
    expect(() => repo.update(scene.id, { id: 'x' })).toThrow(/not allowed/)
    expect(() => repo.update(scene.id, { project_id: 'altro' })).toThrow(/not allowed/)
  })
})

/**
 * Contratto schema ⇄ colonne: un campo che lo schema Zod lascia passare ma che la
 * lista del repository rifiuta è un salvataggio che fallisce a runtime (è
 * esattamente il difetto di cursor_position). Questi test lo rendono impossibile
 * da reintrodurre per documenti, eventi della timeline e nodi della mappa.
 */
describe('contratto tra schemi di aggiornamento e colonne ammesse', () => {
  it('ogni campo di UpdateDocumentNodeInput è ammesso dal repository dei documenti', () => {
    const fields = Object.keys(UpdateDocumentNodeInput.shape.fields.shape)
    expect(fields.length).toBeGreaterThan(0)
    for (const field of fields) expect(DOCUMENT_UPDATE_COLUMNS.has(field), `document_nodes: "${field}" non ammesso`).toBe(true)
  })

  it('ogni campo di TimelineEventUpdateInput è ammesso dal repository della timeline', () => {
    for (const field of Object.keys(TimelineEventUpdateInput.shape.fields.shape)) {
      expect(EVENT_COLUMNS.has(field), `timeline_events: "${field}" non ammesso`).toBe(true)
    }
  })

  it('ogni campo di MindmapNodeUpdateInput è ammesso dall\'aggiornamento dei nodi della mappa', () => {
    for (const field of Object.keys(MindmapNodeUpdateInput.shape.fields.shape)) {
      expect(NODE_COLUMNS.has(field), `mindmap_nodes: "${field}" non ammesso`).toBe(true)
    }
  })

  it('ogni colonna ammessa esiste davvero nella tabella (nessun refuso)', () => {
    const { db } = setup()
    const check = (table: string, allowed: ReadonlySet<string>) => {
      const real = columnsOf(db, table)
      for (const col of allowed) expect(real, `${table}.${col}`).toContain(col)
    }
    check('document_nodes', DOCUMENT_UPDATE_COLUMNS)
    check('timeline_events', EVENT_COLUMNS)
    check('mindmap_nodes', NODE_COLUMNS)
  })
})
