import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { SettingsRepository } from '../../src/main/database/repositories/settings.repository'
import { SettingsService } from '../../src/main/services/settings.service'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  const service = new SettingsService(new SettingsRepository(db), ':memory:', db)
  return { db, service }
}

describe('SettingsService — v0.3.1 (dimensione UI, dizionari multipli, toggle tag/commenti)', () => {
  it('valori di default: entrambi tag e commenti abilitati, dimensione interfaccia "medium"', () => {
    const { service } = setup()
    const settings = service.get() as any
    expect(settings.ui_font_size).toBe('medium')
    expect(!!settings.tags_enabled).toBe(true)
    expect(!!settings.comments_enabled).toBe(true)
    expect(settings.dictionary_languages).toEqual(['it-IT', 'en-US'])
  })

  it('aggiorna la dimensione testo dell\'interfaccia', () => {
    const { service } = setup()
    const updated = service.update({ ui_font_size: 'large' })
    expect(updated.ui_font_size).toBe('large')
  })

  it('salva più lingue dizionario contemporaneamente (array, non un singolo file)', () => {
    const { service } = setup()
    const updated = service.update({ dictionary_languages: ['it-IT', 'en-US', 'fr'] })
    expect(updated.dictionary_languages).toEqual(['it-IT', 'en-US', 'fr'])
  })

  it('disabilita i tag: il valore booleano viene convertito in 0/1 per SQLite', () => {
    const { db, service } = setup()
    service.update({ tags_enabled: false })
    const row = db.prepare("SELECT tags_enabled FROM app_settings WHERE id='singleton'").get() as any
    expect(row.tags_enabled).toBe(0)
    expect(!!service.get().tags_enabled).toBe(false)
  })

  it('disabilita i commenti indipendentemente dai tag', () => {
    const { service } = setup()
    service.update({ comments_enabled: false })
    const settings = service.get() as any
    expect(!!settings.comments_enabled).toBe(false)
    expect(!!settings.tags_enabled).toBe(true) // non influenzato
  })
})
