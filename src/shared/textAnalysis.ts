/**
 * Analisi testuale per la scheda Statistiche > Analisi (v0.3.5).
 *
 * Modulo puro (nessuna dipendenza da Electron o dal database): riceve testo
 * già estratto dal contenuto TipTap e restituisce i conteggi. Tenerlo puro
 * lo rende testabile senza un database SQLite di prova.
 *
 * CONVENZIONI EDITORIALI ADOTTATE (nessuno standard è unico in editoria,
 * quindi vanno dichiarate):
 *  - "Cartella editoriale" = 1800 caratteri spazi inclusi (30 righe x 60
 *    battute), la convenzione più diffusa in Italia per i manoscritti.
 *  - "Pagina di stampa (stima)" = 300 parole, una stima diffusa per un libro
 *    in formato tascabile con interlinea singola.
 *  - Velocità di lettura = 200 parole al minuto (media per un adulto che
 *    legge narrativa in italiano).
 * Questi tre valori sono costanti nominate qui sotto: se in futuro devono
 * diventare configurabili, è il punto giusto da cui partire.
 */

export const CHARS_PER_EDITORIAL_PAGE = 1800
export const WORDS_PER_PRINT_PAGE = 300
export const READING_WORDS_PER_MINUTE = 200

/** Un blocco di primo livello del documento TipTap (paragrafo, titolo, voce di elenco...). */
interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
}

/** Estrae ricorsivamente tutto il testo di un nodo TipTap (senza separatori tra i figli: li aggiunge il chiamante). */
function extractNodeText(node: TiptapNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  if (!Array.isArray(node.content)) return ''
  // Spazio tra i figli: due nodi di testo adiacenti in un paragrafo semplice
  // sono normalmente già separati da un nodo di testo con lo spazio incluso,
  // ma l'unione esplicita evita parole "incollate" nei casi limite (es. un
  // nodo immagine tra due frasi).
  return node.content.map(extractNodeText).join(' ')
}

/**
 * Estrae il testo di un contenuto TipTap (salvato come stringa JSON) come
 * elenco di paragrafi: un elemento per ogni blocco di primo livello
 * (paragrafo, titolo, voce di lista...) con testo non vuoto.
 *
 * A differenza di document.service.ts::extractPlainText (che unisce tutto
 * con uno spazio, per il conteggio parole "storico"), qui i blocchi restano
 * separati: serve a contare i paragrafi e a delimitare correttamente le frasi
 * a cavallo tra un blocco e il successivo.
 */
export function extractParagraphs(tiptapJson: string | null | undefined): string[] {
  if (!tiptapJson) return []
  let doc: TiptapNode
  try {
    doc = JSON.parse(tiptapJson)
  } catch {
    return [] // contenuto non ancora valorizzato come TipTap JSON (es. scena appena creata)
  }
  if (!Array.isArray(doc.content)) return []
  return doc.content.map((node) => extractNodeText(node).replace(/\s+/g, ' ').trim()).filter((text) => text.length > 0)
}

export interface TextAnalysis {
  words: number
  charsWithSpaces: number
  charsWithoutSpaces: number
  sentences: number
  paragraphs: number
  readingMinutes: number
  editorialPages: number
  printPages: number
  keywords: { word: string; count: number }[]
}

/** Parole italiane troppo comuni per essere "parole chiave" significative. Elenco non esaustivo, di uso pratico. */
const ITALIAN_STOPWORDS = new Set([
  'il','lo','la','i','gli','le','un','uno','una','di','del','dello','della','dei','degli','delle',
  'a','ad','al','allo','alla','ai','agli','alle','da','dal','dallo','dalla','dai','dagli','dalle',
  'in','nel','nello','nella','nei','negli','nelle','con','col','coi','su','sul','sullo','sulla','sui','sugli','sulle',
  'per','tra','fra','e','ed','o','od','ma','se','che','chi','cui','non','ne','ci','vi','si','mi','ti',
  'io','tu','lui','lei','noi','voi','loro','mio','mia','miei','mie','tuo','tua','tuoi','tue',
  'suo','sua','suoi','sue','nostro','nostra','nostri','nostre','vostro','vostra','vostri','vostre',
  'questo','questa','questi','queste','quello','quella','quelli','quelle','quale','quali','quanto','quanta',
  'come','dove','quando','perché','perche','più','meno','molto','molta','molti','molte','poco','poca','pochi','poche',
  'anche','ancora','già','sempre','mai','solo','solo','così','cosi','tutto','tutta','tutti','tutte',
  'essere','sono','sei','è','siamo','siete','erano','era','ero','stato','stata','stati','state',
  'avere','ho','hai','ha','abbiamo','avete','hanno','aveva','avevo','avevano',
  'fare','faceva','fece','fatto','fatta','disse','dice','dire','c’è', 'c\'è', 'un\'', 'dell\'', 'all\''
])

/** true se il carattere può far parte di una "parola" (lettere Unicode, incluse le accentate italiane, e l'apostrofo). */
function tokenizeWords(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)?/gu)
  return matches ?? []
}

/**
 * Divide il testo in frasi. Euristica semplice (non un parser linguistico):
 * ogni sequenza terminata da uno o più `. ! ? …` è una frase; l'eventuale
 * testo residuo senza terminatore finale conta come un'altra frase (l'utente
 * potrebbe non aver ancora messo il punto sull'ultima frase scritta).
 * Non gestisce le abbreviazioni ("Sig.", "ecc.") che a rigore non terminano
 * una frase: per un conteggio editoriale indicativo l'approssimazione è
 * accettabile e va preferita a un parser complesso e comunque imperfetto.
 */
function countSentences(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const matches = trimmed.match(/[^.!?…]+[.!?…]+/g) ?? []
  const consumedLength = matches.join('').length
  const remainder = trimmed.slice(consumedLength).trim()
  return matches.length + (remainder ? 1 : 0)
}

/**
 * Analizza un elenco di paragrafi (vedi extractParagraphs) e ne calcola le
 * statistiche testuali. `keywordLimit` è il numero massimo di parole chiave
 * restituite (le più frequenti, a parità di frequenza nell'ordine di prima
 * apparizione grazie alla stabilità di Array.prototype.sort).
 */
export function analyzeText(paragraphs: string[], keywordLimit = 15): TextAnalysis {
  const nonEmpty = paragraphs.map((p) => p.trim()).filter(Boolean)
  const fullText = nonEmpty.join(' ')

  const words = fullText.trim() ? fullText.trim().split(/\s+/).length : 0
  const charsWithSpaces = fullText.length
  const charsWithoutSpaces = fullText.replace(/\s/g, '').length
  const sentences = countSentences(fullText)

  const tokens = tokenizeWords(fullText).filter((w) => w.length >= 4 && !ITALIAN_STOPWORDS.has(w))
  const frequency = new Map<string, number>()
  for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1)
  const keywords = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, keywordLimit)
    .map(([word, count]) => ({ word, count }))

  return {
    words,
    charsWithSpaces,
    charsWithoutSpaces,
    sentences,
    paragraphs: nonEmpty.length,
    readingMinutes: words > 0 ? Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE)) : 0,
    editorialPages: Math.round((charsWithSpaces / CHARS_PER_EDITORIAL_PAGE) * 10) / 10,
    printPages: Math.round((words / WORDS_PER_PRINT_PAGE) * 10) / 10,
    keywords
  }
}

/** Formatta i minuti di lettura come "X min" o "Xh Ym" oltre l'ora. */
export function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
