import { describe, it, expect } from 'vitest'
import { extractPlainText, extractSnippet } from '@renderer/features/chapters/textSnippet'

function doc(text: string): string {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
}

describe('extractPlainText', () => {
  it('concatena il testo di tutti i nodi text del documento', () => {
    expect(extractPlainText(doc('Il vento soffiava forte sulla scogliera'))).toBe('Il vento soffiava forte sulla scogliera')
  })

  it('ritorna una stringa vuota per JSON non valido, senza lanciare eccezioni', () => {
    expect(extractPlainText('{ non valido')).toBe('')
  })
})

describe('extractSnippet', () => {
  it('include qualche parola di contesto attorno al termine cercato', () => {
    const content = doc('Il vecchio faro illuminava la baia ogni notte da decenni, guidando i pescatori')
    const snippet = extractSnippet(content, 'baia', 2)
    expect(snippet).toContain('baia')
    expect(snippet).toContain('illuminava')
    expect(snippet).toContain('ogni')
  })

  it('se il termine non è nel testo (solo nel titolo), mostra l\'inizio del contenuto come anteprima generica', () => {
    const content = doc('Questo è l\'inizio del capitolo, prima di ogni possibile occorrenza cercata altrove')
    const snippet = extractSnippet(content, 'paroleintrovabili', 3)
    expect(snippet.startsWith('Questo è l\'inizio')).toBe(true)
  })

  it('ritorna una stringa vuota per un nodo senza contenuto testuale', () => {
    expect(extractSnippet(JSON.stringify({ type: 'doc', content: [] }), 'qualsiasi')).toBe('')
  })

  it('la ricerca del termine è case-insensitive', () => {
    const content = doc('La Torre Nera si stagliava contro il cielo grigio')
    const snippet = extractSnippet(content, 'torre nera', 2)
    expect(snippet.toLowerCase()).toContain('torre nera')
  })
})
