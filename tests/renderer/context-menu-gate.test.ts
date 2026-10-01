import { describe, it, expect } from 'vitest'
import { shouldShowContextMenu, type ClosestCapable } from '@renderer/lib/contextMenuGate'

function mockElement(matches: string[]): ClosestCapable {
  return { closest: (selector: string) => (matches.includes(selector) ? {} : null) }
}

describe('shouldShowContextMenu', () => {
  it('false per un target nullo', () => {
    expect(shouldShowContextMenu(null)).toBe(false)
  })

  it('true per un input di testo normale', () => {
    const el = mockElement(['input, textarea, [contenteditable="true"]'])
    expect(shouldShowContextMenu(el)).toBe(true)
  })

  it('true per una textarea', () => {
    const el = mockElement(['input, textarea, [contenteditable="true"]'])
    expect(shouldShowContextMenu(el)).toBe(true)
  })

  it('true per l\'editor contenteditable della scena', () => {
    const el = mockElement(['input, textarea, [contenteditable="true"]'])
    expect(shouldShowContextMenu(el)).toBe(true)
  })

  it('false per un elemento non testuale (bottone, div, icona)', () => {
    const el = mockElement([])
    expect(shouldShowContextMenu(el)).toBe(false)
  })

  it('false per una barra di ricerca, anche se è un input', () => {
    const el = mockElement(['input, textarea, [contenteditable="true"]', '[data-search-input]'])
    expect(shouldShowContextMenu(el)).toBe(false)
  })
})
