import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { DocumentService } from '../../src/main/services/document.service'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'
import { analyzeText, countWordsAndChars, extractParagraphs } from '../../src/shared/textAnalysis'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

/** Testo con un tag di personaggio (mark) seguito da punteggiatura non formattata: il caso tipico del difetto. */
const TAGGED = JSON.stringify({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Marco', marks: [{ type: 'entityTag', attrs: { entityType: 'character', entityId: 'c1' } }] },
      { type: 'text', text: ', disse piano.' }
    ]
  }]
})

const p = (...parts: any[]) => ({ type: 'paragraph', content: parts })
const t = (text: string, marks?: any[]) => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const doc = (...blocks: any[]) => JSON.stringify({ type: 'doc', content: blocks })

const FIXTURES: Record<string, { json: string; words: number }> = {
  'tag seguito da virgola (la virgola NON è una parola)': { json: TAGGED, words: 3 }, // Marco, disse piano.
  'grassetto a metà parola': { json: doc(p(t('per'), t('ché', [{ type: 'bold' }]), t(' no'))), words: 2 },
  'più paragrafi': { json: doc(p(t('uno due')), p(t('tre'))), words: 3 },
  'a capo forzato': { json: doc(p(t('a'), { type: 'hardBreak' }, t('b'))), words: 2 },
  'elenco puntato': {
    json: doc({ type: 'bulletList', content: [
      { type: 'listItem', content: [p(t('primo'))] },
      { type: 'listItem', content: [p(t('secondo'))] }
    ] }),
    words: 2
  },
  'documento vuoto': { json: doc(), words: 0 },
  'paragrafo vuoto': { json: doc({ type: 'paragraph' }), words: 0 }
}

describe('countWordsAndChars (v0.4.2)', () => {
  it.each(Object.entries(FIXTURES))('%s', (_name, { json, words }) => {
    expect(countWordsAndChars(json).words).toBe(words)
  })

  it('REGRESSIONE: "Marco" con tag + ", disse" conta 2 parole, non 3 (la virgola non è una parola)', () => {
    const tagged = JSON.stringify({
      type: 'doc',
      content: [p(t('Marco', [{ type: 'entityTag', attrs: { entityType: 'character', entityId: 'c1' } }]), t(', disse'))]
    })
    expect(countWordsAndChars(tagged)).toEqual({ words: 2, chars: 'Marco, disse'.length })
  })

  it('REGRESSIONE: "per" + grassetto "ché" è UNA parola', () => {
    expect(countWordsAndChars(doc(p(t('per'), t('ché', [{ type: 'bold' }]))))).toEqual({ words: 1, chars: 6 })
  })

  it('stringa JSON e documento già analizzato (editor.getJSON) danno lo stesso risultato', () => {
    for (const { json } of Object.values(FIXTURES)) {
      expect(countWordsAndChars(JSON.parse(json))).toEqual(countWordsAndChars(json))
    }
  })

  it('contenuto assente o non valido → zero, senza errori', () => {
    for (const bad of [null, undefined, '', 'non è json', '{"type":"doc"}', '[]']) {
      expect(countWordsAndChars(bad as any)).toEqual({ words: 0, chars: 0 })
    }
  })

  it('COERENZA: parole e caratteri coincidono sempre con la scheda Analisi (analyzeText)', () => {
    for (const [name, { json }] of Object.entries(FIXTURES)) {
      const analysis = analyzeText(extractParagraphs(json))
      const counts = countWordsAndChars(json)
      expect(counts.words, name).toBe(analysis.words)
      expect(counts.chars, name).toBe(analysis.charsWithSpaces)
    }
  })
})

function service() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  return { db, svc: new DocumentService(new DocumentRepository(db), new SceneTagsRepository(db)) }
}

describe('DocumentService.update — word_count/char_count salvati (v0.4.2)', () => {
  it('salva il conteggio corretto per un testo con tag e punteggiatura', () => {
    const { svc } = service()
    const scene = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'S' })
    const saved = svc.update({ id: scene.id, fields: { content: TAGGED } }) as any
    expect(saved.word_count).toBe(3) // Marco, disse piano.
    expect(saved.char_count).toBe('Marco, disse piano.'.length)
  })

  it('il totale di progetto riflette il conteggio corretto', () => {
    const { svc } = service()
    const a = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'A' })
    const b = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'B' })
    svc.update({ id: a.id, fields: { content: FIXTURES['grassetto a metà parola'].json } })
    svc.update({ id: b.id, fields: { content: FIXTURES['più paragrafi'].json } })
    expect((svc.projectStatistics('p') as any).totalWords).toBe(2 + 3)
  })
})

describe('ProjectTransferService.importProject — i conteggi si ricalcolano (v0.4.2)', () => {
  it('ignora word_count/char_count del pacchetto (valori gonfiati di versioni precedenti o falsi)', () => {
    const { db, svc } = service()
    const scene = svc.create({ projectId: 'p', parentId: null, nodeType: 'scene', title: 'S' })
    svc.update({ id: scene.id, fields: { content: TAGGED } })

    const transfer = new ProjectTransferService(db)
    const pack = transfer.exportProject('p') as any
    pack.data.documentNodes[0].word_count = 999
    pack.data.documentNodes[0].char_count = 99999

    const newId = transfer.importProject(pack)
    const row = db.prepare('SELECT word_count, char_count FROM document_nodes WHERE project_id=?').get(newId) as any
    expect(row).toEqual({ word_count: 3, char_count: 'Marco, disse piano.'.length })
  })
})
