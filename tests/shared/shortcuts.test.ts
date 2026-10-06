import { describe, expect, it } from 'vitest'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_ACTION_IDS,
  actionsOfTool,
  buildShortcutLookup,
  defaultShortcutOf,
  diffFromDefaults,
  eventToShortcut,
  findShortcutConflict,
  formatShortcut,
  normalizeShortcut,
  parseShortcut,
  resolveShortcuts,
  sanitizeShortcutOverrides,
  validateShortcut,
  type KeyEventLike
} from '../../src/shared/shortcuts'

/** Evento tastiera minimale, con tutti i modificatori spenti salvo quelli indicati. */
function ev(code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }
}

describe('catalogo azioni', () => {
  it('gli id sono univoci', () => {
    expect(new Set(SHORTCUT_ACTION_IDS).size).toBe(SHORTCUT_ACTION_IDS.length)
  })

  it('tutti i default non vuoti sono combinazioni valide e in forma canonica', () => {
    for (const a of SHORTCUT_ACTIONS) {
      if (!a.default) continue
      const v = validateShortcut(a.default)
      expect(v.ok, `${a.id}: ${a.default}`).toBe(true)
      expect(normalizeShortcut(a.default), a.id).toBe(a.default)
    }
  })

  it('nessun default è assegnato a due azioni', () => {
    const used = SHORTCUT_ACTIONS.map((a) => a.default).filter(Boolean)
    expect(new Set(used).size).toBe(used.length)
  })

  it('raggruppa le azioni per strumento della toolbar', () => {
    expect(actionsOfTool('heading')).toEqual(['paragraph', 'heading1', 'heading2', 'heading3'])
    expect(actionsOfTool('search')).toEqual(['find', 'replace'])
    expect(actionsOfTool('bold')).toEqual(['bold'])
  })
})

describe('parseShortcut / normalizeShortcut', () => {
  it('scompone modificatori e tasto', () => {
    expect(parseShortcut('Mod+Shift+B')).toEqual({ mod: true, alt: false, shift: true, key: 'B' })
    expect(parseShortcut('Mod+=')).toEqual({ mod: true, alt: false, shift: false, key: '=' })
    expect(parseShortcut('Mod+-')).toEqual({ mod: true, alt: false, shift: false, key: '-' })
  })

  it('rifiuta sintassi non valida', () => {
    for (const bad of ['', 'Mod+', '+B', 'Ctrl+B', 'Mod+Mod+B', 'Mod+Shift', 'Mod+ab', 'Mod+F13']) {
      expect(parseShortcut(bad), bad).toBeNull()
    }
  })

  it('riporta in forma canonica ordine dei modificatori e maiuscole', () => {
    expect(normalizeShortcut('shift+Mod+b')).toBeNull() // "shift" minuscolo non è un modificatore valido
    expect(normalizeShortcut('Shift+Mod+b')).toBe('Mod+Shift+B')
    expect(normalizeShortcut('Alt+Mod+7')).toBe('Mod+Alt+7')
  })
})

describe('validateShortcut', () => {
  it('accetta Mod+lettera, Alt+lettera e F1–F12 da soli', () => {
    expect(validateShortcut('Mod+J')).toEqual({ ok: true, shortcut: 'Mod+J' })
    expect(validateShortcut('Alt+Q').ok).toBe(true)
    expect(validateShortcut('F5').ok).toBe(true)
  })

  it('rifiuta combinazioni che scriverebbero testo', () => {
    expect(validateShortcut('B')).toEqual({ ok: false, reason: 'needsModifier' })
    expect(validateShortcut('Shift+B')).toEqual({ ok: false, reason: 'needsModifier' })
    expect(validateShortcut('7')).toEqual({ ok: false, reason: 'needsModifier' })
  })

  it('rifiuta le combinazioni riservate al sistema', () => {
    for (const r of ['Mod+C', 'Mod+V', 'Mod+X', 'Mod+A']) {
      expect(validateShortcut(r), r).toEqual({ ok: false, reason: 'reserved' })
    }
  })

  it('segnala come non valida una sintassi sbagliata', () => {
    expect(validateShortcut('banana')).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('eventToShortcut', () => {
  it('Windows/Linux: Ctrl è Mod', () => {
    expect(eventToShortcut(ev('KeyB', { ctrlKey: true }), false)).toBe('Mod+B')
    expect(eventToShortcut(ev('KeyB', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+B')
  })

  it('macOS: Cmd è Mod', () => {
    expect(eventToShortcut(ev('KeyB', { metaKey: true }), true)).toBe('Mod+B')
  })

  it('un modificatore "estraneo" (Cmd su Windows, Ctrl su Mac) non è una nostra scorciatoia', () => {
    expect(eventToShortcut(ev('KeyB', { metaKey: true }), false)).toBeNull()
    expect(eventToShortcut(ev('KeyB', { ctrlKey: true }), true)).toBeNull()
  })

  it('usa la posizione fisica del tasto: Shift+7 resta "7" anche se produce "/" sulla tastiera italiana', () => {
    expect(eventToShortcut(ev('Digit7', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+7')
  })

  it('gestisce punteggiatura e tasti funzione', () => {
    expect(eventToShortcut(ev('Equal', { ctrlKey: true }), false)).toBe('Mod+=')
    expect(eventToShortcut(ev('Minus', { ctrlKey: true }), false)).toBe('Mod+-')
    expect(eventToShortcut(ev('F3'), false)).toBe('F3')
  })

  it('ignora la pressione di un solo modificatore e i tasti non supportati', () => {
    expect(eventToShortcut(ev('ControlLeft', { ctrlKey: true }), false)).toBeNull()
    expect(eventToShortcut(ev('ShiftLeft', { shiftKey: true }), false)).toBeNull()
    expect(eventToShortcut(ev('Numpad5', { ctrlKey: true }), false)).toBeNull()
  })

  it('ignora gli eventi con AltGr attivo (sono testo, non comandi)', () => {
    const altGr = { ctrlKey: true, altKey: true, getModifierState: (k: string) => k === 'AltGraph' }
    expect(eventToShortcut(ev('KeyQ', altGr), false)).toBeNull()
  })
})

describe('formatShortcut', () => {
  it('testo leggibile per Windows/Linux e simboli per Mac', () => {
    expect(formatShortcut('Mod+Shift+B', false)).toBe('Ctrl+Shift+B')
    expect(formatShortcut('Mod+Shift+B', true)).toBe('⌘⇧B')
    expect(formatShortcut('Mod+Alt+1', false)).toBe('Ctrl+Alt+1')
    expect(formatShortcut('F3', false)).toBe('F3')
  })
  it('stringa vuota o non valida → ""', () => {
    expect(formatShortcut('', false)).toBe('')
    expect(formatShortcut('boh', false)).toBe('')
  })
})

describe('sanitizeShortcutOverrides', () => {
  it('scarta id sconosciuti, valori non stringa e combinazioni non valide', () => {
    expect(
      sanitizeShortcutOverrides({ bold: 'Mod+Shift+M', inventata: 'Mod+Q', italic: 42, underline: 'Mod+C', link: 'Mod+j' })
    ).toEqual({ bold: 'Mod+Shift+M', link: 'Mod+J' })
  })

  it('conserva "" (azione volutamente senza scorciatoia)', () => {
    expect(sanitizeShortcutOverrides({ bold: '' })).toEqual({ bold: '' })
  })

  it('non lancia mai su dati corrotti', () => {
    for (const bad of [null, undefined, 5, 'x', [], [1, 2]]) {
      expect(sanitizeShortcutOverrides(bad)).toEqual({})
    }
  })
})

describe('resolveShortcuts', () => {
  it('senza personalizzazioni restituisce i default', () => {
    const r = resolveShortcuts()
    expect(r.bold).toBe('Mod+B')
    expect(r.find).toBe('Mod+F')
    expect(r.dialogueDash).toBe('')
    for (const a of SHORTCUT_ACTIONS) expect(r[a.id]).toBe(a.default)
  })

  it('una personalizzazione vince sul default', () => {
    expect(resolveShortcuts({ bold: 'Mod+Shift+M' }).bold).toBe('Mod+Shift+M')
  })

  it('"" toglie la scorciatoia a un\'azione', () => {
    expect(resolveShortcuts({ bold: '' }).bold).toBe('')
  })

  it('una personalizzazione che occupa il default di un\'altra azione lo toglie a quella (nessun doppione)', () => {
    const r = resolveShortcuts({ italic: 'Mod+B' }) // Mod+B era di "bold"
    expect(r.italic).toBe('Mod+B')
    expect(r.bold).toBe('')
  })

  it('se due personalizzazioni coincidono prevale la prima del catalogo', () => {
    const r = resolveShortcuts({ bold: 'Mod+J', italic: 'Mod+J' })
    expect(r.bold).toBe('Mod+J')
    expect(r.italic).toBe('')
  })

  it('il risultato non contiene mai due azioni con la stessa combinazione', () => {
    const r = resolveShortcuts({ italic: 'Mod+B', underline: 'Mod+B', strike: 'Mod+I', link: 'Mod+Z' })
    const used = Object.values(r).filter(Boolean)
    expect(new Set(used).size).toBe(used.length)
  })
})

describe('findShortcutConflict', () => {
  it('trova l\'azione che usa già la combinazione', () => {
    const r = resolveShortcuts()
    expect(findShortcutConflict(r, 'italic', 'Mod+B')).toBe('bold')
  })
  it('non segnala conflitto con se stessa né per "nessuna scorciatoia"', () => {
    const r = resolveShortcuts()
    expect(findShortcutConflict(r, 'bold', 'Mod+B')).toBeNull()
    expect(findShortcutConflict(r, 'bold', '')).toBeNull()
  })
})

describe('diffFromDefaults', () => {
  it('invariato → nessuna personalizzazione', () => {
    expect(diffFromDefaults(resolveShortcuts())).toEqual({})
  })
  it('round-trip: resolve(diff(x)) === x', () => {
    const resolved = resolveShortcuts({ bold: 'Mod+Shift+M', link: '', dialogueDash: 'Alt+D' })
    expect(resolveShortcuts(diffFromDefaults(resolved))).toEqual(resolved)
  })
})

describe('buildShortcutLookup', () => {
  it('collega ogni combinazione assegnata alla sua azione', () => {
    const { actions } = buildShortcutLookup(resolveShortcuts())
    expect(actions.get('Mod+B')).toBe('bold')
    expect(actions.get('Mod+F')).toBe('find')
  })

  it('mantiene l\'alias Mod+Shift+Z per Ripeti (comportamento precedente alla 0.4.0)', () => {
    expect(buildShortcutLookup(resolveShortcuts()).actions.get('Mod+Shift+Z')).toBe('redo')
  })

  it('l\'alias cede il posto se la combinazione viene assegnata ad altro', () => {
    const { actions } = buildShortcutLookup(resolveShortcuts({ link: 'Mod+Shift+Z' }))
    expect(actions.get('Mod+Shift+Z')).toBe('link')
  })

  it('una scorciatoia nativa lasciata libera viene "inghiottita" (togliere Grassetto disattiva davvero Ctrl+B)', () => {
    const { actions, suppressed } = buildShortcutLookup(resolveShortcuts({ bold: 'Mod+Shift+M' }))
    expect(actions.has('Mod+B')).toBe(false)
    expect(suppressed.has('Mod+B')).toBe(true)
  })

  it('non inghiotte una combinazione che è ancora assegnata', () => {
    const { suppressed } = buildShortcutLookup(resolveShortcuts())
    expect(suppressed.size).toBe(0)
  })

  it('default vuoto non genera voci', () => {
    const { actions } = buildShortcutLookup(resolveShortcuts())
    expect(actions.has('')).toBe(false)
  })
})

describe('defaultShortcutOf', () => {
  it('restituisce il default dell\'azione', () => {
    expect(defaultShortcutOf('bold')).toBe('Mod+B')
    expect(defaultShortcutOf('image')).toBe('')
  })
})
