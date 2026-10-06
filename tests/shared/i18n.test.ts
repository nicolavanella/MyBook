import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  LANGUAGES,
  createTranslator,
  interpolate,
  localeOf,
  normalizeLanguage,
  pickInitialLanguage,
  translate,
  translations
} from '../../src/shared/i18n'

const itDict = translations.it as Record<string, string>
const enDict = translations.en as Record<string, string>

/** Segnaposto {nome} di un testo, in ordine alfabetico (per confrontare le due lingue). */
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('dizionari it/en', () => {
  it('hanno ESATTAMENTE le stesse chiavi', () => {
    expect(Object.keys(enDict).sort()).toEqual(Object.keys(itDict).sort())
  })

  it('nessun testo è vuoto', () => {
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(translations[lang])) {
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('usano gli stessi segnaposto {nome} in entrambe le lingue', () => {
    for (const key of Object.keys(itDict)) {
      expect(placeholders(enDict[key]), key).toEqual(placeholders(itDict[key]))
    }
  })

  it('ogni forma plurale _other ha la sua _one (e viceversa) in entrambe le lingue', () => {
    for (const dict of [itDict, enDict]) {
      for (const key of Object.keys(dict)) {
        if (key.endsWith('_other')) expect(dict[key.replace(/_other$/, '_one')], key).toBeDefined()
        if (key.endsWith('_one')) expect(dict[key.replace(/_one$/, '_other')], key).toBeDefined()
      }
    }
  })

  it('le chiavi seguono la convenzione area.elemento', () => {
    for (const key of Object.keys(itDict)) expect(key, key).toMatch(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/)
  })
})

describe('copertura: ogni chiave usata nel codice esiste nel dizionario', () => {
  /** Tutti i file sorgente (esclusi i dizionari stessi). */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) sourceFiles(full, out)
      else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}`)) out.push(full)
    }
    return out
  }

  const baseKeys = new Set(
    Object.keys(itDict).map((k) => k.replace(/_(one|other)$/, ''))
  )

  it("ogni t('...') / tm('...') / tNow('...') con chiave letterale punta a una chiave esistente", () => {
    const missing: string[] = []
    const callPattern = /\b(?:t|tm|tNow)\(\s*'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)'/g
    for (const file of sourceFiles(path.join(__dirname, '../../src'))) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(callPattern)) {
        if (!baseKeys.has(match[1])) missing.push(`${path.relative(path.join(__dirname, '../..'), file)}: ${match[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('ogni chiave del dizionario è usata almeno una volta (niente testi orfani)', () => {
    const corpus = sourceFiles(path.join(__dirname, '../../src')).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    const unused = [...baseKeys].filter((k) => !corpus.includes(`'${k}'`))
    expect(unused).toEqual([])
  })
})

describe('translate / interpolate', () => {
  it('traduce nella lingua richiesta', () => {
    expect(translate('it', 'nav.projects')).toBe('Progetti')
    expect(translate('en', 'nav.projects')).toBe('Projects')
  })

  it('sostituisce i segnaposto', () => {
    expect(translate('it', 'projects.confirmDelete', { title: 'Il mio libro' })).toContain('"Il mio libro"')
    expect(translate('en', 'projects.confirmDelete', { title: 'My book' })).toContain('"My book"')
  })

  it('un segnaposto senza valore resta visibile', () => {
    expect(interpolate('ciao {nome}', {})).toBe('ciao {nome}')
    expect(interpolate('ciao {nome}')).toBe('ciao {nome}')
  })

  it('un valore 0 viene stampato (non trattato come mancante)', () => {
    expect(interpolate('{n} elementi', { n: 0 })).toBe('0 elementi')
  })

  it('plurali: italiano', () => {
    expect(translate('it', 'editor.words', { count: 1 })).toBe('1 parola')
    expect(translate('it', 'editor.words', { count: 2 })).toBe('2 parole')
    expect(translate('it', 'editor.words', { count: 0 })).toBe('0 parole')
  })

  it('plurali: inglese', () => {
    expect(translate('en', 'editor.words', { count: 1 })).toBe('1 word')
    expect(translate('en', 'editor.words', { count: 5 })).toBe('5 words')
    expect(translate('en', 'editor.words', { count: 0 })).toBe('0 words')
  })

  it('plurali: numeri grandi in italiano ricadono su "other" (la categoria "many" non ha una chiave propria)', () => {
    expect(translate('it', 'editor.words', { count: 1_000_000 })).toBe('1000000 parole')
  })

  it('una chiave sconosciuta restituisce la chiave stessa (mai una stringa vuota)', () => {
    expect(translate('it', 'non.esiste' as never)).toBe('non.esiste')
  })

  it('createTranslator lega la lingua', () => {
    expect(createTranslator('en')('nav.settings')).toBe('Settings')
    expect(createTranslator('it')('nav.settings')).toBe('Impostazioni')
  })
})

describe('lingue', () => {
  it('normalizeLanguage accetta solo it/en, tutto il resto è italiano', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('it')).toBe('it')
    for (const bad of ['fr', '', null, undefined, 42, 'EN']) expect(normalizeLanguage(bad)).toBe('it')
  })

  it('pickInitialLanguage: italiano se il sistema è italiano, inglese altrimenti', () => {
    expect(pickInitialLanguage('it-IT')).toBe('it')
    expect(pickInitialLanguage('it')).toBe('it')
    expect(pickInitialLanguage('IT-CH')).toBe('it')
    expect(pickInitialLanguage('en-US')).toBe('en')
    expect(pickInitialLanguage('fr-FR')).toBe('en')
    expect(pickInitialLanguage('')).toBe('en')
    expect(pickInitialLanguage(undefined)).toBe('en')
  })

  it('localeOf restituisce un locale valido per Intl', () => {
    expect(localeOf('it')).toBe('it-IT')
    expect(localeOf('en')).toBe('en-GB')
    expect(() => new Intl.NumberFormat(localeOf('en')).format(1234.5)).not.toThrow()
  })
})
