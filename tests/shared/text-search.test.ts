import { describe, expect, it } from 'vitest'
import {
  LEAF_PLACEHOLDER,
  buildSearchRegExp,
  findInText,
  indexOfSelection,
  pickMatchIndex,
  type SearchOptions
} from '../../src/shared/textSearch'

const loose: SearchOptions = { caseSensitive: false, wholeWord: false }
const exact: SearchOptions = { caseSensitive: true, wholeWord: false }
const words: SearchOptions = { caseSensitive: false, wholeWord: true }
const wordsExact: SearchOptions = { caseSensitive: true, wholeWord: true }

describe('findInText — base', () => {
  it('trova tutte le occorrenze con i relativi intervalli', () => {
    expect(findInText('la casa, la casa', 'casa', loose)).toEqual([
      { from: 3, to: 7 },
      { from: 12, to: 16 }
    ])
  })

  it('query vuota → nessun risultato', () => {
    expect(findInText('testo', '', loose)).toEqual([])
    expect(buildSearchRegExp('', loose)).toBeNull()
  })

  it('nessuna occorrenza → array vuoto', () => {
    expect(findInText('testo', 'xyz', loose)).toEqual([])
  })

  it('le occorrenze non si sovrappongono ("aa" in "aaaa" → 2)', () => {
    expect(findInText('aaaa', 'aa', loose)).toHaveLength(2)
  })

  it('i caratteri speciali delle regex sono letterali', () => {
    expect(findInText('costa 3.5 (circa) [ok]', '3.5', loose)).toHaveLength(1)
    expect(findInText('costa 3x5', '3.5', loose)).toHaveLength(0)
    expect(findInText('(circa)', '(circa)', loose)).toHaveLength(1)
    expect(findInText('a+b', 'a+b', loose)).toHaveLength(1)
    expect(findInText('c:\\dir', '\\', loose)).toHaveLength(1)
  })

  it('gli spazi nella query sono significativi', () => {
    expect(findInText('un due  tre', ' ', loose)).toHaveLength(3)
  })
})

describe('findInText — maiuscole/minuscole', () => {
  it('di default le ignora', () => {
    expect(findInText('Roma roma ROMA', 'roma', loose)).toHaveLength(3)
  })

  it('"Distingui maiuscole e minuscole" le rispetta', () => {
    expect(findInText('Roma roma ROMA', 'roma', exact)).toEqual([{ from: 5, to: 9 }])
  })

  it('ignora le maiuscole anche sulle lettere accentate', () => {
    expect(findInText('È già Èvento', 'è', loose)).toHaveLength(2)
  })

  it('gli indici restano corretti con caratteri che cambierebbero lunghezza in toLowerCase', () => {
    // "İ".toLowerCase() è lungo 2: con toLowerCase gli indici successivi si sfaserebbero.
    expect(findInText('İ casa', 'casa', loose)).toEqual([{ from: 2, to: 6 }])
  })
})

describe('findInText — solo parole intere', () => {
  it('non trova la parola dentro un\'altra', () => {
    expect(findInText('casale casa incasato', 'casa', words)).toEqual([{ from: 7, to: 11 }])
  })

  it('riconosce i confini con punteggiatura e inizio/fine testo', () => {
    expect(findInText('casa, casa. (casa) casa', 'casa', words)).toHaveLength(4)
  })

  it('gestisce le lettere accentate (dove \\b di JavaScript sbaglia)', () => {
    // con \b, "perch" risulterebbe parola intera dentro "perché"
    expect(findInText('perché', 'perch', words)).toEqual([])
    expect(findInText('perché', 'perché', words)).toHaveLength(1)
    expect(findInText('già fatto', 'già', words)).toHaveLength(1)
    expect(findInText('piùdi', 'più', words)).toEqual([])
  })

  it('l\'apostrofo è un confine: "l\'amico" contiene la parola "amico"', () => {
    expect(findInText("l'amico e l’amica", 'amico', words)).toHaveLength(1)
    expect(findInText("l'amico e l’amica", 'amica', words)).toHaveLength(1)
  })

  it('le cifre fanno parte della parola', () => {
    expect(findInText('casa2 casa', 'casa', words)).toEqual([{ from: 6, to: 10 }])
  })

  it('combinata con "distingui maiuscole"', () => {
    expect(findInText('Casa casa', 'casa', wordsExact)).toEqual([{ from: 5, to: 9 }])
  })

  it('il segnaposto dei nodi non testuali è un confine di parola', () => {
    expect(findInText(`ciao${LEAF_PLACEHOLDER}mondo`, 'ciao', words)).toHaveLength(1)
  })
})

describe('pickMatchIndex', () => {
  const m = [
    { from: 2, to: 4 },
    { from: 10, to: 12 },
    { from: 20, to: 22 }
  ]

  it('avanti: prima occorrenza da `position` in poi', () => {
    expect(pickMatchIndex(m, 0, 'next')).toBe(0)
    expect(pickMatchIndex(m, 5, 'next')).toBe(1)
    expect(pickMatchIndex(m, 10, 'next')).toBe(1)
  })

  it('avanti: dopo l\'ultima si torna alla prima (giro completo)', () => {
    expect(pickMatchIndex(m, 23, 'next')).toBe(0)
  })

  it('con selezione = occorrenza corrente (position = to) passa alla successiva', () => {
    expect(pickMatchIndex(m, 4, 'next')).toBe(1)
  })

  it('indietro: ultima occorrenza che finisce entro `position`', () => {
    expect(pickMatchIndex(m, 15, 'prev')).toBe(1)
    expect(pickMatchIndex(m, 12, 'prev')).toBe(1)
  })

  it('indietro: prima della prima si torna all\'ultima', () => {
    expect(pickMatchIndex(m, 1, 'prev')).toBe(2)
  })

  it('senza occorrenze → -1', () => {
    expect(pickMatchIndex([], 0, 'next')).toBe(-1)
    expect(pickMatchIndex([], 0, 'prev')).toBe(-1)
  })
})

describe('indexOfSelection', () => {
  const m = [
    { from: 2, to: 4 },
    { from: 10, to: 12 }
  ]
  it('trova l\'occorrenza coincidente con la selezione', () => {
    expect(indexOfSelection(m, 10, 12)).toBe(1)
  })
  it('selezione parziale o altrove → -1', () => {
    expect(indexOfSelection(m, 10, 11)).toBe(-1)
    expect(indexOfSelection(m, 0, 1)).toBe(-1)
  })
})
