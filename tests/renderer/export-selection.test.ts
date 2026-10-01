import { describe, it, expect } from 'vitest'
import { toggleSelectionCascade } from '@renderer/features/export/selection'

const ALL_IDS = ['ch1', 'sc1a', 'sc1b', 'ch2', 'sc2a']

describe('toggleSelectionCascade', () => {
  it('deselezionando un capitolo deseleziona anche tutte le sue scene', () => {
    // Si parte da "tutto selezionato" (prev = null)
    const result = toggleSelectionCascade(null, ALL_IDS, 'ch1', ['sc1a', 'sc1b'])
    expect(result.has('ch1')).toBe(false)
    expect(result.has('sc1a')).toBe(false)
    expect(result.has('sc1b')).toBe(false)
    // Il resto del progetto resta selezionato
    expect(result.has('ch2')).toBe(true)
    expect(result.has('sc2a')).toBe(true)
  })

  it('riselezionando un capitolo riseleziona anche tutte le sue scene', () => {
    const afterDeselect = toggleSelectionCascade(null, ALL_IDS, 'ch1', ['sc1a', 'sc1b'])
    const afterReselect = toggleSelectionCascade(afterDeselect, ALL_IDS, 'ch1', ['sc1a', 'sc1b'])
    expect(afterReselect.has('ch1')).toBe(true)
    expect(afterReselect.has('sc1a')).toBe(true)
    expect(afterReselect.has('sc1b')).toBe(true)
  })

  it('il toggle di una singola scena non tocca il capitolo né le altre scene', () => {
    const result = toggleSelectionCascade(null, ALL_IDS, 'sc1a')
    expect(result.has('sc1a')).toBe(false)
    expect(result.has('ch1')).toBe(true)
    expect(result.has('sc1b')).toBe(true)
  })

  it('non muta il Set precedente (immutabilità per il corretto re-render React)', () => {
    const prev = new Set(ALL_IDS)
    const result = toggleSelectionCascade(prev, ALL_IDS, 'ch1', ['sc1a', 'sc1b'])
    expect(result).not.toBe(prev)
    expect(prev.has('ch1')).toBe(true) // il set originale resta intatto
  })
})
