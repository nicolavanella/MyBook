/**
 * MyBook — adattatore fra il motore di ricerca (shared/textSearch.ts) e il
 * documento ProseMirror dell'editor (v0.4.0).
 *
 * Struttura:
 *  - funzioni PURE su `EditorState` che restituiscono una `Transaction` (o
 *    null): non dipendono da TipTap né da React, quindi si testano con un
 *    documento ProseMirror vero (tests/renderer/search-extension.test.ts);
 *  - un plugin che conserva query/opzioni/occorrenze nello stato dell'editor
 *    e le disegna come decorazioni (evidenziazione di TUTTE le occorrenze,
 *    con una classe in più per quella corrente);
 *  - un'estensione TipTap sottile che registra il plugin.
 *
 * Lo stato di ricerca vive nel plugin (non in React) perché le occorrenze
 * vanno ricalcolate a ogni modifica del documento: farlo qui, dentro
 * `apply`, garantisce che evidenziazione e contatore non siano mai sfasati
 * rispetto al testo.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  LEAF_PLACEHOLDER,
  findInText,
  indexOfSelection,
  pickMatchIndex,
  type SearchOptions,
  type TextRange
} from '@shared/textSearch'

export interface SearchState {
  query: string
  options: SearchOptions
  /** Occorrenze, come posizioni nel documento (non indici di stringa). */
  matches: TextRange[]
}

const DEFAULT_OPTIONS: SearchOptions = { caseSensitive: false, wholeWord: false }

export const searchPluginKey = new PluginKey<SearchState>('mybookSearch')

/**
 * Tutte le occorrenze nel documento, come intervalli di posizioni.
 *
 * La ricerca avviene sul testo CONTINUO di ogni blocco di testo (paragrafo,
 * titolo…), non nodo per nodo: così una parola spezzata da un cambio di
 * formattazione viene trovata. La mappatura indice→posizione è lineare
 * perché ogni carattere vale 1 posizione e ogni nodo inline non testuale
 * (a capo forzato) vale 1 posizione ed è rappresentato da 1 segnaposto.
 */
export function collectMatches(doc: ProseMirrorNode, query: string, options: SearchOptions): TextRange[] {
  const result: TextRange[] = []
  if (query === '') return result
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true // scende nei contenitori (liste, citazioni)
    const text = node.textBetween(0, node.content.size, undefined, LEAF_PLACEHOLDER)
    // pos è l'inizio del nodo; il suo contenuto comincia una posizione dopo.
    for (const r of findInText(text, query, options)) {
      result.push({ from: pos + 1 + r.from, to: pos + 1 + r.to })
    }
    return false
  })
  return result
}

/** Transazione che imposta query e opzioni (senza toccare il documento né la cronologia di Annulla). */
export function setSearchTransaction(state: EditorState, query: string, options: SearchOptions): Transaction {
  return state.tr.setMeta(searchPluginKey, { query, options }).setMeta('addToHistory', false)
}

export function getSearchState(state: EditorState): SearchState {
  return searchPluginKey.getState(state) ?? { query: '', options: DEFAULT_OPTIONS, matches: [] }
}

/**
 * Seleziona l'occorrenza successiva/precedente rispetto al cursore (con giro
 * completo). Non sposta il focus: chi digita nel campo "Trova" continua a
 * poterlo fare, e l'occorrenza corrente resta visibile grazie alla decorazione.
 */
export function goToMatchTransaction(state: EditorState, direction: 'next' | 'prev'): Transaction | null {
  const { matches } = getSearchState(state)
  const { from, to } = state.selection
  const index = pickMatchIndex(matches, direction === 'next' ? to : from, direction)
  if (index === -1) return null
  const match = matches[index]
  return state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView()
}

/** Indice dell'occorrenza coincidente con la selezione (per "3 di 12"), o -1. */
export function currentMatchIndex(state: EditorState): number {
  const { matches } = getSearchState(state)
  return indexOfSelection(matches, state.selection.from, state.selection.to)
}

/**
 * Inserisce `replacement` al posto di [from, to) conservando la formattazione
 * del primo carattere sostituito — compresi tag di entità e commenti: se si
 * rinomina "Marco" in "Marcello", il tag del personaggio non deve sparire.
 * Una sostituzione vuota è una semplice cancellazione (ProseMirror non
 * ammette nodi di testo vuoti).
 */
function replaceRange(tr: Transaction, original: ProseMirrorNode, range: TextRange, replacement: string): void {
  if (replacement === '') {
    tr.delete(range.from, range.to)
    return
  }
  const marks = original.nodeAt(range.from)?.marks ?? []
  tr.replaceWith(range.from, range.to, original.type.schema.text(replacement, marks))
}

/**
 * "Sostituisci": se la selezione è proprio un'occorrenza la sostituisce e
 * passa alla successiva; altrimenti si limita a selezionare la prossima
 * occorrenza (come fanno Word e gli altri editor). Null se non c'è nulla da fare.
 */
export function replaceCurrentTransaction(state: EditorState, replacement: string): Transaction | null {
  const { matches } = getSearchState(state)
  const index = currentMatchIndex(state)
  if (index === -1) return goToMatchTransaction(state, 'next')
  const tr = state.tr
  replaceRange(tr, state.doc, matches[index], replacement)
  return tr.scrollIntoView()
}

/**
 * "Sostituisci tutti": un'unica transazione, quindi un solo passo di
 * Annulla. Si procede dall'ultima occorrenza alla prima, così le posizioni
 * delle precedenti non scorrono.
 */
export function replaceAllTransaction(
  state: EditorState,
  replacement: string
): { tr: Transaction; count: number } | null {
  const { matches } = getSearchState(state)
  if (matches.length === 0) return null
  const tr = state.tr
  for (let i = matches.length - 1; i >= 0; i--) replaceRange(tr, state.doc, matches[i], replacement)
  return { tr, count: matches.length }
}

function createSearchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init: () => ({ query: '', options: DEFAULT_OPTIONS, matches: [] }),
      apply(tr, previous) {
        const meta = tr.getMeta(searchPluginKey) as { query: string; options: SearchOptions } | undefined
        if (meta) return { ...meta, matches: collectMatches(tr.doc, meta.query, meta.options) }
        // Il testo è cambiato (digitazione, sostituzione, annulla): le occorrenze vanno ricalcolate.
        // Con la ricerca chiusa (query vuota) il costo è nullo.
        if (tr.docChanged && previous.query !== '') {
          return { ...previous, matches: collectMatches(tr.doc, previous.query, previous.options) }
        }
        return previous
      }
    },
    props: {
      decorations(state) {
        const { matches } = getSearchState(state)
        if (matches.length === 0) return null
        const { from, to } = state.selection
        return DecorationSet.create(
          state.doc,
          matches.map((m) =>
            Decoration.inline(m.from, m.to, {
              class:
                m.from === from && m.to === to
                  ? 'mybook-search-match mybook-search-match--current'
                  : 'mybook-search-match'
            })
          )
        )
      }
    }
  })
}

/** Estensione TipTap: registra il plugin di ricerca nell'editor. */
export const SearchHighlight = Extension.create({
  name: 'mybookSearch',
  addProseMirrorPlugins() {
    return [createSearchPlugin()]
  }
})
