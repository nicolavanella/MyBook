import { describe, it, expect } from 'vitest'
import { findEntityTagOccurrences, countAllEntityTags, findAllEntityTagOccurrences } from '@shared/entityTagScan'

function doc(content: any[]): string {
  return JSON.stringify({ type: 'doc', content })
}
function text(t: string, marks?: any[]) {
  return marks ? { type: 'text', text: t, marks } : { type: 'text', text: t }
}
function tag(entityType: string, entityId: string) {
  return { type: 'entityTag', attrs: { entityType, entityId } }
}
function paragraph(...content: any[]) {
  return { type: 'paragraph', content }
}

describe('findEntityTagOccurrences', () => {
  it('nessuna occorrenza per contenuto assente o non valido', () => {
    expect(findEntityTagOccurrences('', 'character', 'c1')).toEqual([])
    expect(findEntityTagOccurrences(null, 'character', 'c1')).toEqual([])
    expect(findEntityTagOccurrences('non è json', 'character', 'c1')).toEqual([])
  })

  it('trova una singola occorrenza con lo snippet corretto', () => {
    const content = doc([paragraph(text('Ciao '), text('Marco', [tag('character', 'c1')]), text(', come stai?'))])
    const result = findEntityTagOccurrences(content, 'character', 'c1')
    expect(result).toEqual([{ occurrenceIndex: 0, snippet: 'Marco' }])
  })

  it('due tag diversi nello stesso paragrafo restano occorrenze separate', () => {
    const content = doc([
      paragraph(text('Incontro tra '), text('Marco', [tag('character', 'c1')]), text(' e '), text('Luisa', [tag('character', 'c2')]))
    ])
    expect(findEntityTagOccurrences(content, 'character', 'c1')).toEqual([{ occurrenceIndex: 0, snippet: 'Marco' }])
    expect(findEntityTagOccurrences(content, 'character', 'c2')).toEqual([{ occurrenceIndex: 0, snippet: 'Luisa' }])
  })

  it('unisce nodi di testo adiacenti con lo stesso tag (es. una parola in grassetto nel mezzo)', () => {
    const content = doc([
      paragraph(
        text('il ', [tag('location', 'l1')]),
        text('Castello', [tag('location', 'l1'), { type: 'bold' }]),
        text(' Nero', [tag('location', 'l1')])
      )
    ])
    expect(findEntityTagOccurrences(content, 'location', 'l1')).toEqual([{ occurrenceIndex: 0, snippet: 'il Castello Nero' }])
  })

  it("l'indice di occorrenza cresce nell'ordine del documento, su più paragrafi", () => {
    const content = doc([
      paragraph(text('Prima frase con '), text('la Spada', [tag('object', 'o1')])),
      paragraph(text('Seconda frase, di nuovo '), text('la Spada', [tag('object', 'o1')]))
    ])
    const result = findEntityTagOccurrences(content, 'object', 'o1')
    expect(result).toEqual([
      { occurrenceIndex: 0, snippet: 'la Spada' },
      { occurrenceIndex: 1, snippet: 'la Spada' }
    ])
  })

  it('non confonde entità dello stesso tipo con id diversi, né tipi diversi con lo stesso id', () => {
    const content = doc([paragraph(text('X', [tag('character', 'id1')]), text('Y', [tag('location', 'id1')]))])
    expect(findEntityTagOccurrences(content, 'character', 'id1')).toEqual([{ occurrenceIndex: 0, snippet: 'X' }])
    expect(findEntityTagOccurrences(content, 'location', 'id1')).toEqual([{ occurrenceIndex: 0, snippet: 'Y' }])
  })

  it('array vuoto se il tag cercato non è presente', () => {
    const content = doc([paragraph(text('Nessun tag qui.'))])
    expect(findEntityTagOccurrences(content, 'character', 'c1')).toEqual([])
  })
})

describe('countAllEntityTags', () => {
  it('conta le occorrenze di ogni tag distinto presente nel documento', () => {
    const content = doc([
      paragraph(
        text('Incontro tra '), text('Marco', [tag('character', 'c1')]), text(' e '), text('Luisa', [tag('character', 'c2')])
      ),
      paragraph(text('Di nuovo '), text('Marco', [tag('character', 'c1')]))
    ])
    const counts = countAllEntityTags(content).sort((a, b) => a.entityId.localeCompare(b.entityId))
    expect(counts).toEqual([
      { entityType: 'character', entityId: 'c1', count: 2 },
      { entityType: 'character', entityId: 'c2', count: 1 }
    ])
  })

  it('un tag spezzato da formattazione mista resta UNA sola occorrenza (coerente con findEntityTagOccurrences)', () => {
    const content = doc([paragraph(text('il ', [tag('location', 'l1')]), text('Castello', [tag('location', 'l1'), { type: 'bold' }]))])
    expect(countAllEntityTags(content)).toEqual([{ entityType: 'location', entityId: 'l1', count: 1 }])
  })

  it('array vuoto per contenuto assente, non valido o senza tag', () => {
    expect(countAllEntityTags('')).toEqual([])
    expect(countAllEntityTags(null)).toEqual([])
    expect(countAllEntityTags(doc([paragraph(text('Nessun tag qui.'))]))).toEqual([])
  })
})

describe('findAllEntityTagOccurrences', () => {
  it('trova tutte le occorrenze di tutte le entità, con occurrenceIndex per-entità', () => {
    const content = doc([
      paragraph(
        text('Incontro tra '), text('Marco', [tag('character', 'c1')]), text(' e '), text('Luisa', [tag('character', 'c2')])
      ),
      paragraph(text('Di nuovo '), text('Marco', [tag('character', 'c1')]))
    ])
    const result = findAllEntityTagOccurrences(content).sort((a, b) => a.entityId.localeCompare(b.entityId) || a.occurrenceIndex - b.occurrenceIndex)
    expect(result).toEqual([
      { entityType: 'character', entityId: 'c1', occurrenceIndex: 0, snippet: 'Marco' },
      { entityType: 'character', entityId: 'c1', occurrenceIndex: 1, snippet: 'Marco' },
      { entityType: 'character', entityId: 'c2', occurrenceIndex: 0, snippet: 'Luisa' }
    ])
  })

  it('array vuoto per contenuto assente, non valido o senza tag', () => {
    expect(findAllEntityTagOccurrences('')).toEqual([])
    expect(findAllEntityTagOccurrences(null)).toEqual([])
    expect(findAllEntityTagOccurrences(doc([paragraph(text('Nessun tag qui.'))]))).toEqual([])
  })
})
