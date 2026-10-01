import { describe, it, expect } from 'vitest'
import {
  extractParagraphs,
  analyzeText,
  formatReadingTime,
  CHARS_PER_EDITORIAL_PAGE,
  WORDS_PER_PRINT_PAGE
} from '../../src/shared/textAnalysis'

function tiptapDoc(paragraphs: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
  })
}

describe('extractParagraphs', () => {
  it('un paragrafo per blocco di primo livello, ignorando quelli vuoti', () => {
    const json = tiptapDoc(['Primo paragrafo.', '', 'Secondo paragrafo.'])
    expect(extractParagraphs(json)).toEqual(['Primo paragrafo.', 'Secondo paragrafo.'])
  })
  it('ritorna array vuoto per contenuto assente o non valido', () => {
    expect(extractParagraphs('')).toEqual([])
    expect(extractParagraphs(null)).toEqual([])
    expect(extractParagraphs('non è json')).toEqual([])
  })
  it('unisce con uno spazio i nodi di testo dentro lo stesso blocco (es. formattazione mista)', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ciao' }, { type: 'text', text: 'mondo' }] }]
    })
    expect(extractParagraphs(json)).toEqual(['Ciao mondo'])
  })
})

describe('analyzeText', () => {
  it('conta parole, caratteri (con/senza spazi), frasi e paragrafi', () => {
    const result = analyzeText(['Il gatto dorme. La casa è silenziosa!', 'Fuori piove.'])
    expect(result.paragraphs).toBe(2)
    expect(result.sentences).toBe(3)
    expect(result.words).toBe(9)
    const fullText = 'Il gatto dorme. La casa è silenziosa! Fuori piove.'
    expect(result.charsWithSpaces).toBe(fullText.length)
    expect(result.charsWithoutSpaces).toBe(fullText.replace(/\s/g, '').length)
  })

  it('ignora i paragrafi vuoti e non genera falsi paragrafi', () => {
    expect(analyzeText(['', '  ', 'Testo.']).paragraphs).toBe(1)
  })

  it('conta come frase anche testo finale senza punteggiatura', () => {
    expect(analyzeText(['Frase completa. E poi senza punto finale']).sentences).toBe(2)
  })

  it('tutto vuoto: nessun errore, valori a zero', () => {
    const r = analyzeText([])
    expect(r).toMatchObject({ words: 0, charsWithSpaces: 0, charsWithoutSpaces: 0, sentences: 0, paragraphs: 0, readingMinutes: 0, editorialPages: 0, printPages: 0, keywords: [] })
  })

  it('tempo di lettura: almeno 1 minuto se c\'è del testo, arrotondato a 200 parole/minuto', () => {
    expect(analyzeText(['una due tre']).readingMinutes).toBe(1)
    const words400 = new Array(400).fill('parola').join(' ')
    expect(analyzeText([words400]).readingMinutes).toBe(2)
  })

  it('cartelle editoriali: caratteri con spazi / 1800, con un decimale', () => {
    const text = 'a'.repeat(CHARS_PER_EDITORIAL_PAGE / 2)
    expect(analyzeText([text]).editorialPages).toBe(0.5)
  })

  it('pagine di stampa (stima): parole / 300, con un decimale', () => {
    const words = new Array(WORDS_PER_PRINT_PAGE * 2).fill('x').join(' ')
    expect(analyzeText([words]).printPages).toBe(2)
  })

  it('parole chiave: esclude le stopword italiane e le parole molto brevi, ordina per frequenza', () => {
    const text = 'Il castello del castello era enorme e il castello dominava la valle e la valle taceva'
    const result = analyzeText([text])
    expect(result.keywords[0]).toEqual({ word: 'castello', count: 3 })
    expect(result.keywords.map((k) => k.word)).not.toContain('il')
    expect(result.keywords.map((k) => k.word)).not.toContain('la')
  })

  it('parole chiave: rispetta il limite richiesto', () => {
    const text = 'primissima secondissima terzissima quartissima quintissima'
    expect(analyzeText([text], 2).keywords).toHaveLength(2)
  })

  it("è case-insensitive e non tratta maiuscolo/minuscolo come parole diverse", () => {
    const result = analyzeText(['Foresta foresta FORESTA foresta'])
    expect(result.keywords[0]).toEqual({ word: 'foresta', count: 4 })
  })
})

describe('formatReadingTime', () => {
  it('minuti sotto l\'ora', () => expect(formatReadingTime(45)).toBe('45 min'))
  it('ore esatte', () => expect(formatReadingTime(120)).toBe('2 h'))
  it('ore e minuti', () => expect(formatReadingTime(125)).toBe('2 h 5 min'))
  it('zero o negativo: nessun dato', () => {
    expect(formatReadingTime(0)).toBe('—')
    expect(formatReadingTime(-3)).toBe('—')
  })
})
