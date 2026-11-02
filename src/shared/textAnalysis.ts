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
export interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
}

/**
 * Estrae ricorsivamente tutto il testo di un nodo TipTap.
 *
 * REGOLA DEI SEPARATORI (v0.4.2 — correzione del conteggio parole):
 *  - i nodi di testo adiacenti dentro lo STESSO blocco si concatenano SENZA
 *    separatore. In TipTap un testo spezzato in più nodi (grassetto, tag di
 *    un personaggio, commento...) è sempre una sola riga continua: "Marco" con
 *    un tag seguito da ", disse" è "Marco, disse", NON "Marco , disse".
 *    Prima della 0.4.2 si univa tutto con uno spazio e ogni cambio di
 *    formattazione a metà parola ("per" + grassetto "ché") o accanto alla
 *    punteggiatura creava una parola in più (la virgola contava come parola);
 *  - i nodi "foglia" che non sono testo (a capo forzato, immagine, linea
 *    orizzontale) valgono uno spazio: separano le parole, non le incollano;
 *  - i blocchi figli di un altro blocco (voci di elenco, citazioni) si
 *    separano con uno spazio, così "fine primo punto" e "inizio secondo"
 *    non si fondono in un'unica parola.
 */
function extractNodeText(node: TiptapNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : ''
  if (!Array.isArray(node.content)) return ' '
  // "Inline": tutti i figli sono testo o foglie senza contenuto → si concatenano.
  const isInlineContainer = node.content.every((child) => child?.type === 'text' || !Array.isArray(child?.content))
  return node.content.map(extractNodeText).join(isInlineContainer ? '' : ' ')
}

/** Paragrafi (blocchi di primo livello) di un documento TipTap GIÀ analizzato, con spazi normalizzati e senza blocchi vuoti. */
function paragraphsOfDoc(doc: TiptapNode | null | undefined): string[] {
  if (!doc || !Array.isArray(doc.content)) return []
  return doc.content.map((node) => extractNodeText(node).replace(/\s+/g, ' ').trim()).filter((text) => text.length > 0)
}

/**
 * Estrae il testo di un contenuto TipTap (salvato come stringa JSON) come
 * elenco di paragrafi: un elemento per ogni blocco di primo livello
 * (paragrafo, titolo, voce di lista...) con testo non vuoto.
 *
 * I blocchi restano separati: serve a contare i paragrafi e a delimitare
 * correttamente le frasi a cavallo tra un blocco e il successivo. Dalla
 * 0.4.2 è l'UNICA fonte del testo: anche il conteggio parole/caratteri
 * (vedi countWordsAndChars) passa da qui, così scheda Statistiche, albero
 * del manoscritto ed editor danno sempre lo stesso numero.
 */
export function extractParagraphs(tiptapJson: string | null | undefined): string[] {
  if (!tiptapJson) return []
  try {
    return paragraphsOfDoc(JSON.parse(tiptapJson))
  } catch {
    return [] // contenuto non ancora valorizzato come TipTap JSON (es. scena appena creata)
  }
}

/**
 * Conteggio parole e caratteri (spazi inclusi) di un contenuto TipTap.
 * Accetta sia la stringa JSON salvata nel database sia il documento già
 * analizzato (es. `editor.getJSON()` nell'editor), per dare feedback
 * immediato mentre si digita con la stessa regola usata dal salvataggio.
 * Parole e caratteri sono calcolati come in analyzeText: paragrafi non vuoti
 * uniti da un solo spazio.
 */
export function countWordsAndChars(source: string | TiptapNode | null | undefined): { words: number; chars: number } {
  let paragraphs: string[]
  if (typeof source === 'string') paragraphs = extractParagraphs(source)
  else paragraphs = paragraphsOfDoc(source)
  const fullText = paragraphs.join(' ')
  return { words: fullText ? fullText.split(/\s+/).length : 0, chars: fullText.length }
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

import type { BookLanguage } from './i18n'

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

/**
 * v0.4.0 — stesso criterio per i libri scritti in inglese (vedi "Lingua del
 * libro" del progetto). Include le contrazioni più comuni nelle due grafie
 * dell'apostrofo (' e ’), perché il tokenizzatore le tiene intere ("don't").
 * Le parole sotto le 4 lettere sono comunque già escluse a monte.
 */
const ENGLISH_STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','else','of','to','in','on','at','by','for','with','about','against',
  'between','into','through','during','before','after','above','below','from','up','down','out','off','over','under',
  'again','further','once','here','there','when','where','why','how','all','any','both','each','few','more','most',
  'other','some','such','nor','not','only','own','same','than','too','very','can','will','just','should','now',
  'i','me','my','myself','we','our','ours','ourselves','you','your','yours','yourself','yourselves','he','him','his',
  'himself','she','her','hers','herself','it','its','itself','they','them','their','theirs','themselves',
  'what','which','who','whom','this','that','these','those','am','is','are','was','were','be','been','being',
  'have','has','had','having','do','does','did','doing','would','could','might','must','shall','may',
  'said','says','say','get','got','went','going','come','came','like','upon','back','even','still','also','ever',
  'never','always','while','because','until','though','although','around','away','without','within','across',
  "don't","don’t","can't","can’t","won't","won’t","isn't","isn’t","wasn't","wasn’t","didn't","didn’t","doesn't","doesn’t",
  "it's","it’s","i'm","i’m","i've","i’ve","i'll","i’ll","i'd","i’d","you're","you’re","you've","you’ve","you'll","you’ll",
  "he's","he’s","she's","she’s","that's","that’s","there's","there’s","what's","what’s","let's","let’s","they're","they’re",
  "we're","we’re","couldn't","couldn’t","wouldn't","wouldn’t","shouldn't","shouldn’t","haven't","haven’t","hadn't","hadn’t"
])

const STOPWORDS_BY_LANGUAGE: Record<BookLanguage, Set<string>> = {
  it: ITALIAN_STOPWORDS,
  en: ENGLISH_STOPWORDS
}

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
 * `bookLanguage` (v0.4.0) sceglie l'elenco di stopword: di default italiano,
 * come prima della 0.4.0, quindi le chiamate esistenti non cambiano.
 */
export function analyzeText(paragraphs: string[], keywordLimit = 15, bookLanguage: BookLanguage = 'it'): TextAnalysis {
  const nonEmpty = paragraphs.map((p) => p.trim()).filter(Boolean)
  const fullText = nonEmpty.join(' ')

  const words = fullText.trim() ? fullText.trim().split(/\s+/).length : 0
  const charsWithSpaces = fullText.length
  const charsWithoutSpaces = fullText.replace(/\s/g, '').length
  const sentences = countSentences(fullText)

  const stopwords = STOPWORDS_BY_LANGUAGE[bookLanguage] ?? ITALIAN_STOPWORDS
  const tokens = tokenizeWords(fullText).filter((w) => w.length >= 4 && !stopwords.has(w))
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
