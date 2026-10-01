import { describe, it, expect } from 'vitest'
import { canShowTagPanel, TAG_PANEL_MIN_WINDOW_WIDTH } from '@renderer/lib/responsivePanel'

describe('canShowTagPanel', () => {
  it('nasconde il pannello sotto la soglia', () => {
    expect(canShowTagPanel(TAG_PANEL_MIN_WINDOW_WIDTH - 1)).toBe(false)
    expect(canShowTagPanel(800)).toBe(false)
  })
  it('mostra il pannello esattamente alla soglia e oltre', () => {
    expect(canShowTagPanel(TAG_PANEL_MIN_WINDOW_WIDTH)).toBe(true)
    expect(canShowTagPanel(TAG_PANEL_MIN_WINDOW_WIDTH + 400)).toBe(true)
  })
})
