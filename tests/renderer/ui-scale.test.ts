import { describe, it, expect } from 'vitest'
import { UI_FONT_SCALE } from '@renderer/hooks/useUiScale'

describe('UI_FONT_SCALE', () => {
  it('definisce una percentuale per ciascuna delle tre dimensioni', () => {
    expect(Object.keys(UI_FONT_SCALE).sort()).toEqual(['large', 'medium', 'small'])
  })

  it('"medium" corrisponde alla dimensione di base (100%)', () => {
    expect(UI_FONT_SCALE.medium).toBe('100%')
  })

  it('"small" è più piccolo di "medium", "large" è più grande', () => {
    const toNumber = (pct: string) => parseFloat(pct)
    expect(toNumber(UI_FONT_SCALE.small)).toBeLessThan(toNumber(UI_FONT_SCALE.medium))
    expect(toNumber(UI_FONT_SCALE.large)).toBeGreaterThan(toNumber(UI_FONT_SCALE.medium))
  })
})
