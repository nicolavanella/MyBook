import { describe, expect, it } from 'vitest'
import { GROUP_COLOR_PRESETS, isHexColor, normalizeHexColor, tintColor } from '@renderer/lib/colorUtils'

describe('colorUtils', () => {
  it('riconosce colori esadecimali a 3 e 6 cifre', () => {
    for (const ok of ['#fff', '#FFF', '#a1b2c3', '#A1B2C3']) expect(isHexColor(ok), ok).toBe(true)
    for (const bad of ['', 'fff', '#ff', '#ffff', '#gggggg', 'red', '#12345', '#1234567']) expect(isHexColor(bad), bad).toBe(false)
  })

  it('normalizza: "#abc" → "#aabbcc", maiuscole → minuscole, non valido → null', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc')
    expect(normalizeHexColor('#A1B2C3')).toBe('#a1b2c3')
    expect(normalizeHexColor('blu')).toBeNull()
  })

  it('tintColor produce rgba con la trasparenza richiesta', () => {
    expect(tintColor('#ff0000', 0.3)).toBe('rgba(255, 0, 0, 0.3)')
    expect(tintColor('#0f0', 0.5)).toBe('rgba(0, 255, 0, 0.5)')
    expect(tintColor('#102030', 1)).toBe('rgba(16, 32, 48, 1)')
  })

  it('tintColor limita la trasparenza fra 0 e 1', () => {
    expect(tintColor('#000000', 5)).toBe('rgba(0, 0, 0, 1)')
    expect(tintColor('#000000', -1)).toBe('rgba(0, 0, 0, 0)')
  })

  it('senza colore (vuoto, null, non valido) non c\'è sfondo personalizzato', () => {
    expect(tintColor('', 0.3)).toBeUndefined()
    expect(tintColor(null, 0.3)).toBeUndefined()
    expect(tintColor(undefined, 0.3)).toBeUndefined()
    expect(tintColor('rosso', 0.3)).toBeUndefined()
  })

  it('i colori predefiniti sono tutti validi e distinti', () => {
    expect(GROUP_COLOR_PRESETS.every(isHexColor)).toBe(true)
    expect(new Set(GROUP_COLOR_PRESETS).size).toBe(GROUP_COLOR_PRESETS.length)
  })
})
