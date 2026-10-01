import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

function tiptap(paragraphs: string[]): string {
  return JSON.stringify({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
}

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  const service = new DocumentService(new DocumentRepository(db), new SceneTagsRepository(db))
  return { db, service }
}

describe('DocumentService.analysis (v0.3.5 — Statistiche > Analisi)', () => {
  it('un progetto senza capitoli restituisce totali a zero e nessun capitolo', () => {
    const { service } = setup()
    const result = service.analysis('p')
    expect(result.chapters).toEqual([])
    expect(result.total.words).toBe(0)
  })

  it('somma correttamente le scene di più capitoli, mantenendo lo spaccato per capitolo', () => {
    const { service } = setup()
    const ch1 = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const ch2 = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 2' })
    const s1 = service.create({ projectId: 'p', parentId: ch1.id, nodeType: 'scene', title: 'Scena 1' })
    const s2 = service.create({ projectId: 'p', parentId: ch1.id, nodeType: 'scene', title: 'Scena 2' })
    const s3 = service.create({ projectId: 'p', parentId: ch2.id, nodeType: 'scene', title: 'Scena 3' })
    service.update({ id: s1.id, fields: { content: tiptap(['Una frase breve.']) } })
    service.update({ id: s2.id, fields: { content: tiptap(['Un\'altra frase qui.']) } })
    service.update({ id: s3.id, fields: { content: tiptap(['Frase del secondo capitolo.']) } })

    const result = service.analysis('p')
    expect(result.chapters).toHaveLength(2)
    const c1 = result.chapters.find((c) => c.chapterId === ch1.id)!
    const c2 = result.chapters.find((c) => c.chapterId === ch2.id)!
    expect(c1.chapterTitle).toBe('Capitolo 1')
    expect(c1.paragraphs).toBe(2) // le due scene, un paragrafo ciascuna
    expect(c2.paragraphs).toBe(1)
    // Il totale di progetto include tutte le scene di tutti i capitoli.
    expect(result.total.words).toBe(c1.words + c2.words)
    expect(result.total.paragraphs).toBe(3)
  })

  it('un capitolo senza scene con contenuto ha comunque tutti i campi a zero (nessun crash)', () => {
    const { service } = setup()
    service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo vuoto' })
    const result = service.analysis('p')
    expect(result.chapters[0]).toMatchObject({ words: 0, paragraphs: 0, sentences: 0 })
  })

  it('un gruppo non è considerato un capitolo nello spaccato', () => {
    const { service } = setup()
    const group = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte I' })
    service.create({ projectId: 'p', parentId: group.id, nodeType: 'chapter', title: 'Capitolo 1' })
    const result = service.analysis('p')
    expect(result.chapters.map((c) => c.chapterTitle)).toEqual(['Capitolo 1'])
  })
})

describe('DocumentService.analysis — tag per capitolo (v0.3.6)', () => {
  function tiptapWithTag(text: string, entityType: string, entityId: string): string {
    return JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'entityTag', attrs: { entityType, entityId } }] }] }]
    })
  }

  it('somma le occorrenze di uno stesso tag su più scene dello stesso capitolo', () => {
    const { service } = setup()
    const ch = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const s1 = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 1' })
    const s2 = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 2' })
    service.update({ id: s1.id, fields: { content: tiptapWithTag('Marco', 'character', 'c1') } })
    service.update({ id: s2.id, fields: { content: tiptapWithTag('Marco', 'character', 'c1') } })

    const result = service.analysis('p')
    expect(result.chapters[0].tags).toEqual([{ entityType: 'character', entityId: 'c1', count: 2 }])
  })

  it('un capitolo senza tag ha un array tags vuoto', () => {
    const { service } = setup()
    service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo vuoto' })
    expect(service.analysis('p').chapters[0].tags).toEqual([])
  })

  it('ordina i tag per numero di occorrenze decrescente', () => {
    const { service } = setup()
    const ch = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo 1' })
    const scene = service.create({ projectId: 'p', parentId: ch.id, nodeType: 'scene', title: 'Scena 1' })
    const content = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Marco', marks: [{ type: 'entityTag', attrs: { entityType: 'character', entityId: 'c1' } }] },
            { type: 'text', text: ' e ' },
            { type: 'text', text: 'Luisa', marks: [{ type: 'entityTag', attrs: { entityType: 'character', entityId: 'c2' } }] },
            { type: 'text', text: ', poi ancora ' },
            { type: 'text', text: 'Marco', marks: [{ type: 'entityTag', attrs: { entityType: 'character', entityId: 'c1' } }] }
          ]
        }
      ]
    })
    service.update({ id: scene.id, fields: { content } })
    expect(service.analysis('p').chapters[0].tags).toEqual([
      { entityType: 'character', entityId: 'c1', count: 2 },
      { entityType: 'character', entityId: 'c2', count: 1 }
    ])
  })
})

describe('DocumentService — ordine capitoli come nel Manoscritto (v0.3.7)', () => {
  it('chapterBreakdown segue l\'ordine del tree, non l\'order_index grezzo tra gruppi diversi', () => {
    const { service } = setup()
    // Due gruppi, ciascuno con capitoli che ripartono da order_index 0: senza
    // il fix, l'ordinamento globale per order_index mescolerebbe i capitoli
    // dei due gruppi invece di rispettare l'ordine visivo dell'albero.
    const groupA = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte A' })
    const groupB = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte B' })
    const chB1 = service.create({ projectId: 'p', parentId: groupB.id, nodeType: 'chapter', title: 'B1' })
    const chA1 = service.create({ projectId: 'p', parentId: groupA.id, nodeType: 'chapter', title: 'A1' })
    const chA2 = service.create({ projectId: 'p', parentId: groupA.id, nodeType: 'chapter', title: 'A2' })

    const breakdown = service.chapterBreakdown('p')
    expect(breakdown.map((c) => c.chapterId)).toEqual([chA1.id, chA2.id, chB1.id])
  })

  it('analysis().chapters segue lo stesso ordine', () => {
    const { service } = setup()
    const groupA = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte A' })
    const groupB = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte B' })
    const chB1 = service.create({ projectId: 'p', parentId: groupB.id, nodeType: 'chapter', title: 'B1' })
    const chA1 = service.create({ projectId: 'p', parentId: groupA.id, nodeType: 'chapter', title: 'A1' })

    const result = service.analysis('p')
    expect(result.chapters.map((c) => c.chapterId)).toEqual([chA1.id, chB1.id])
  })

  it('un capitolo fuori da un gruppo si intercala correttamente con i gruppi secondo il proprio order_index', () => {
    const { service } = setup()
    const chapterAlone = service.create({ projectId: 'p', parentId: null, nodeType: 'chapter', title: 'Capitolo sciolto' })
    const group = service.create({ projectId: 'p', parentId: null, nodeType: 'group', title: 'Parte I' })
    const chapterInGroup = service.create({ projectId: 'p', parentId: group.id, nodeType: 'chapter', title: 'Capitolo nel gruppo' })

    const breakdown = service.chapterBreakdown('p')
    // chapterAlone e group sono entrambi root, creati in quest'ordine: chapterAlone ha order_index minore.
    expect(breakdown.map((c) => c.chapterId)).toEqual([chapterAlone.id, chapterInGroup.id])
  })
})
