import { describe, expect, it } from 'vitest'
import { Schema, type Node as PMNode } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import {
  collectMatches,
  currentMatchIndex,
  getSearchState,
  goToMatchTransaction,
  replaceAllTransaction,
  replaceCurrentTransaction,
  searchPluginKey,
  setSearchTransaction,
  SearchHighlight
} from '@renderer/features/editor/extensions/searchExtension'
import type { SearchOptions } from '@shared/textSearch'

// Schema minimo ma rappresentativo: paragrafi, a capo forzato (nodo inline non testuale), mark di formattazione e tag.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
    hardBreak: { group: 'inline', inline: true, selectable: false, toDOM: () => ['br'] },
    text: { group: 'inline' }
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
    entityTag: { attrs: { entityId: {} }, inclusive: false, toDOM: () => ['span', 0] }
  }
})

const loose: SearchOptions = { caseSensitive: false, wholeWord: false }
const words: SearchOptions = { caseSensitive: false, wholeWord: true }

const p = (...children: PMNode[]) => schema.node('paragraph', null, children)
const t = (text: string, marks: string[] = []) => schema.text(text, marks.map((m) => schema.marks[m].create(m === 'entityTag' ? { entityId: 'e1' } : undefined)))

/** Stato con il plugin di ricerca (preso dall'estensione reale) e la cronologia, per provare anche Annulla. */
function stateOf(doc: PMNode): EditorState {
  const plugins = SearchHighlight.config.addProseMirrorPlugins!.call({} as never)
  return EditorState.create({ doc, plugins: [...plugins, history()] })
}

function apply(state: EditorState, tr: Transaction | null): EditorState {
  return tr ? state.apply(tr) : state
}

function withSearch(state: EditorState, query: string, options = loose): EditorState {
  return state.apply(setSearchTransaction(state, query, options))
}

function textOf(state: EditorState): string {
  return state.doc.textBetween(0, state.doc.content.size, '|', '¶')
}

describe('collectMatches', () => {
  it('trova la parola anche quando è spezzata da un cambio di formattazione (limite della vecchia ricerca)', () => {
    const doc = schema.node('doc', null, [p(t('ciao '), t('mon', ['bold']), t('do'))])
    const matches = collectMatches(doc, 'mondo', loose)
    expect(matches).toHaveLength(1)
    expect(doc.textBetween(matches[0].from, matches[0].to)).toBe('mondo')
  })

  it('le posizioni sono quelle del documento, su più paragrafi', () => {
    const doc = schema.node('doc', null, [p(t('uno casa')), p(t('due casa casa'))])
    const matches = collectMatches(doc, 'casa', loose)
    expect(matches).toHaveLength(3)
    for (const m of matches) expect(doc.textBetween(m.from, m.to)).toBe('casa')
  })

  it('scende nei contenitori (citazioni)', () => {
    const doc = schema.node('doc', null, [schema.node('blockquote', null, [p(t('dentro la casa'))])])
    const [m] = collectMatches(doc, 'casa', loose)
    expect(doc.textBetween(m.from, m.to)).toBe('casa')
  })

  it('un a capo forzato occupa una posizione senza sfasare le successive', () => {
    const doc = schema.node('doc', null, [p(t('prima'), schema.node('hardBreak'), t('casa finale'))])
    const [m] = collectMatches(doc, 'casa', loose)
    expect(doc.textBetween(m.from, m.to)).toBe('casa')
  })

  it('non trova una parola attraverso due paragrafi', () => {
    const doc = schema.node('doc', null, [p(t('ca')), p(t('sa'))])
    expect(collectMatches(doc, 'casa', loose)).toHaveLength(0)
  })

  it('rispetta "solo parole intere"', () => {
    const doc = schema.node('doc', null, [p(t('casale casa'))])
    expect(collectMatches(doc, 'casa', words)).toHaveLength(1)
  })
})

describe('plugin di ricerca', () => {
  it('conserva query e occorrenze nello stato', () => {
    const s = withSearch(stateOf(schema.node('doc', null, [p(t('a casa, la casa'))])), 'casa')
    expect(getSearchState(s).query).toBe('casa')
    expect(getSearchState(s).matches).toHaveLength(2)
  })

  it('ricalcola le occorrenze quando il testo cambia', () => {
    let s = withSearch(stateOf(schema.node('doc', null, [p(t('casa'))])), 'casa')
    s = s.apply(s.tr.insertText(' casa', s.doc.content.size - 1))
    expect(getSearchState(s).matches).toHaveLength(2)
  })

  it('query vuota → nessuna occorrenza', () => {
    const s = withSearch(stateOf(schema.node('doc', null, [p(t('casa'))])), '')
    expect(getSearchState(s).matches).toEqual([])
  })

  it('impostare la ricerca non entra nella cronologia di Annulla né cambia il documento', () => {
    const base = stateOf(schema.node('doc', null, [p(t('casa'))]))
    const s = withSearch(base, 'casa')
    expect(s.doc.eq(base.doc)).toBe(true)
    expect(searchPluginKey.getState(s)).toBeDefined()
  })
})

describe('navigazione', () => {
  const doc = () => schema.node('doc', null, [p(t('casa uno casa due casa'))])

  it('"Trova successivo" scorre le occorrenze e poi ricomincia', () => {
    let s = withSearch(stateOf(doc()), 'casa')
    const picked: string[] = []
    for (let i = 0; i < 4; i++) {
      s = apply(s, goToMatchTransaction(s, 'next'))
      picked.push(`${s.selection.from}`)
    }
    const [a, b, c] = getSearchState(s).matches
    expect(picked).toEqual([a, b, c, a].map((m) => `${m.from}`))
  })

  it('"Trova precedente" va all\'indietro con giro completo', () => {
    let s = withSearch(stateOf(doc()), 'casa')
    s = apply(s, goToMatchTransaction(s, 'prev'))
    const matches = getSearchState(s).matches
    expect(s.selection.from).toBe(matches[matches.length - 1].from)
    s = apply(s, goToMatchTransaction(s, 'prev'))
    expect(s.selection.from).toBe(matches[1].from)
  })

  it('currentMatchIndex vale -1 finché la selezione non è un\'occorrenza, poi l\'indice', () => {
    let s = withSearch(stateOf(doc()), 'casa')
    expect(currentMatchIndex(s)).toBe(-1)
    s = apply(s, goToMatchTransaction(s, 'next'))
    expect(currentMatchIndex(s)).toBe(0)
    s = apply(s, goToMatchTransaction(s, 'next'))
    expect(currentMatchIndex(s)).toBe(1)
  })

  it('senza occorrenze non produce transazioni', () => {
    const s = withSearch(stateOf(doc()), 'zzz')
    expect(goToMatchTransaction(s, 'next')).toBeNull()
  })

  it('parte dal cursore, non dall\'inizio', () => {
    let s = withSearch(stateOf(doc()), 'casa')
    const [, second] = getSearchState(s).matches
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, second.from - 1)))
    s = apply(s, goToMatchTransaction(s, 'next'))
    expect(s.selection.from).toBe(second.from)
  })
})

describe('sostituisci', () => {
  it('con la selezione su un\'occorrenza la sostituisce e passa alla successiva', () => {
    let s = withSearch(stateOf(schema.node('doc', null, [p(t('casa e casa'))])), 'casa')
    s = apply(s, goToMatchTransaction(s, 'next'))
    s = apply(s, replaceCurrentTransaction(s, 'villa'))
    expect(textOf(s)).toBe('villa e casa')
    s = apply(s, goToMatchTransaction(s, 'next'))
    expect(s.doc.textBetween(s.selection.from, s.selection.to)).toBe('casa')
  })

  it('senza selezione su un\'occorrenza si limita a selezionare la prossima (non sostituisce a vuoto)', () => {
    let s = withSearch(stateOf(schema.node('doc', null, [p(t('casa e casa'))])), 'casa')
    s = apply(s, replaceCurrentTransaction(s, 'villa'))
    expect(textOf(s)).toBe('casa e casa')
    expect(currentMatchIndex(s)).toBe(0)
  })

  it('se il testo sostitutivo contiene la query non entra in un ciclo infinito', () => {
    let s = withSearch(stateOf(schema.node('doc', null, [p(t('casa casa'))])), 'casa')
    s = apply(s, goToMatchTransaction(s, 'next'))
    s = apply(s, replaceCurrentTransaction(s, 'casa casa'))
    s = apply(s, goToMatchTransaction(s, 'next'))
    expect(textOf(s)).toBe('casa casa casa')
    // la prossima occorrenza selezionata è la seconda "casa" originale o una successiva, mai la stessa appena inserita
    expect(s.selection.from).toBeGreaterThan(1)
  })

  it('la sostituzione vuota cancella il testo', () => {
    let s = withSearch(stateOf(schema.node('doc', null, [p(t('una casa grande'))])), 'casa ')
    s = apply(s, goToMatchTransaction(s, 'next'))
    s = apply(s, replaceCurrentTransaction(s, ''))
    expect(textOf(s)).toBe('una grande')
  })

  it('conserva la formattazione e i tag del testo sostituito', () => {
    let s = withSearch(
      stateOf(schema.node('doc', null, [p(t('Ciao '), t('Marco', ['bold', 'entityTag']), t(' come va'))])),
      'Marco'
    )
    s = apply(s, goToMatchTransaction(s, 'next'))
    s = apply(s, replaceCurrentTransaction(s, 'Marcello'))
    const marked = s.doc.nodeAt(7)!
    expect(marked.text).toBe('Marcello')
    expect(marked.marks.map((m) => m.type.name).sort()).toEqual(['bold', 'entityTag'])
  })
})

describe('sostituisci tutti', () => {
  it('sostituisce ogni occorrenza in tutti i paragrafi e riporta il numero', () => {
    const s = withSearch(stateOf(schema.node('doc', null, [p(t('casa uno casa')), p(t('due casa'))])), 'casa')
    const result = replaceAllTransaction(s, 'villa')!
    expect(result.count).toBe(3)
    expect(textOf(s.apply(result.tr))).toBe('villa uno villa|due villa')
  })

  it('funziona con sostituzioni di lunghezza diversa (le posizioni non scorrono)', () => {
    const s = withSearch(stateOf(schema.node('doc', null, [p(t('a b a b a'))])), 'a')
    const out = s.apply(replaceAllTransaction(s, 'xxxx')!.tr)
    expect(textOf(out)).toBe('xxxx b xxxx b xxxx')
    const s2 = withSearch(stateOf(schema.node('doc', null, [p(t('xxxx b xxxx'))])), 'xxxx')
    expect(textOf(s2.apply(replaceAllTransaction(s2, 'a')!.tr))).toBe('a b a')
  })

  it('è UN solo passo di Annulla', () => {
    const base = withSearch(stateOf(schema.node('doc', null, [p(t('casa casa casa'))])), 'casa')
    const replaced = base.apply(replaceAllTransaction(base, 'villa')!.tr)
    expect(textOf(replaced)).toBe('villa villa villa')
    let restored: EditorState = replaced
    undo(replaced, (tr) => {
      restored = replaced.apply(tr)
    })
    expect(textOf(restored)).toBe('casa casa casa')
  })

  it('rispetta "solo parole intere"', () => {
    const s = withSearch(stateOf(schema.node('doc', null, [p(t('casale casa casaccia'))])), 'casa', words)
    expect(textOf(s.apply(replaceAllTransaction(s, 'villa')!.tr))).toBe('casale villa casaccia')
  })

  it('nessuna occorrenza → null', () => {
    const s = withSearch(stateOf(schema.node('doc', null, [p(t('niente'))])), 'casa')
    expect(replaceAllTransaction(s, 'villa')).toBeNull()
  })

  it('conserva la formattazione di ogni occorrenza', () => {
    const s = withSearch(
      stateOf(schema.node('doc', null, [p(t('casa '), t('casa', ['bold']))])),
      'casa'
    )
    const out = s.apply(replaceAllTransaction(s, 'villa')!.tr)
    const nodes: string[] = []
    out.doc.descendants((n) => {
      if (n.isText) nodes.push(`${n.text}:${n.marks.map((m) => m.type.name).join(',')}`)
    })
    expect(nodes).toEqual(['villa :', 'villa:bold'])
  })
})
