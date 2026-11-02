import { extractParagraphs } from '@shared/textAnalysis'

/** Estrae il testo semplice da un documento TipTap JSON, per la ricerca e le anteprime dei risultati. */
export function extractPlainText(contentJson: string): string {
  // v0.4.2: estrazione condivisa con conteggio parole e Analisi (shared/textAnalysis.ts).
  return extractParagraphs(contentJson).join(' ')
}

/**
 * Qualche parola di contesto attorno alla prima occorrenza del termine
 * cercato, per l'anteprima sotto ogni risultato di ricerca nell'albero
 * ("Sotto ogni risultato un'anteprima con qualche parola"). Se il termine
 * compare solo nel titolo (non nel testo), mostra semplicemente l'inizio
 * del contenuto come anteprima generica.
 */
export function extractSnippet(contentJson: string, query: string, contextWords = 7): string {
  const text = extractPlainText(contentJson)
  if (!text.trim()) return ''
  const words = text.split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  const charIndex = lower.indexOf(query.toLowerCase())

  if (charIndex === -1) {
    const preview = words.slice(0, contextWords * 2).join(' ')
    return words.length > contextWords * 2 ? `${preview}…` : preview
  }

  let charCount = 0
  let wordIndex = 0
  for (let i = 0; i < words.length; i++) {
    charCount += words[i].length + 1
    if (charCount > charIndex) {
      wordIndex = i
      break
    }
  }
  const start = Math.max(0, wordIndex - contextWords)
  const end = Math.min(words.length, wordIndex + contextWords)
  const snippet = words.slice(start, end).join(' ')
  return `${start > 0 ? '…' : ''}${snippet}${end < words.length ? '…' : ''}`
}
