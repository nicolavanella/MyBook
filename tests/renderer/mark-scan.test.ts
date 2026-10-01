import { describe, it, expect } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { findMarkOccurrences, findMarkRanges, removeMarkOccurrences } from '@renderer/features/editor/markScan'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    text: { group: 'inline' }
  },
  marks: {
    comment: { attrs: { commentId: {} }, toDOM: () => ['span', 0], parseDOM: [{ tag: 'span' }] },
    entityTag: { attrs: { entityType: {}, entityId: {} }, toDOM: () => ['span', 0], parseDOM: [{ tag: 'span' }] }
  }
})

function textWithMark(text: string, markName: string, attrs: Record<string, any>) {
  return schema.text(text, [schema.marks[markName].create(attrs)])
}

describe('findMarkOccurrences', () => {
  it('trova una singola occorrenza di un mark', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('prima '),
        textWithMark('parola commentata', 'comment', { commentId: 'c1' }),
        schema.text(' dopo')
      ])
    ])
    const found = findMarkOccurrences(doc, 'comment')
    expect(found).toHaveLength(1)
    expect(found[0].attrs.commentId).toBe('c1')
  })

  it('ordina le occorrenze per posizione nel testo, non per ordine di creazione', () => {
    // Costruito apposta con il mark "b" (che comparirà per primo nel testo) creato per ultimo nell'array.
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        textWithMark('primo nel testo', 'comment', { commentId: 'b' }),
        schema.text(' separatore '),
        textWithMark('secondo nel testo', 'comment', { commentId: 'a' })
      ])
    ])
    const found = findMarkOccurrences(doc, 'comment')
    expect(found.map((o) => o.attrs.commentId)).toEqual(['b', 'a'])
  })

  it('unisce occorrenze consecutive dello stesso mark (stesso testo, formattazione mista)', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        textWithMark('parte uno', 'comment', { commentId: 'c1' }),
        textWithMark(' parte due', 'comment', { commentId: 'c1' })
      ])
    ])
    const found = findMarkOccurrences(doc, 'comment')
    expect(found).toHaveLength(1)
    expect(found[0].to - found[0].from).toBeGreaterThan('parte uno'.length)
  })

  it('non unisce occorrenze dello stesso mark separate da testo non marcato', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        textWithMark('primo', 'comment', { commentId: 'c1' }),
        schema.text(' non commentato '),
        textWithMark('secondo', 'comment', { commentId: 'c1' })
      ])
    ])
    const found = findMarkOccurrences(doc, 'comment')
    expect(found).toHaveLength(2)
  })

  it('trova occorrenze di tag con attributi diversi (entityType/entityId)', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        textWithMark('Aria', 'entityTag', { entityType: 'character', entityId: '1' }),
        schema.text(' visita '),
        textWithMark('la Torre Nera', 'entityTag', { entityType: 'location', entityId: '2' })
      ])
    ])
    const found = findMarkOccurrences(doc, 'entityTag')
    expect(found).toHaveLength(2)
    expect(found[0].attrs.entityType).toBe('character')
    expect(found[1].attrs.entityType).toBe('location')
  })

  it('ritorna un array vuoto se il mark non è presente nel documento', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('nessuna annotazione qui')])])
    expect(findMarkOccurrences(doc, 'comment')).toEqual([])
  })

  it('le posizioni from/to permettono di risalire al testo taggato con doc.textBetween', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Ecco '),
        textWithMark('Aria', 'entityTag', { entityType: 'character', entityId: '1' }),
        schema.text(' che parla.')
      ])
    ])
    const [occurrence] = findMarkOccurrences(doc, 'entityTag')
    expect(doc.textBetween(occurrence.from, occurrence.to)).toBe('Aria')
  })
})

describe('rimozione di un commento (fix v0.3.4: sottolineatura residua)', () => {
  // Commento "c1" spezzato su 3 nodi di testo da formattazione mista (grassetto al centro).
  const schemaBold = new Schema({
    nodes: schema.spec.nodes,
    marks: schema.spec.marks.addToEnd('bold', { toDOM: () => ['strong', 0], parseDOM: [{ tag: 'strong' }] })
  })
  const c = (id: string) => schemaBold.marks.comment.create({ commentId: id })
  const bold = schemaBold.marks.bold.create()
  const doc = schemaBold.node('doc', null, [
    schemaBold.node('paragraph', null, [
      schemaBold.text('inizio ', [c('c1')]),
      schemaBold.text('centro', [c('c1'), bold]),
      schemaBold.text(' fine', [c('c1')]),
      schemaBold.text(' e altro ', []),
      schemaBold.text('altro commento', [c('c2')])
    ])
  ])

  it('findMarkRanges trova solo gli intervalli del commento richiesto', () => {
    expect(findMarkRanges(doc, 'comment', { commentId: 'c1' })).toHaveLength(1)
    expect(findMarkRanges(doc, 'comment', { commentId: 'c2' })).toHaveLength(1)
    expect(findMarkRanges(doc, 'comment', { commentId: 'nessuno' })).toEqual([])
  })

  it('rimuove il mark da TUTTI i nodi di testo del commento, lasciando intatti testo, grassetto e altri commenti', () => {
    const tr = EditorState.create({ doc }).tr
    const removed = removeMarkOccurrences(tr, schemaBold.marks.comment, { commentId: 'c1' })
    expect(removed).toBe(1)
    const after = tr.doc
    // nessun residuo del commento c1
    expect(findMarkRanges(after, 'comment', { commentId: 'c1' })).toEqual([])
    // il testo non è cambiato
    expect(after.textContent).toBe(doc.textContent)
    // il grassetto è rimasto
    let boldText = ''
    after.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'bold')) boldText += n.text
    })
    expect(boldText).toBe('centro')
    // l'altro commento è intatto
    expect(findMarkRanges(after, 'comment', { commentId: 'c2' })).toHaveLength(1)
  })

  it('ritorna 0 e non modifica nulla se il commento non è nel testo', () => {
    const tr = EditorState.create({ doc }).tr
    expect(removeMarkOccurrences(tr, schemaBold.marks.comment, { commentId: 'assente' })).toBe(0)
    expect(tr.docChanged).toBe(false)
  })
})
