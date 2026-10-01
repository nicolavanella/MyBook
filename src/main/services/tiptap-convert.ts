/**
 * Converte un documento TipTap JSON in una rappresentazione intermedia
 * indipendente dal formato di output: blocchi (paragrafo/titolo) composti da
 * "run" di testo con la propria formattazione (grassetto, corsivo,
 * sottolineato, barrato, colore, evidenziazione). Ogni formato di export
 * (HTML, Markdown, DOCX, EPUB) consuma questa stessa struttura invece di
 * ripetere la logica di attraversamento del JSON — ed è anche il fix per il
 * bug per cui i file esportati non conservavano la formattazione impostata
 * nell'editor (la vecchia implementazione estraeva solo il testo puro,
 * ignorando `marks`).
 */

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  highlight?: string
}

export interface Block {
  kind: 'paragraph' | 'heading' | 'blockquote' | 'bullet' | 'ordered' | 'image' | 'pageBreak'
  level?: number // per gli heading (1-3)
  align?: 'left' | 'center' | 'right' | 'justify'
  runs: TextRun[]
  /** Solo per kind 'image': sorgente (data URL, vedi media.service.ts) e testo alternativo. */
  src?: string
  alt?: string
}

function extractRuns(node: any): TextRun[] {
  if (!Array.isArray(node.content)) return []
  const runs: TextRun[] = []
  for (const child of node.content) {
    if (child.type === 'hardBreak') { runs.push({ text: '\n' }); continue }
    if (child.type !== 'text') continue
    const run: TextRun = { text: child.text ?? '' }
    for (const mark of child.marks ?? []) {
      if (mark.type === 'bold') run.bold = true
      if (mark.type === 'italic') run.italic = true
      if (mark.type === 'underline') run.underline = true
      if (mark.type === 'strike') run.strike = true
      if (mark.type === 'textStyle' && mark.attrs?.color) run.color = mark.attrs.color
      if (mark.type === 'highlight' && mark.attrs?.color) run.highlight = mark.attrs.color
    }
    runs.push(run)
  }
  return runs
}

export function tiptapToBlocks(json: string): Block[] {
  let doc: any
  try {
    doc = JSON.parse(json)
  } catch {
    return []
  }
  const blocks: Block[] = []
  const walk = (node: any): void => {
    if (!node) return
    if (node.type === 'paragraph') {
      blocks.push({ kind: 'paragraph', align: node.attrs?.textAlign, runs: extractRuns(node) })
    } else if (node.type === 'heading') {
      blocks.push({
        kind: 'heading',
        level: node.attrs?.level ?? 1,
        align: node.attrs?.textAlign,
        runs: extractRuns(node)
      })
    } else if (node.type === 'blockquote') {
      // blockquote in TipTap contiene paragrafi figli: li appiattiamo in un unico blocco citazione
      const runs: TextRun[] = []
      for (const child of node.content ?? []) runs.push(...extractRuns(child))
      blocks.push({ kind: 'blockquote', runs })
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const kind = node.type === 'bulletList' ? 'bullet' : 'ordered'
      for (const item of node.content ?? []) {
        for (const child of item.content ?? []) {
          if (child.type === 'paragraph') blocks.push({ kind, runs: extractRuns(child) })
        }
      }
    } else if (node.type === 'image') {
      // Nodo immagine inserito da SceneEditor (vedi editorExtensions.ts): src
      // è un data: URL prodotto da MediaService.readAsDataUrl. Prima di
      // questo fix veniva ignorato (non rientrava in nessun ramo dello switch
      // sopra), quindi le immagini scomparivano silenziosamente da ogni
      // formato di export.
      blocks.push({ kind: 'image', runs: [], src: node.attrs?.src, alt: node.attrs?.alt })
    } else if (node.type === 'horizontalRule') {
      // "Separatore di pagina" della toolbar (vedi EditorToolbar.tsx, bottone
      // FileMinus): stesso discorso delle immagini, prima andava perso.
      blocks.push({ kind: 'pageBreak', runs: [] })
    } else if (Array.isArray(node.content)) {
      node.content.forEach(walk)
    }
  }
  walk(doc)
  return blocks
}

/** Solo il testo, senza formattazione — usato per .txt e per i conteggi. */
export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      // Il testo semplice non può contenere un'immagine: la segnaliamo con
      // un segnaposto testuale invece di ometterla silenziosamente.
      if (b.kind === 'image') return `[Immagine${b.alt ? `: ${b.alt}` : ''}]`
      // Nessun concetto di "pagina" in un file .txt: il carattere form feed
      // (\f) è la convenzione più diffusa per marcare un'interruzione di
      // pagina in testo semplice ed è riconosciuto da molti editor/stampanti.
      if (b.kind === 'pageBreak') return '\f'
      return b.runs.map((r) => r.text).join('')
    })
    .join('\n')
}

/** HTML con marks preservati — usato per l'export HTML e come base per l'EPUB. */
export function blocksToHtml(blocks: Block[]): string {
  const runToHtml = (r: TextRun): string => {
    let text = r.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    if (r.bold) text = `<strong>${text}</strong>`
    if (r.italic) text = `<em>${text}</em>`
    if (r.underline) text = `<u>${text}</u>`
    if (r.strike) text = `<s>${text}</s>`
    const styles: string[] = []
    if (r.color) styles.push(`color:${r.color}`)
    if (r.highlight) styles.push(`background-color:${r.highlight}`)
    if (styles.length) text = `<span style="${styles.join(';')}">${text}</span>`
    return text
  }
  const blockToHtml = (b: Block): string => {
    if (b.kind === 'image') {
      if (!b.src) return ''
      const alt = (b.alt ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      return `<p style="text-align:center"><img src="${b.src}" alt="${alt}" style="max-width:100%;height:auto;" /></p>`
    }
    if (b.kind === 'pageBreak') {
      // page-break-after è lo standard CSS storico (supportato dal motore di
      // stampa di Chromium usato per l'export PDF — vedi export.ipc.ts,
      // printToPDF); break-after è l'equivalente moderno, aggiunto per
      // compatibilità con altri visualizzatori HTML/EPUB.
      return '<div style="page-break-after: always; break-after: page;"></div>'
    }
    const inner = b.runs.map(runToHtml).join('')
    const alignStyle = b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : ''
    switch (b.kind) {
      case 'heading':
        return `<h${b.level ?? 1}${alignStyle}>${inner}</h${b.level ?? 1}>`
      case 'blockquote':
        return `<blockquote>${inner}</blockquote>`
      case 'bullet':
        return `<li>${inner}</li>` // raggruppate in <ul> dal chiamante se serve; qui semplice
      case 'ordered':
        return `<li>${inner}</li>`
      default:
        return `<p${alignStyle}>${inner}</p>`
    }
  }
  return blocks.map(blockToHtml).join('\n')
}

/** Markdown con marks preservati (**bold**, *italic*, ~~strike~~). */
export function blocksToMarkdown(blocks: Block[]): string {
  const runToMd = (r: TextRun): string => {
    let text = r.text
    if (r.bold) text = `**${text}**`
    if (r.italic) text = `*${text}*`
    if (r.strike) text = `~~${text}~~`
    // Markdown non ha una sintassi nativa per sottolineato/colore: nessuna perdita
    // "silenziosa" qui, sono semplicemente concetti che il formato non supporta.
    return text
  }
  return blocks
    .map((b) => {
      // Il markdown "puro" non ha una sintassi nativa per l'interruzione di
      // pagina: \pagebreak è la convenzione riconosciuta da Pandoc e da molti
      // convertitori markdown->PDF, quindi la preferiamo a un semplice
      // separatore visivo (che si confonderebbe con il separatore di scena
      // "***" già usato altrove nell'export — vedi ExportPage.tsx).
      if (b.kind === 'pageBreak') return '\\pagebreak'
      if (b.kind === 'image') return b.src ? `![${b.alt ?? ''}](${b.src})` : ''
      const inner = b.runs.map(runToMd).join('')
      if (b.kind === 'heading') return `${'#'.repeat(b.level ?? 1)} ${inner}`
      if (b.kind === 'blockquote') return `> ${inner}`
      if (b.kind === 'bullet') return `- ${inner}`
      if (b.kind === 'ordered') return `1. ${inner}`
      return inner
    })
    .join('\n\n')
}
