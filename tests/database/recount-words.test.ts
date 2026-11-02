import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { recountWordsAndChars } from '../../src/main/database/migrations/recount-words'

const MIGRATIONS = path.join(__dirname, '../../database/migrations')

const doc = (...blocks: any[]) => JSON.stringify({ type: 'doc', content: blocks })
const para = (...parts: any[]) => ({ type: 'paragraph', content: parts })
const text = (t: string, marks?: any[]) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t })

/** "Marco, disse piano." con "Marco" in grassetto: 3 parole vere, 4 con il vecchio conteggio (virgola isolata). */
const CONTENT = doc(para(text('Marco', [{ type: 'bold' }]), text(', disse piano.')))
const TRUE_WORDS = 3
const TRUE_CHARS = 'Marco, disse piano.'.length

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  return db
}

function addNode(db: Database.Database, id: string, content: string, words: number, chars: number) {
  db.prepare('INSERT INTO document_nodes (id,project_id,node_type,title,content,word_count,char_count) VALUES (?,?,?,?,?,?,?)').run(id, 'p', 'scene', id, content, words, chars)
}
const counts = (db: Database.Database, table: string, id: string) =>
  db.prepare(`SELECT word_count, char_count FROM ${table} WHERE id=?`).get(id) as { word_count: number; char_count: number }

describe('recountWordsAndChars (v0.4.2)', () => {
  it('corregge i conteggi gonfiati di scene e revisioni già salvate', () => {
    const db = setup()
    addNode(db, 'n1', CONTENT, 4, 20) // 4 = valore gonfiato dal vecchio conteggio
    db.prepare('INSERT INTO document_revisions (id,document_node_id,content,reason,word_count,char_count) VALUES (?,?,?,?,?,?)').run('r1', 'n1', CONTENT, 'autosave', 4, 20)

    const changed = recountWordsAndChars(db)

    expect(changed).toEqual({ nodes: 1, revisions: 1 })
    expect(counts(db, 'document_nodes', 'n1')).toEqual({ word_count: TRUE_WORDS, char_count: TRUE_CHARS })
    expect(counts(db, 'document_revisions', 'r1')).toEqual({ word_count: TRUE_WORDS, char_count: TRUE_CHARS })
  })

  it('è idempotente: una seconda esecuzione non cambia nulla', () => {
    const db = setup()
    addNode(db, 'n1', CONTENT, 4, 20)
    recountWordsAndChars(db)
    expect(recountWordsAndChars(db)).toEqual({ nodes: 0, revisions: 0 })
    expect(counts(db, 'document_nodes', 'n1').word_count).toBe(TRUE_WORDS)
  })

  it('non tocca le righe già corrette né quelle con contenuto vuoto, e non fallisce su JSON non valido', () => {
    const db = setup()
    addNode(db, 'giusta', CONTENT, TRUE_WORDS, TRUE_CHARS)
    addNode(db, 'vuota', '', 7, 7)
    addNode(db, 'rotta', 'questo non è JSON', 9, 9)

    const changed = recountWordsAndChars(db)

    // "rotta" non è JSON: il conteggio corretto è 0 (come per una scena appena creata), quindi cambia.
    expect(changed.nodes).toBe(1)
    expect(counts(db, 'document_nodes', 'giusta')).toEqual({ word_count: TRUE_WORDS, char_count: TRUE_CHARS })
    expect(counts(db, 'document_nodes', 'vuota')).toEqual({ word_count: 7, char_count: 7 })
    expect(counts(db, 'document_nodes', 'rotta')).toEqual({ word_count: 0, char_count: 0 })
  })

  it('funziona su un database vuoto', () => {
    const db = setup()
    expect(recountWordsAndChars(db)).toEqual({ nodes: 0, revisions: 0 })
  })

  it('il totale di progetto (somma di word_count) torna corretto dopo il ricalcolo', () => {
    const db = setup()
    addNode(db, 'a', CONTENT, 4, 20)
    addNode(db, 'b', doc(para(text('uno due'))), 3, 8)
    recountWordsAndChars(db)
    const total = db.prepare('SELECT SUM(word_count) AS w FROM document_nodes').get() as { w: number }
    expect(total.w).toBe(TRUE_WORDS + 2)
  })
})

describe('migrazione 027 — segnaposto del ricalcolo', () => {
  it('viene applicata su un database nuovo e segnalata tra le "applicate ora" (db.ts lancia da lì il ricalcolo)', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    expect(runMigrations(db, MIGRATIONS)).toContain(27)
    expect(runMigrations(db, MIGRATIONS)).toEqual([]) // alla seconda volta non riparte: il ricalcolo è una tantum
  })

  it('un database fermo alla 0.4.1 (migrazioni fino alla 026) la applica all\'aggiornamento', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, MIGRATIONS)
    db.prepare('DELETE FROM schema_migrations WHERE version = 27').run() // simula lo stato prima dell'aggiornamento
    expect(runMigrations(db, MIGRATIONS)).toEqual([27])
  })
})
