import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import JSZip from 'jszip'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ExportService } from '../../src/main/services/export.service'
import sampleDataUrls from '../fixtures/sample-data-urls.json'

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  return db
}

/** Documento TipTap con un'immagine, un'interruzione di pagina e un testo evidenziato. */
function contentWithImageHighlightAndPageBreak(): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'testo evidenziato', marks: [{ type: 'highlight', attrs: { color: '#ffcc00' } }] }
        ]
      },
      { type: 'image', attrs: { src: sampleDataUrls.png, alt: 'illustrazione' } },
      { type: 'horizontalRule' },
      { type: 'paragraph', content: [{ type: 'text', text: 'dopo la pausa' }] }
    ]
  })
}

function seedProjectWithChapter(db: Database.Database): void {
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Romanzo di prova')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  db.prepare(
    `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
     VALUES ('ch1','p',NULL,'chapter','Capitolo Uno','{}',0)`
  ).run()
  db.prepare(
    `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
     VALUES ('sc1','p','ch1','scene','Scena Uno',?,0)`
  ).run(contentWithImageHighlightAndPageBreak())
}

describe('ExportService — export DOCX (fix v0.2.7: immagini, page break, evidenziazione)', () => {
  it('include l\'immagine come parte incorporata del documento .docx', async () => {
    const db = database()
    seedProjectWithChapter(db)
    const buffer = await new ExportService(db).toDocxBuffer('p')
    const zip = await JSZip.loadAsync(buffer)
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))
    expect(mediaFiles.length).toBeGreaterThan(0)
    db.close()
  })

  it('applica lo shading (colore di sfondo) al testo evidenziato nel document.xml', async () => {
    const db = database()
    seedProjectWithChapter(db)
    const buffer = await new ExportService(db).toDocxBuffer('p')
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).toBeDefined()
    expect(documentXml).toContain('w:shd')
    expect(documentXml?.toLowerCase()).toContain('ffcc00')
    db.close()
  })

  it('inserisce un\'interruzione di pagina reale (w:br type="page") nel document.xml', async () => {
    const db = database()
    seedProjectWithChapter(db)
    const buffer = await new ExportService(db).toDocxBuffer('p')
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    // Ce n'è già una tra frontespizio e corpo del testo: verifichiamo che
    // sia presente più di una volta, cioè che il separatore inserito
    // dall'utente nell'editor sia stato effettivamente convertito.
    const pageBreakOccurrences = (documentXml?.match(/w:type="page"/g) ?? []).length
    expect(pageBreakOccurrences).toBeGreaterThanOrEqual(2)
    db.close()
  })

  it('rispetta la selezione nodeIds: esporta solo i capitoli/scene richiesti', async () => {
    const db = database()
    seedProjectWithChapter(db)
    db.prepare(
      `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
       VALUES ('ch2','p',NULL,'chapter','Capitolo Escluso','{}',1)`
    ).run()
    const buffer = await new ExportService(db).toDocxBuffer('p', { nodeIds: ['ch1'] })
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).toContain('Capitolo Uno')
    expect(documentXml).not.toContain('Capitolo Escluso')
    db.close()
  })
})

/** Progetto con un Gruppo di Capitoli ("Parte Prima") contenente un capitolo, più un capitolo senza gruppo. */
function seedProjectWithGroup(db: Database.Database): void {
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Romanzo con parti')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  db.prepare(
    `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
     VALUES ('g1','p',NULL,'group','Parte Prima','{}',0)`
  ).run()
  db.prepare(
    `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
     VALUES ('ch1','p','g1','chapter','Capitolo Nel Gruppo','{}',0)`
  ).run()
  db.prepare(
    `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
     VALUES ('ch2','p',NULL,'chapter','Capitolo Fuori Gruppo','{}',1)`
  ).run()
}

describe('ExportService — separatore tra le parti (v0.2.10: Gruppi di Capitoli come "Parti")', () => {
  it('DOCX: con partSeparator "title" mostra il nome della parte prima del capitolo che contiene', async () => {
    const db = database()
    seedProjectWithGroup(db)
    const buffer = await new ExportService(db).toDocxBuffer('p', { partSeparator: 'title' })
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).toContain('Parte Prima')
    expect(documentXml).toContain('Capitolo Nel Gruppo')
    db.close()
  })

  it('DOCX: con partSeparator "none" non mostra il nome della parte, ma il capitolo resta presente', async () => {
    const db = database()
    seedProjectWithGroup(db)
    const buffer = await new ExportService(db).toDocxBuffer('p', { partSeparator: 'none' })
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).not.toContain('Parte Prima')
    expect(documentXml).toContain('Capitolo Nel Gruppo')
    db.close()
  })

  it('DOCX: una parte inserisce sempre un\'interruzione di pagina, anche con partSeparator "none"', async () => {
    const db = database()
    seedProjectWithGroup(db)
    const withTitle = await new ExportService(db).toDocxBuffer('p', { partSeparator: 'title' })
    const withoutTitle = await new ExportService(db).toDocxBuffer('p', { partSeparator: 'none' })
    for (const buffer of [withTitle, withoutTitle]) {
      const zip = await JSZip.loadAsync(buffer)
      const documentXml = await zip.file('word/document.xml')?.async('string')
      // Frontespizio + parte = almeno 2 interruzioni di pagina.
      const occurrences = (documentXml?.match(/w:type="page"/g) ?? []).length
      expect(occurrences).toBeGreaterThanOrEqual(2)
    }
    db.close()
  })

  it('Markdown: la parte genera \\pagebreak e, se richiesto, il titolo subito dopo', () => {
    const db = database()
    seedProjectWithGroup(db)
    const md = new ExportService(db).toMarkdown('p', { partSeparator: 'title' })
    expect(md).toContain('\\pagebreak')
    expect(md.indexOf('\\pagebreak')).toBeLessThan(md.indexOf('# Parte Prima'))
    db.close()
  })

  it('un capitolo senza gruppo non genera alcuna sezione di tipo "parte"', () => {
    const db = database()
    seedProjectWithGroup(db)
    const html = new ExportService(db).toHtml('p', { partSeparator: 'title' })
    // "Capitolo Fuori Gruppo" compare come normale <h1>, non preceduto da un'intestazione di parte a lui dedicata.
    expect(html).toContain('<h1>Capitolo Fuori Gruppo</h1>')
    db.close()
  })
})

describe('ExportService — separatore tra i capitoli (v0.3.0)', () => {
  it('HTML: con chapterSeparator "title" (default) mostra il nome del capitolo come intestazione', () => {
    const db = database()
    seedProjectWithChapter(db)
    const html = new ExportService(db).toHtml('p')
    expect(html).toContain('<h1>Capitolo Uno</h1>')
    db.close()
  })

  it('HTML: con chapterSeparator "none" il testo del capitolo compare comunque, senza intestazione visibile', () => {
    const db = database()
    seedProjectWithChapter(db)
    const html = new ExportService(db).toHtml('p', { chapterSeparator: 'none' })
    expect(html).not.toContain('<h1>Capitolo Uno</h1>')
    expect(html).toContain('testo evidenziato') // il contenuto della scena resta comunque presente
    db.close()
  })

  it('DOCX: con chapterSeparator "none" non produce un paragrafo di intestazione vuoto', async () => {
    const db = database()
    seedProjectWithChapter(db)
    const buffer = await new ExportService(db).toDocxBuffer('p', { chapterSeparator: 'none' })
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).not.toContain('Capitolo Uno')
    db.close()
  })

  it('Markdown: con chapterSeparator "none" non genera l\'intestazione "# Nome capitolo"', () => {
    const db = database()
    seedProjectWithChapter(db)
    const md = new ExportService(db).toMarkdown('p', { chapterSeparator: 'none' })
    expect(md).not.toContain('# Capitolo Uno')
  })

  it('un capitolo senza intestazione dentro una parte non genera una pagina vuota extra: resta una sola interruzione di pagina per la parte', async () => {
    const db = database()
    seedProjectWithGroup(db)
    const buffer = await new ExportService(db).toDocxBuffer('p', { chapterSeparator: 'none', partSeparator: 'none' })
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    // Frontespizio (1) + parte (1) = esattamente 2, non 3: il capitolo senza intestazione non aggiunge una propria interruzione.
    const occurrences = (documentXml?.match(/w:type="page"/g) ?? []).length
    expect(occurrences).toBe(2)
    db.close()
  })
})
