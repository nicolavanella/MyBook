import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { SettingsRepository } from '../../src/main/database/repositories/settings.repository'
import { SettingsService } from '../../src/main/services/settings.service'
import { UpdateAppSettingsInput } from '../../src/shared/schemas/settings.schema'
import { resolveShortcuts } from '../../src/shared/shortcuts'
import { setLanguageProvider, getMainLanguage, tm } from '../../src/main/i18n'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  const service = new SettingsService(new SettingsRepository(db), ':memory:', db)
  return { db, service }
}

describe('migrazione 025 — editor_shortcuts', () => {
  it('di default non c\'è alcuna personalizzazione ({}), quindi valgono i default', () => {
    const { service } = setup()
    const settings = service.get() as any
    expect(settings.editor_shortcuts).toEqual({})
    expect(resolveShortcuts(settings.editor_shortcuts).bold).toBe('Mod+B')
  })
})

describe('SettingsService — scorciatoie da tastiera personalizzate (v0.4.0)', () => {
  it('salva e rilegge le personalizzazioni', () => {
    const { service } = setup()
    const updated = service.update({ editor_shortcuts: { bold: 'Mod+Shift+M', link: '' } }) as any
    expect(updated.editor_shortcuts).toEqual({ bold: 'Mod+Shift+M', link: '' })
    expect((service.get() as any).editor_shortcuts).toEqual({ bold: 'Mod+Shift+M', link: '' })
  })

  it('normalizza le combinazioni prima di salvarle', () => {
    const { service } = setup()
    const updated = service.update({ editor_shortcuts: { bold: 'Shift+Mod+m' } }) as any
    expect(updated.editor_shortcuts.bold).toBe('Mod+Shift+M')
  })

  it('NON salva azioni sconosciute né combinazioni non valide o riservate', () => {
    const { service } = setup()
    const updated = service.update({
      editor_shortcuts: { bold: 'Mod+C', italic: 'banana', inventata: 'Mod+Q', underline: 'Mod+Shift+U' }
    }) as any
    expect(updated.editor_shortcuts).toEqual({ underline: 'Mod+Shift+U' })
  })

  it('"ripristina tutte" (oggetto vuoto) azzera le personalizzazioni', () => {
    const { service } = setup()
    service.update({ editor_shortcuts: { bold: 'Mod+Shift+M' } })
    const reset = service.update({ editor_shortcuts: {} }) as any
    expect(reset.editor_shortcuts).toEqual({})
  })

  it('cambiare un\'altra impostazione non cancella le scorciatoie', () => {
    const { service } = setup()
    service.update({ editor_shortcuts: { bold: 'Mod+Shift+M' } })
    const updated = service.update({ ui_font_size: 'large' }) as any
    expect(updated.editor_shortcuts).toEqual({ bold: 'Mod+Shift+M' })
  })

  it('un JSON corrotto nel database non rompe le impostazioni: si legge come "nessuna personalizzazione"', () => {
    const { db, service } = setup()
    db.prepare('UPDATE app_settings SET editor_shortcuts = ?').run('{non è json')
    expect((service.get() as any).editor_shortcuts).toEqual({})
  })

  it('voci obsolete già nel database (azioni rimosse in una versione futura) vengono scartate in lettura', () => {
    const { db, service } = setup()
    db.prepare('UPDATE app_settings SET editor_shortcuts = ?').run(JSON.stringify({ bold: 'Mod+Shift+M', vecchia: 'Mod+Q' }))
    expect((service.get() as any).editor_shortcuts).toEqual({ bold: 'Mod+Shift+M' })
  })
})

describe('lingua dell\'interfaccia nelle impostazioni', () => {
  it('il default è l\'italiano', () => {
    expect((setup().service.get() as any).language).toBe('it')
  })

  it('si può passare all\'inglese e tornare', () => {
    const { service } = setup()
    expect((service.update({ language: 'en' }) as any).language).toBe('en')
    expect((service.update({ language: 'it' }) as any).language).toBe('it')
  })

  it('lo schema rifiuta lingue non supportate', () => {
    expect(UpdateAppSettingsInput.safeParse({ language: 'fr' }).success).toBe(false)
    expect(UpdateAppSettingsInput.safeParse({ language: 'en' }).success).toBe(true)
  })
})

describe('traduzione nel processo main (tm)', () => {
  it('segue la lingua fornita dalle impostazioni, letta a ogni uso (cambio immediato)', () => {
    const { service } = setup()
    setLanguageProvider(() => (service.get() as any).language)
    expect(tm('contextMenu.copy')).toBe('Copia')
    service.update({ language: 'en' })
    expect(tm('contextMenu.copy')).toBe('Copy')
    expect(getMainLanguage()).toBe('en')
    setLanguageProvider(() => 'it')
  })

  it('un fornitore che lancia (database chiuso) ripiega sull\'italiano invece di rompere il menu', () => {
    setLanguageProvider(() => {
      throw new Error('database chiuso')
    })
    expect(getMainLanguage()).toBe('it')
    expect(tm('contextMenu.paste')).toBe('Incolla')
    setLanguageProvider(() => 'it')
  })

  it('un valore sconosciuto nelle impostazioni diventa italiano', () => {
    setLanguageProvider(() => 'klingon')
    expect(getMainLanguage()).toBe('it')
    setLanguageProvider(() => 'it')
  })
})
