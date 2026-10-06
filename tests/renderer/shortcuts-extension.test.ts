import { describe, expect, it } from 'vitest'
import { buildShortcutLookup, resolveShortcuts, type KeyEventLike } from '@shared/shortcuts'
import { decideKeyDown } from '@renderer/features/editor/extensions/shortcutsExtension'

const ev = (code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods
})
const runtimeOf = (overrides?: unknown) => ({ lookup: buildShortcutLookup(resolveShortcuts(overrides)), isMac: false })

describe('decideKeyDown', () => {
  it('esegue l\'azione assegnata alla combinazione', () => {
    expect(decideKeyDown(runtimeOf(), ev('KeyB', { ctrlKey: true }), true)).toEqual({ handled: true, action: 'bold' })
  })

  it('usa la scorciatoia personalizzata e smette di rispondere a quella vecchia', () => {
    const rt = runtimeOf({ bold: 'Mod+Shift+M' })
    expect(decideKeyDown(rt, ev('KeyM', { ctrlKey: true, shiftKey: true }), true)).toEqual({ handled: true, action: 'bold' })
    // Ctrl+B non fa più Grassetto — e viene inghiottita, non lasciata a TipTap
    expect(decideKeyDown(rt, ev('KeyB', { ctrlKey: true }), true)).toEqual({ handled: true })
  })

  it('un\'azione senza scorciatoia non scatta mai', () => {
    const rt = runtimeOf()
    expect(decideKeyDown(rt, ev('KeyQ', { ctrlKey: true, shiftKey: true }), true)).toEqual({ handled: false })
  })

  it('tasti normali (scrittura) non vengono toccati', () => {
    const rt = runtimeOf()
    expect(decideKeyDown(rt, ev('KeyB'), true)).toEqual({ handled: false })
    expect(decideKeyDown(rt, ev('KeyB', { shiftKey: true }), true)).toEqual({ handled: false })
    expect(decideKeyDown(rt, ev('Enter'), true)).toEqual({ handled: false })
  })

  it('mantiene l\'alias storico Ctrl+Shift+Z per Ripeti', () => {
    expect(decideKeyDown(runtimeOf(), ev('KeyZ', { ctrlKey: true, shiftKey: true }), true)).toEqual({ handled: true, action: 'redo' })
  })

  it('con la scena bloccata le azioni che modificano il testo sono consumate ma non eseguite', () => {
    expect(decideKeyDown(runtimeOf(), ev('KeyB', { ctrlKey: true }), false)).toEqual({ handled: true })
  })

  it('con la scena bloccata cerca e zoom restano disponibili', () => {
    expect(decideKeyDown(runtimeOf(), ev('KeyF', { ctrlKey: true }), false)).toEqual({ handled: true, action: 'find' })
    expect(decideKeyDown(runtimeOf(), ev('KeyH', { ctrlKey: true }), false)).toEqual({ handled: true, action: 'replace' })
    expect(decideKeyDown(runtimeOf(), ev('Equal', { ctrlKey: true }), false)).toEqual({ handled: true, action: 'zoomIn' })
  })

  it('su Mac il modificatore è Cmd e Ctrl+B non è una nostra scorciatoia', () => {
    const rt = { lookup: buildShortcutLookup(resolveShortcuts()), isMac: true }
    expect(decideKeyDown(rt, ev('KeyB', { metaKey: true }), true)).toEqual({ handled: true, action: 'bold' })
    expect(decideKeyDown(rt, ev('KeyB', { ctrlKey: true }), true)).toEqual({ handled: false })
  })

  it('AltGr non scatena scorciatoie (si sta digitando un carattere)', () => {
    const altGr = ev('Digit1', { ctrlKey: true, altKey: true, getModifierState: (k: string) => k === 'AltGraph' })
    expect(decideKeyDown(runtimeOf(), altGr, true)).toEqual({ handled: false })
  })
})
