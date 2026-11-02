import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { SettingsRepository } from '../../src/main/database/repositories/settings.repository'
import { SettingsService } from '../../src/main/services/settings.service'
import { UpdateAppSettingsInput } from '../../src/shared/schemas/settings.schema'
import { shouldShowBackupPrompt, shouldShowTodoPrompt } from '../../src/shared/promptFlags'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  return { db, service: new SettingsService(new SettingsRepository(db), ':memory:', db) }
}

describe('impostazioni v0.4.1 — flag delle finestre', () => {
  it('default di una nuova installazione: To Do/recap attivi, richiesta backup non ancora mostrata', () => {
    const s = setup().service.get() as any
    expect(s.todo_recap_enabled).toBe(1)
    expect(s.backup_prompt_shown).toBe(0)
    expect(shouldShowTodoPrompt(s)).toBe(true)
    expect(shouldShowBackupPrompt(s)).toBe(true) // nessuna cartella di backup e mai proposta
  })

  it('"Non mostrare più": si salva, si rilegge e spegne To Do e recap', () => {
    const { service } = setup()
    const next = service.update({ todo_recap_enabled: false }) as any
    expect(next.todo_recap_enabled).toBe(0)
    expect(shouldShowTodoPrompt(next)).toBe(false)
    expect((service.get() as any).todo_recap_enabled).toBe(0)
  })

  it('si può riattivare da Impostazioni > Log', () => {
    const { service } = setup()
    service.update({ todo_recap_enabled: false })
    const next = service.update({ todo_recap_enabled: true }) as any
    expect(next.todo_recap_enabled).toBe(1)
    expect(shouldShowTodoPrompt(next)).toBe(true)
  })

  it('il flag è indipendente dal registro attività', () => {
    const { service } = setup()
    const next = service.update({ todo_recap_enabled: false }) as any
    expect(next.activity_log_enabled).toBe(1) // il registro continua a registrare
    const off = service.update({ activity_log_enabled: false }) as any
    expect(off.todo_recap_enabled).toBe(0) // e spegnerlo non tocca il flag
  })

  it('la richiesta del backup, una volta segnata come mostrata, non si ripropone', () => {
    const { service } = setup()
    expect(shouldShowBackupPrompt(service.get() as any)).toBe(true)
    const next = service.update({ backup_prompt_shown: true }) as any
    expect(next.backup_prompt_shown).toBe(1)
    expect(shouldShowBackupPrompt(next)).toBe(false)
  })

  it('scegliere la cartella di backup basta a non riproporla, anche senza il flag', () => {
    const { service } = setup()
    const next = service.update({ backup_folder: '/tmp/backup' }) as any
    expect(shouldShowBackupPrompt(next)).toBe(false)
  })

  it('cambiare un\'altra impostazione non tocca i due flag', () => {
    const { service } = setup()
    service.update({ todo_recap_enabled: false, backup_prompt_shown: true })
    const next = service.update({ theme: 'dark' }) as any
    expect(next.todo_recap_enabled).toBe(0)
    expect(next.backup_prompt_shown).toBe(1)
  })

  it('lo schema accetta booleani e rifiuta altri tipi', () => {
    expect(UpdateAppSettingsInput.safeParse({ todo_recap_enabled: false, backup_prompt_shown: true }).success).toBe(true)
    expect(UpdateAppSettingsInput.safeParse({ todo_recap_enabled: 'no' }).success).toBe(false)
  })
})
