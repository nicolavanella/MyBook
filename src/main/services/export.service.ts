import type Database from 'better-sqlite3'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, ImageRun, ShadingType } from 'docx'
import JSZip from 'jszip'
import { v4 as uuid } from 'uuid'
import { tiptapToBlocks, blocksToPlainText, blocksToHtml, blocksToMarkdown, type Block } from './tiptap-convert'
import { dataUrlToImage, scaleToMaxWidth } from './image-dimensions'

interface ExportNode {
  id: string
  parent_id: string | null
  node_type: string
  title: string
  content: string
  order_index: number
}

interface ProjectMeta {
  title: string
  subtitle: string
  author: string | null
  year: number | null
}

export type SceneSeparator = 'title' | 'stars' | 'none'
export type PartSeparator = 'title' | 'none'
export type ChapterSeparator = 'title' | 'none'

export interface ExportOptions {
  /** Se presente, esporta solo questi nodi (capitoli e/o scene, con i rispettivi discendenti); altrimenti l'intero progetto. */
  nodeIds?: string[]
  /** Cosa inserire tra una scena e la successiva all'interno dello stesso capitolo. */
  sceneSeparator?: SceneSeparator
  /**
   * Cosa mostrare all'inizio di una "parte" (un Gruppo di Capitoli, vedi
   * document.schema.ts — node_type 'group'): il nome del gruppo, oppure
   * nessun testo. In entrambi i casi la parte inizia sempre su una nuova
   * pagina (interruzione di pagina forzata), indipendentemente da questa
   * scelta — vedi buildManuscript.
   */
  partSeparator?: PartSeparator
  /**
   * Cosa mostrare come intestazione di un capitolo: il suo nome (comportamento
   * di sempre), oppure nessuna intestazione — il contenuto prosegue senza un
   * titolo visibile, utile per un'impaginazione "romanzo continuo" affidata
   * ai soli separatori di scena. A differenza del separatore di parte, questa
   * scelta NON forza un'interruzione di pagina (altrimenti, per il primo
   * capitolo di una parte, si sommerebbe all'interruzione già inserita dalla
   * parte, producendo una pagina vuota indesiderata).
   */
  chapterSeparator?: ChapterSeparator
}

/** Una sezione del manoscritto esportato: un capitolo con il suo contenuto, oppure l'inizio di una parte (Gruppo di Capitoli). */
interface ManuscriptSection {
  kind: 'part' | 'chapter'
  /**
   * Per un capitolo, sempre il suo titolo reale (serve comunque per l'indice
   * dell'EPUB, anche quando non è mostrato come intestazione nel corpo).
   * Per una parte, null quando il separatore scelto è "Niente".
   */
  title: string | null
  /** Se mostrare `title` come intestazione visibile nel corpo del documento. */
  showHeading: boolean
  blocks: Block[]
}

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}

export class ExportService {
  constructor(private db: Database.Database) {}

  private getProjectMeta(projectId: string): ProjectMeta {
    const row = this.db
      .prepare('SELECT title, subtitle, author, year FROM projects WHERE id = ?')
      .get(projectId) as ProjectMeta | undefined
    return row ?? { title: 'Manoscritto', subtitle: '', author: null, year: null }
  }

  /** Nome file suggerito per il dialog di salvataggio: il titolo del progetto, sanificato. */
  suggestedFileName(projectId: string, extension: string): string {
    const { title } = this.getProjectMeta(projectId)
    const safe = title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ') || 'manoscritto'
    return `${safe}.${extension}`
  }

  private getManuscript(projectId: string, options?: ExportOptions): ExportNode[] {
    const all = this.db
      .prepare(`SELECT id, parent_id, node_type, title, content, order_index FROM document_nodes WHERE project_id = ? ORDER BY order_index ASC`)
      .all(projectId) as ExportNode[]

    if (!options?.nodeIds || options.nodeIds.length === 0) return all

    const byId = new Map(all.map((n) => [n.id, n]))
    const children = new Map<string | null, ExportNode[]>()
    for (const node of all) {
      const key = node.parent_id ?? null
      const list = children.get(key) ?? []
      list.push(node); children.set(key, list)
    }
    const included = new Set<string>()
    const includeDescendants = (id: string): void => {
      included.add(id)
      for (const child of children.get(id) ?? []) includeDescendants(child.id)
    }
    const includeAncestors = (id: string): void => {
      let current = byId.get(id)
      while (current?.parent_id) { included.add(current.parent_id); current = byId.get(current.parent_id) }
    }
    for (const id of options.nodeIds) if (byId.has(id)) { includeDescendants(id); includeAncestors(id) }
    return all.filter((n) => included.has(n.id))
  }

  private separatorBlock(separator: SceneSeparator, sceneTitle: string, level = 2): Block[] {
    if (separator === 'none') return []
    if (separator === 'stars') return [{ kind: 'paragraph', align: 'center', runs: [{ text: '***' }] }]
    return [{ kind: 'heading', level: Math.min(3, level), runs: [{ text: sceneTitle }] }]
  }

  /**
   * Costruisce l'elenco piatto di sezioni da esportare: un elemento per
   * capitolo, più un elemento aggiuntivo di tipo "part" appena prima dei
   * capitoli di ogni Gruppo (vedi ExportOptions.partSeparator). Il nodo
   * "group" stesso non ha contenuto proprio: la sua unica funzione qui è
   * introdurre l'interruzione di pagina (sempre) e, se richiesto, il suo
   * nome come intestazione.
   */
  private buildManuscript(projectId: string, options?: ExportOptions): ManuscriptSection[] {
    const nodes = this.getManuscript(projectId, options)
    const byParent = new Map<string | null, ExportNode[]>()
    for (const node of nodes) {
      const key = node.parent_id ?? null
      const list = byParent.get(key) ?? []
      list.push(node); byParent.set(key, list)
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order_index - b.order_index)

    const sceneSeparator = options?.sceneSeparator ?? 'title'
    const partSeparator = options?.partSeparator ?? 'title'
    const chapterSeparator = options?.chapterSeparator ?? 'title'
    const roots = byParent.get(null) ?? []
    const sections: ManuscriptSection[] = []

    const appendChildren = (parentId: string, blocks: Block[], depth: number): void => {
      const children = byParent.get(parentId) ?? []
      children.forEach((child, index) => {
        if (index > 0) blocks.push(...this.separatorBlock(sceneSeparator, child.title, depth + 1))
        else if (sceneSeparator === 'title') blocks.push(...this.separatorBlock('title', child.title, depth + 1))
        blocks.push(...tiptapToBlocks(child.content))
        appendChildren(child.id, blocks, depth + 1)
      })
    }

    const appendChapter = (chapter: ExportNode): void => {
      const blocks = tiptapToBlocks(chapter.content)
      appendChildren(chapter.id, blocks, 1)
      sections.push({ kind: 'chapter', title: chapter.title, showHeading: chapterSeparator !== 'none', blocks })
    }

    for (const root of roots) {
      if (root.node_type === 'group') {
        // Interruzione di pagina sempre presente, a prescindere dal separatore scelto.
        const partTitle = partSeparator === 'title' ? root.title : null
        sections.push({
          kind: 'part',
          title: partTitle,
          showHeading: partTitle !== null,
          blocks: [{ kind: 'pageBreak', runs: [] }]
        })
        for (const chapter of byParent.get(root.id) ?? []) appendChapter(chapter)
      } else {
        appendChapter(root)
      }
    }
    return sections
  }

  private titlePageBlocks(meta: ProjectMeta): Block[] {
    const blocks: Block[] = [{ kind: 'heading', level: 1, align: 'center', runs: [{ text: meta.title }] }]
    if (meta.subtitle) {
      blocks.push({ kind: 'heading', level: 2, align: 'center', runs: [{ text: meta.subtitle, italic: true }] })
    }
    const authorYear = [meta.author, meta.year ? String(meta.year) : null].filter(Boolean).join(' — ')
    if (authorYear) {
      blocks.push({ kind: 'paragraph', align: 'center', runs: [{ text: authorYear }] })
    }
    return blocks
  }

  toMarkdown(projectId: string, options?: ExportOptions): string {
    const meta = this.getProjectMeta(projectId)
    const titlePage = blocksToMarkdown(this.titlePageBlocks(meta))
    const body = this.buildManuscript(projectId, options)
      .map((s) => {
        // Per una parte: prima l'interruzione (\pagebreak), poi il titolo — la
        // nuova pagina inizia e SUBITO DOPO compare il nome della parte, non
        // il contrario. Per un capitolo, resta l'ordine consueto titolo+testo,
        // a meno che il separatore tra capitoli sia "Niente" (showHeading=false).
        if (s.kind === 'part') return s.showHeading ? `${blocksToMarkdown(s.blocks)}\n\n# ${s.title}` : blocksToMarkdown(s.blocks)
        return s.showHeading ? `# ${s.title}\n\n${blocksToMarkdown(s.blocks)}` : blocksToMarkdown(s.blocks)
      })
      .join('\n\n')
    return `${titlePage}\n\n---\n\n${body}`
  }

  toPlainText(projectId: string, options?: ExportOptions): string {
    const meta = this.getProjectMeta(projectId)
    const titlePage = blocksToPlainText(this.titlePageBlocks(meta))
    const body = this.buildManuscript(projectId, options)
      .map((s) => {
        if (s.kind === 'part') return s.showHeading ? `${blocksToPlainText(s.blocks)}\n\n${s.title?.toUpperCase()}` : blocksToPlainText(s.blocks)
        return s.showHeading ? `${s.title?.toUpperCase()}\n\n${blocksToPlainText(s.blocks)}` : blocksToPlainText(s.blocks)
      })
      .join('\n\n')
    return `${titlePage}\n\n\n${body}`
  }

  toHtml(projectId: string, options?: ExportOptions): string {
    const meta = this.getProjectMeta(projectId)
    const titlePage = `<div style="page-break-after: always">${blocksToHtml(this.titlePageBlocks(meta))}</div>`
    const body = this.buildManuscript(projectId, options)
      .map((s) => {
        if (s.kind === 'part') return s.showHeading ? `${blocksToHtml(s.blocks)}<h1 style="text-align:center">${s.title}</h1>` : blocksToHtml(s.blocks)
        return s.showHeading ? `<h1>${s.title}</h1>\n${blocksToHtml(s.blocks)}` : blocksToHtml(s.blocks)
      })
      .join('\n')
    return `<html><head><meta charset="utf-8"></head><body>${titlePage}${body}</body></html>`
  }

  /**
   * Converte un singolo Block in un Paragraph DOCX, inclusi i casi prima non
   * gestiti (immagine, interruzione di pagina) e l'evidenziazione colore
   * sfondo testo (`highlight`), che veniva letta dal documento TipTap ma mai
   * applicata al TextRun risultante — da qui la sua assenza nei file .docx
   * esportati nonostante fosse visibile nell'editor.
   */
  private blockToDocxParagraph(b: Block): Paragraph {
    if (b.kind === 'pageBreak') {
      return new Paragraph({ children: [new PageBreak()] })
    }
    if (b.kind === 'image') {
      const run = this.docxImageRun(b.src)
      return new Paragraph({ alignment: AlignmentType.CENTER, children: run ? [run] : [] })
    }
    return new Paragraph({
      heading: b.kind === 'heading' ? headingLevelOf(b.level) : undefined,
      alignment: b.align ? ALIGN_MAP[b.align] : undefined,
      children: b.runs.map(
        (r) =>
          new TextRun({
            text: r.text,
            bold: r.bold,
            italics: r.italic,
            strike: r.strike,
            underline: r.underline ? {} : undefined,
            color: r.color?.replace('#', ''),
            // type: SOLID è necessario perché il colore di sfondo sia
            // effettivamente visibile in Word: senza, w:shd viene scritto
            // senza attributo "val" e Word non applica alcuna evidenziazione.
            shading: r.highlight
              ? { type: ShadingType.SOLID, fill: r.highlight.replace('#', '') }
              : undefined
          })
      )
    })
  }

  /** Decodifica un'immagine (data URL) in un ImageRun docx, scalata per non sforare il margine di pagina. Ritorna null se il src manca o non è decodificabile. */
  private docxImageRun(src: string | undefined): ImageRun | null {
    const decoded = dataUrlToImage(src)
    if (!decoded) return null
    const { width, height } = scaleToMaxWidth(decoded.width, decoded.height)
    return new ImageRun({
      data: decoded.buffer,
      transformation: { width, height }
    })
  }

  async toDocxBuffer(projectId: string, options?: ExportOptions): Promise<Buffer> {
    const meta = this.getProjectMeta(projectId)
    const children: Paragraph[] = []

    for (const b of this.titlePageBlocks(meta)) {
      children.push(
        new Paragraph({
          heading: b.kind === 'heading' ? headingLevelOf(b.level) : undefined,
          alignment: b.align ? ALIGN_MAP[b.align] : AlignmentType.CENTER,
          children: b.runs.map((r) => new TextRun({ text: r.text, italics: r.italic }))
        })
      )
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))

    for (const section of this.buildManuscript(projectId, options)) {
      if (section.kind === 'part') {
        // L'interruzione di pagina è già il primo (e unico) blocco di section.blocks:
        // renderizzarla prima del titolo mette il nome della parte in cima alla nuova pagina.
        for (const b of section.blocks) children.push(this.blockToDocxParagraph(b))
        if (section.showHeading) {
          children.push(new Paragraph({ text: section.title ?? '', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }))
        }
        continue
      }
      if (section.showHeading) {
        children.push(new Paragraph({ text: section.title ?? '', heading: HeadingLevel.HEADING_1 }))
      }
      for (const b of section.blocks) {
        children.push(this.blockToDocxParagraph(b))
      }
    }
    const doc = new Document({ sections: [{ children }] })
    return Packer.toBuffer(doc)
  }

  async toEpubBuffer(projectId: string, options?: ExportOptions): Promise<Buffer> {
    const meta = this.getProjectMeta(projectId)
    const sections = this.buildManuscript(projectId, options)

    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    )

    const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    zip.file(
      'OEBPS/title.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(meta.title)}</title></head>
<body style="text-align:center">${blocksToHtml(this.titlePageBlocks(meta))}</body>
</html>`
    )

    // Ogni sezione (capitolo o parte) diventa un proprio file XHTML nello
    // spine: la maggior parte dei lettori e-book apre già ogni voce dello
    // spine su una pagina/schermata nuova, quindi una "parte" ottiene
    // l'interruzione di pagina richiesta semplicemente essendo un file a sé
    // — a differenza di PDF/DOCX/HTML non serve alcun trucco CSS esplicito.
    // Le parti non compaiono nella tavola dei contenuti (nav.xhtml): sono un
    // separatore visivo tra capitoli, non una destinazione di navigazione a
    // sé stante.
    const sectionFiles = sections.map((s, i) => {
      const id = s.kind === 'part' ? `part${i + 1}` : `chap${i + 1}`
      const bodyHtml = s.kind === 'part'
        ? (s.showHeading ? `<h1 style="text-align:center">${escapeXml(s.title ?? '')}</h1>` : '<p></p>')
        : (s.showHeading ? `<h1>${escapeXml(s.title ?? '')}</h1>${blocksToHtml(s.blocks)}` : blocksToHtml(s.blocks))
      const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(s.title ?? '')}</title></head>
<body>${bodyHtml}</body>
</html>`
      zip.file(`OEBPS/${id}.xhtml`, xhtml)
      // Il titolo per l'indice (nav.xhtml) resta sempre quello reale del
      // capitolo anche quando showHeading è false: l'indice deve comunque
      // poter identificare ogni capitolo, anche se la sua intestazione non
      // è visibile nel corpo del testo.
      return { id, title: s.title ?? '', kind: s.kind }
    })
    const chapterFiles = sectionFiles.filter((f) => f.kind === 'chapter')

    zip.file(
      'OEBPS/nav.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Indice</title></head>
<body>
  <nav epub:type="toc">
    <ol>
      <li><a href="title.xhtml">${escapeXml(meta.title)}</a></li>
      ${chapterFiles.map((c) => `<li><a href="${c.id}.xhtml">${escapeXml(c.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`
    )

    const bookId = uuid()
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:language>it</dc:language>
    ${meta.author ? `<dc:creator>${escapeXml(meta.author)}</dc:creator>` : ''}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    ${sectionFiles.map((f) => `<item id="${f.id}" href="${f.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    <itemref idref="title"/>
    ${sectionFiles.map((f) => `<itemref idref="${f.id}"/>`).join('\n    ')}
  </spine>
</package>`
    )

    return zip.generateAsync({ type: 'nodebuffer' })
  }
}

function headingLevelOf(level: number | undefined): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (level === 2) return HeadingLevel.HEADING_2
  if (level === 3) return HeadingLevel.HEADING_3
  return HeadingLevel.HEADING_1
}
