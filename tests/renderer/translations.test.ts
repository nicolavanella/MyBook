import { describe, it, expect } from 'vitest'
import { translations } from '@renderer/i18n/translations'

describe('translations', () => {
  it('italiano e inglese hanno esattamente le stesse chiavi', () => {
    const itKeys = Object.keys(translations.it).sort()
    const enKeys = Object.keys(translations.en).sort()
    expect(enKeys).toEqual(itKeys)
  })

  it('nessuna traduzione è una stringa vuota', () => {
    for (const lang of ['it', 'en'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) {
        expect(value.trim(), `${lang}.${key} è vuota`).not.toBe('')
      }
    }
  })

  it('italiano e inglese non sono identici per le stesse chiavi (traduzioni reali, non copie)', () => {
    const differing = Object.keys(translations.it).filter(
      (key) => translations.it[key as keyof typeof translations.it] !== translations.en[key as keyof typeof translations.en]
    )
    // Non tutte le chiavi devono differire (es. "Timeline" è uguale in entrambe le lingue),
    // ma la maggior parte sì: verifichiamo che il dizionario non sia una copia 1:1.
    expect(differing.length).toBeGreaterThan(0)
  })
})
