import { describe, it, expect } from 'vitest'
import { tiptapToBlocks, blocksToPlainText, blocksToHtml, blocksToMarkdown } from '@main/services/tiptap-convert'

/** Costruisce un documento TipTap minimale con un paragrafo, un'immagine e un separatore di pagina. */
function docWithImageAndPageBreak(): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Prima della pausa' }] },
      { type: 'image', attrs: { src: 'data:image/png;base64,AAAA', alt: 'Una scena' } },
      { type: 'horizontalRule' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Dopo la pausa' }] }
    ]
  })
}

describe('tiptapToBlocks', () => {
  it('produce un blocco "image" con src e alt per un nodo immagine (prima veniva scartato)', () => {
    const blocks = tiptapToBlocks(docWithImageAndPageBreak())
    const image = blocks.find((b) => b.kind === 'image')
    expect(image).toBeDefined()
    expect(image?.src).toBe('data:image/png;base64,AAAA')
    expect(image?.alt).toBe('Una scena')
  })

  it('produce un blocco "pageBreak" per un horizontalRule (prima veniva scartato)', () => {
    const blocks = tiptapToBlocks(docWithImageAndPageBreak())
    expect(blocks.some((b) => b.kind === 'pageBreak')).toBe(true)
  })

  it('mantiene l\'ordine dei blocchi testo/immagine/separatore/testo', () => {
    const blocks = tiptapToBlocks(docWithImageAndPageBreak())
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'image', 'pageBreak', 'paragraph'])
  })

  it('restituisce un array vuoto per JSON non valido, senza lanciare eccezioni', () => {
    expect(tiptapToBlocks('{ non valido')).toEqual([])
  })

  it('legge marks bold/italic/highlight sui text run', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'importante',
              marks: [{ type: 'bold' }, { type: 'highlight', attrs: { color: '#ffff00' } }]
            }
          ]
        }
      ]
    })
    const [block] = tiptapToBlocks(doc)
    expect(block.runs[0].bold).toBe(true)
    expect(block.runs[0].highlight).toBe('#ffff00')
  })
})

describe('blocksToPlainText', () => {
  it('rende un\'immagine come segnaposto testuale con il testo alternativo', () => {
    const text = blocksToPlainText(tiptapToBlocks(docWithImageAndPageBreak()))
    expect(text).toContain('[Immagine: Una scena]')
  })

  it('rende un separatore di pagina come form feed', () => {
    const text = blocksToPlainText(tiptapToBlocks(docWithImageAndPageBreak()))
    expect(text).toContain('\f')
  })
})

describe('blocksToHtml', () => {
  it('rende un\'immagine come tag <img> con src e alt', () => {
    const html = blocksToHtml(tiptapToBlocks(docWithImageAndPageBreak()))
    expect(html).toContain('<img src="data:image/png;base64,AAAA"')
    expect(html).toContain('alt="Una scena"')
  })

  it('rende il separatore di pagina come vera interruzione di pagina CSS', () => {
    const html = blocksToHtml(tiptapToBlocks(docWithImageAndPageBreak()))
    expect(html).toContain('page-break-after: always')
  })

  it('omette il tag <img> se manca il src, senza lanciare eccezioni', () => {
    const blocks = tiptapToBlocks(
      JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { alt: 'senza src' } }] })
    )
    expect(() => blocksToHtml(blocks)).not.toThrow()
    expect(blocksToHtml(blocks)).not.toContain('<img')
  })

  it('applica il colore di sfondo (evidenziazione) come background-color inline', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'testo evidenziato', marks: [{ type: 'highlight', attrs: { color: '#ffcc00' } }] }]
        }
      ]
    })
    const html = blocksToHtml(tiptapToBlocks(doc))
    expect(html).toContain('background-color:#ffcc00')
  })
})

describe('blocksToMarkdown', () => {
  it('rende un\'immagine con la sintassi markdown standard', () => {
    const md = blocksToMarkdown(tiptapToBlocks(docWithImageAndPageBreak()))
    expect(md).toContain('![Una scena](data:image/png;base64,AAAA)')
  })

  it('rende il separatore di pagina come \\pagebreak', () => {
    const md = blocksToMarkdown(tiptapToBlocks(docWithImageAndPageBreak()))
    expect(md).toContain('\\pagebreak')
  })
})
