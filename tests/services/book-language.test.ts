import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import JSZip from 'jszip'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ProjectRepository } from '../../src/main/database/repositories/project.repository'
import { DocumentRepository } from '../../src/main/database/repositories/document.repository'
import { SceneTagsRepository } from '../../src/main/database/repositories/scene-tags.repository'
import { ProjectService } from '../../src/main/services/project.service'
import { ProjectDuplicationService } from '../../src/main/services/project-duplication.service'
import { ProjectTransferService } from '../../src/main/services/project-transfer.service'
import { DocumentService } from '../../src/main/services/document.service'
import { ExportService } from '../../src/main/services/export.service'
import { CreateProjectInput, UpdateProjectInput } from '../../src/shared/schemas/document.schema'
import { analyzeText } from '../../src/shared/textAnalysis'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

/**
 * "Lingua del libro" (v0.4.0, migrazione 024): la lingua in cui è scritto il
 * manoscritto di un progetto, distinta da quella dell'interfaccia.
 */

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  const duplication = new ProjectDuplicationService(db)
  const projects = new ProjectService(new ProjectRepository(db), duplication)
  return { db, projects, duplication }
}

const tiptap = (paragraphs: string[]) =>
  JSON.stringify({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })

describe('migrazione 024 — colonna book_language', () => {
  it('esiste, con default "it" per i progetti già presenti e per quelli inseriti senza indicarla', () => {
    const { db } = setup()
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Vecchio progetto')
    const row = db.prepare('SELECT book_language FROM projects WHERE id = ?').get('p') as any
    expect(row.book_language).toBe('it')
    db.close()
  })

  it('una migrazione su un database 0.3.9 con progetti esistenti li lascia in italiano', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    // Simula un database fermo alla 0.3.9: tutte le migrazioni tranne la 024 e la 025.
    const fs = require('node:fs') as typeof import('node:fs')
    const dir = path.join(__dirname, '../../database/migrations')
    const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mig-'))
    for (const f of fs.readdirSync(dir).filter((x) => x < '024')) fs.copyFileSync(path.join(dir, f), path.join(tmp, f))
    runMigrations(db, tmp)
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('old', 'Prima della 0.4.0')
    runMigrations(db, dir) // ora applica 024 e 025
    expect((db.prepare('SELECT book_language FROM projects WHERE id=?').get('old') as any).book_language).toBe('it')
    db.close()
  })
})

describe('creazione e modifica del progetto', () => {
  it('senza indicazione il libro è in italiano (comportamento precedente)', () => {
    const { projects } = setup()
    const p = projects.create({ title: 'Senza lingua' }) as any
    expect(p.book_language).toBe('it')
  })

  it('si può creare un libro in inglese e cambiarne la lingua', () => {
    const { projects } = setup()
    const p = projects.create({ title: 'My novel', book_language: 'en' }) as any
    expect(p.book_language).toBe('en')
    const updated = projects.update({ id: p.id, fields: { book_language: 'it' } }) as any
    expect(updated.book_language).toBe('it')
  })

  it('cambiare un altro campo non tocca la lingua del libro', () => {
    const { projects } = setup()
    const p = projects.create({ title: 'A', book_language: 'en' }) as any
    const updated = projects.update({ id: p.id, fields: { title: 'B' } }) as any
    expect(updated.book_language).toBe('en')
  })

  it('lo schema rifiuta lingue non supportate', () => {
    expect(CreateProjectInput.safeParse({ title: 'x', book_language: 'fr' }).success).toBe(false)
    expect(UpdateProjectInput.safeParse({ id: 'p', fields: { book_language: 'de' } }).success).toBe(false)
    expect(CreateProjectInput.safeParse({ title: 'x', book_language: 'en' }).success).toBe(true)
  })
})

describe('duplicazione, esportazione e importazione', () => {
  it('la copia di un progetto mantiene la lingua del libro', () => {
    const { db, projects, duplication } = setup()
    const p = projects.create({ title: 'English book', book_language: 'en' }) as any
    db.prepare('INSERT INTO project_settings (project_id,settings) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM project_settings WHERE project_id=?)').run(p.id, '{}', p.id)
    const copyId = duplication.duplicate(p.id)
    expect((db.prepare('SELECT book_language FROM projects WHERE id=?').get(copyId) as any).book_language).toBe('en')
  })

  it('esporta e reimporta un progetto mantenendone la lingua', () => {
    const { db, projects } = setup()
    const p = projects.create({ title: 'English book', book_language: 'en' }) as any
    const transfer = new ProjectTransferService(db)
    const pack = transfer.exportProject(p.id)
    expect((pack.project as any).book_language).toBe('en')
    const newId = transfer.importProject(pack)
    expect((db.prepare('SELECT book_language FROM projects WHERE id=?').get(newId) as any).book_language).toBe('en')
  })

  it('un pacchetto esportato PRIMA della 0.4.0 (senza il campo) si importa come italiano', () => {
    const { db, projects } = setup()
    const p = projects.create({ title: 'Vecchio', book_language: 'en' }) as any
    const transfer = new ProjectTransferService(db)
    const pack = transfer.exportProject(p.id)
    delete (pack.project as any).book_language
    const newId = transfer.importProject(pack)
    expect((db.prepare('SELECT book_language FROM projects WHERE id=?').get(newId) as any).book_language).toBe('it')
  })

  it('un pacchetto con una lingua non valida non rompe l\'importazione: ripiega sull\'italiano', () => {
    const { db, projects } = setup()
    const p = projects.create({ title: 'Strano' }) as any
    const transfer = new ProjectTransferService(db)
    const pack = transfer.exportProject(p.id)
    ;(pack.project as any).book_language = 'klingon'
    const newId = transfer.importProject(pack)
    expect((db.prepare('SELECT book_language FROM projects WHERE id=?').get(newId) as any).book_language).toBe('it')
  })
})

describe('analisi delle parole chiave secondo la lingua del libro', () => {
  const text = ['The garden was quiet and the garden gate was open. Garden flowers, garden paths, and the garden wall.']

  it('con stopword inglesi "the", "and", "was" non sono parole chiave', () => {
    const keywords = analyzeText(text, 15, 'en').keywords.map((k) => k.word)
    expect(keywords[0]).toBe('garden')
    for (const stop of ['the', 'and', 'was']) expect(keywords).not.toContain(stop)
  })

  it('il default resta l\'italiano: le stopword italiane continuano a valere come prima', () => {
    const keywords = analyzeText(['Il castello era silenzioso e il castello era antico, con il castello sul colle.']).keywords.map((k) => k.word)
    expect(keywords[0]).toBe('castello')
    // "con" è una stopword italiana (e ha meno di 4 lettere): non deve comparire fra le parole chiave
    expect(keywords).not.toContain('con')
    expect(keywords).not.toContain('sul')
  })

  it('le contrazioni inglesi non diventano parole chiave', () => {
    const keywords = analyzeText(["It's true, don't worry, it's true: she can't leave. It's true.".repeat(2)], 15, 'en').keywords.map((k) => k.word)
    expect(keywords).not.toContain("it's")
    expect(keywords).not.toContain("don't")
    expect(keywords).not.toContain("can't")
  })

  it('DocumentService.analysis usa le stopword della lingua del progetto', () => {
    const { db, projects } = setup()
    const en = projects.create({ title: 'EN', book_language: 'en' }) as any
    const it = projects.create({ title: 'IT' }) as any
    for (const id of [en.id, it.id]) {
      db.prepare('INSERT INTO project_settings (project_id,settings) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM project_settings WHERE project_id=?)').run(id, '{}', id)
    }
    const service = new DocumentService(new DocumentRepository(db), new SceneTagsRepository(db))
    const body = tiptap(['Between mountains between rivers between valleys between roads between hills.'])
    for (const id of [en.id, it.id]) {
      const ch = service.create({ projectId: id, parentId: null, nodeType: 'chapter', title: 'C' })
      const sc = service.create({ projectId: id, parentId: ch.id, nodeType: 'scene', title: 'S' })
      service.update({ id: sc.id, fields: { content: body } })
    }
    const wordsEn = service.analysis(en.id).total.keywords.map((k: any) => k.word)
    const wordsIt = service.analysis(it.id).total.keywords.map((k: any) => k.word)
    expect(wordsEn).not.toContain('between') // stopword inglese
    expect(wordsIt).toContain('between') // in un libro "italiano" è una parola come un'altra
  })
})

describe('export: metadati secondo la lingua del libro', () => {
  function seed(db: Database.Database, id: string, language: 'it' | 'en') {
    db.prepare('INSERT INTO projects (id,title,book_language) VALUES (?,?,?)').run(id, 'Titolo', language)
    db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run(id, '{}')
    db.prepare(`INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
                VALUES (?,?,NULL,'chapter','Cap','{}',0)`).run(`ch-${id}`, id)
  }

  it('EPUB: dc:language e titolo dell\'indice seguono la lingua del libro', async () => {
    const { db } = setup()
    seed(db, 'pe', 'en')
    seed(db, 'pi', 'it')
    const service = new ExportService(db)
    for (const [id, lang, contents] of [['pe', 'en', 'Contents'], ['pi', 'it', 'Indice']] as const) {
      const zip = await JSZip.loadAsync(await service.toEpubBuffer(id))
      const opf = (await zip.file('OEBPS/content.opf')?.async('string')) ?? ''
      expect(opf).toContain(`<dc:language>${lang}</dc:language>`)
      const nav = (await zip.file('OEBPS/nav.xhtml')?.async('string')) ?? ''
      expect(nav).toContain(`<title>${contents}</title>`)
    }
  })

  it('HTML: l\'attributo lang segue la lingua del libro', () => {
    const { db } = setup()
    seed(db, 'pe', 'en')
    seed(db, 'pi', 'it')
    const service = new ExportService(db)
    expect(service.toHtml('pe')).toContain('<html lang="en">')
    expect(service.toHtml('pi')).toContain('<html lang="it">')
  })

  it('DOCX: la lingua del documento Word segue la lingua del libro', async () => {
    const { db } = setup()
    seed(db, 'pe', 'en')
    const zip = await JSZip.loadAsync(await new ExportService(db).toDocxBuffer('pe'))
    const styles = (await zip.file('word/styles.xml')?.async('string')) ?? ''
    expect(styles).toContain('en-GB')
  })

  it('il nome file suggerito di un progetto senza titolo usa la lingua del libro', () => {
    const { db } = setup()
    db.prepare('INSERT INTO projects (id,title,book_language) VALUES (?,?,?)').run('px', '   ', 'en')
    expect((new ExportService(db) as any).suggestedFileName('px', 'txt')).toContain('manuscript')
  })
})
