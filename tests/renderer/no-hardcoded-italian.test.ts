import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Anti-regressione della localizzazione (v0.4.0).
 *
 * Il type-check garantisce che ogni chiave `t('…')` esista, ma non può sapere
 * se qualcuno scrive di nuovo un testo italiano direttamente nel codice
 * (`<button>Salva</button>`, `title="Elimina"`). Questo test scansiona i
 * sorgenti di interfaccia (renderer e main) e fallisce se trova, fuori dai
 * commenti, una stringa o un testo JSX che contiene un carattere accentato
 * italiano o una parola tipicamente italiana.
 *
 * È un'euristica, non una prova: una frase italiana fatta solo di parole
 * assenti dall'elenco sotto passerebbe. Quando capita, basta aggiungere la
 * parola all'elenco. Falsi positivi: si risolvono spostando il testo nel
 * dizionario, oppure — se è davvero un dato e non un testo — aggiungendolo a ALLOWED.
 */

const SRC = path.join(__dirname, '../../src')
const SCANNED_DIRS = ['renderer', 'main']

/** Parole italiane che non sono anche parole inglesi comuni (per limitare i falsi positivi). */
const MARKERS = [
  'della',
  'delle',
  'degli',
  'dello',
  'nella',
  'nelle',
  'nello',
  'sono',
  'più',
  'questo',
  'questa',
  'questi',
  'queste',
  'nessun',
  'nessuna',
  'scena',
  'capitolo',
  'capitoli',
  'personaggio',
  'personaggi',
  'località',
  'oggetto',
  'oggetti',
  'salva',
  'salvato',
  'annulla',
  'elimina',
  'eliminare',
  'nuovo',
  'nuova',
  'aggiungi',
  'modifica',
  'crea',
  'cerca',
  'apri',
  'chiudi',
  'mostra',
  'nascondi',
  'esporta',
  'importa',
  'ripristina',
  'errore',
  'impossibile',
  'conferma',
  'seleziona',
  'titolo',
  'descrizione',
  'parole',
  'caratteri',
  'gruppo',
  'progetto',
  'progetti',
  'una',
  'uno',
  'che',
  'con',
  'non',
  'per',
  'alla',
  'dalla',
  'sul',
  'sulla',
  'tutti',
  'tutto',
  'già',
  'perché',
  'può',
  'dopo',
  'prima',
  'ancora',
  'nome',
  'valido',
  'valida',
  'trovato',
  'trovata',
  'rinomina',
  'espandi',
  'comprimi',
  'trascina',
  'blocca',
  'sblocca',
  'scegli',
  'vai',
  'rimuovi',
  'riprova',
  'caricamento',
  'aggiorna',
  'disattivato',
  'attivo',
  'attivi',
  'scheda',
  'schede',
  'impostazioni',
  'manoscritto',
  'lingua',
  'libro',
  'sfondo',
  'testo',
  'colore',
  'dimensione',
  'stato',
  'mappa',
  'nodo',
  'nodi',
  'collegamento',
  'registro',
  'operazione',
  'operazioni',
  'quando',
  'tipo',
  'giorni',
  'giorno',
  'totale',
  'totali',
  'vuoto',
  'vuota',
  'vuote',
  'tabella',
  'tabelle',
  'cartella',
  'ricerca',
  'risultato',
  'risultati',
  'sostituisci',
  'sostituite',
  'trova',
  'successivo',
  'precedente',
  'maiuscole',
  'minuscole',
  'intere',
  'finito',
  'bozza',
  'revisione',
  'commento',
  'commenti',
  'dettagli',
  'salta',
  'bentornato',
  'prossima',
  'volta',
  'facoltativo',
  'chiudere',
  'esportazione',
  'esportato',
  'formato',
  'separatore',
  'niente',
  'parti',
  'selezionare',
  'deseleziona',
  'avanzate',
  'strumenti',
  'aspetto',
  'tema',
  'scuro',
  'chiaro',
  'piccolo',
  'medio',
  'grande',
  'riavviata',
  'svuota',
  'completo',
  'carica',
  'sostituisce',
  'verranno',
  'verrà',
  'devi',
  'puoi',
  'vuoi',
  'hai',
  'ogni',
  'oppure',
  'anche',
  'molto',
  'poco',
  'alcuni',
  'nessuno',
  'altro',
  'altra',
  'altri',
  'quale',
  'quali',
  'dove',
  'cosa',
  'quanto'
]
const MARKER_RX = new RegExp(`\\b(?:${MARKERS.join('|')})\\b|[àèéìòù]`, 'i')

/** Letterali che SONO dati, non testo mostrato: valori enumerati salvati nel database e chiavi i18n. */
const ALLOWED_LITERALS = new Set([
  'completo', 'bozza', 'revisione', 'status.completo', 'status.bozza', 'status.revisione',
  'bozza: number', 'revisione: number', 'completo: number',
  // Valore predefinito del parametro di groupEntities: la UI passa sempre l'etichetta tradotta.
  'Senza gruppo'
])

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Toglie commenti di blocco e di riga (mantenendo i ritorni a capo, per i numeri di riga). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

const STRING_RX = /(['"`])((?:\\.|(?!\1).)*?)\1/g
const JSX_INLINE_RX = />([^<>{}]*[A-Za-zàèéìòù]{3,}[^<>{}]*)</g
const JSX_LINE_RX = /^\s*([^<>{}=;()[\]]*[A-Za-zàèéìòù]{3,}[^<>{}=;()[\]]*)$/
const CODE_START_RX = /^\s*(return|const|let|var|if|else|case|break|export|function|await|void|throw|default|import)\b/

function findHardcodedItalian(file: string): string[] {
  const code = stripComments(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
  const hits: string[] = []
  code.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    // Le righe di diagnostica per gli sviluppatori (console.*) e le dichiarazioni di tipo non sono interfaccia.
    if (!trimmed || line.includes('console.') || /^(import |export type |type |interface )/.test(trimmed)) return
    const candidates: string[] = []
    for (const m of line.matchAll(STRING_RX)) candidates.push(m[2])
    // Le firme di funzione con generici (`foo<T>(…): Bar<T>`) hanno `>…<` ma non sono JSX.
    if (!CODE_START_RX.test(line)) for (const m of line.matchAll(JSX_INLINE_RX)) candidates.push(m[1])
    // Riga di solo testo JSX (es. "   Aggiungi scena"). Si escludono le righe che sembrano codice: con apici
    // (le stringhe sono già analizzate sopra), unioni di tipo `|` o virgola finale (proprietà d'oggetto).
    const jsxLine = JSX_LINE_RX.exec(line)
    if (jsxLine && !CODE_START_RX.test(line) && !/['"|]/.test(line) && !trimmed.endsWith(',')) candidates.push(jsxLine[1])
    const bad = candidates.map((c) => c.trim()).find((c) => !ALLOWED_LITERALS.has(c) && MARKER_RX.test(c))
    if (bad) hits.push(`${path.relative(SRC, file)}:${index + 1}: ${bad.slice(0, 100)}`)
  })
  return hits
}

describe('nessun testo italiano cablato nell\'interfaccia', () => {
  it('renderer e main non contengono stringhe italiane fuori dal dizionario', () => {
    const hits = SCANNED_DIRS.flatMap((d) => sourceFiles(path.join(SRC, d))).flatMap(findHardcodedItalian)
    expect(hits).toEqual([])
  })

  it('il rilevatore funziona: riconosce un testo italiano cablato (controllo sul controllo)', () => {
    const tmp = path.join(require('node:os').tmpdir(), `hc-${Date.now()}.tsx`)
    fs.writeFileSync(tmp, 'export const A = () => <button title="Elimina il capitolo">Salva</button>\n')
    try {
      expect(findHardcodedItalian(tmp).length).toBeGreaterThan(0)
    } finally {
      fs.unlinkSync(tmp)
    }
  })

  it('il rilevatore ignora commenti, chiavi i18n e testo inglese', () => {
    const tmp = path.join(require('node:os').tmpdir(), `hc-ok-${Date.now()}.tsx`)
    fs.writeFileSync(
      tmp,
      [
        '// Questo commento è in italiano e va bene',
        '/* anche questo: è un commento di blocco */',
        "export const A = () => <button title={t('common.save')}>{t('common.cancel')}</button>",
        "export const B = 'Save the document'",
        ''
      ].join('\n')
    )
    try {
      expect(findHardcodedItalian(tmp)).toEqual([])
    } finally {
      fs.unlinkSync(tmp)
    }
  })
})
