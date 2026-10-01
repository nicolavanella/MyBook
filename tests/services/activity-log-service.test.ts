import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ActivityLogRepository } from '../../src/main/database/repositories/activity-log.repository'
import { SettingsRepository } from '../../src/main/database/repositories/settings.repository'
import { ActivityLogService } from '../../src/main/services/activity-log.service'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Romanzo')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  const settingsRepo = new SettingsRepository(db)
  const service = new ActivityLogService(new ActivityLogRepository(db), settingsRepo)
  return { db, service, settingsRepo }
}

describe('ActivityLogService (v0.3.5)', () => {
  it('è abilitato di default', () => {
    const { service } = setup()
    expect(service.isEnabled()).toBe(true)
  })

  it('non registra nulla se il progetto manca (operazione non legata a un progetto)', () => {
    const { db, service } = setup()
    service.log(null, 'scene', 'created', 'Senza progetto')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 0 })
  })

  it('rispetta il toggle activity_log_enabled: disattivato, non registra nulla', () => {
    const { db, service, settingsRepo } = setup()
    settingsRepo.update({ activity_log_enabled: 0 })
    service.log('p', 'scene', 'created', 'Scena 1')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 0 })
    expect(service.isEnabled()).toBe(false)
  })

  it('riattivato il toggle, torna a registrare', () => {
    const { db, service, settingsRepo } = setup()
    settingsRepo.update({ activity_log_enabled: 0 })
    service.log('p', 'scene', 'created', 'Ignorata')
    settingsRepo.update({ activity_log_enabled: 1 })
    service.log('p', 'scene', 'created', 'Registrata')
    const rows = db.prepare('SELECT entity_name FROM activity_log').all() as any[]
    expect(rows).toEqual([{ entity_name: 'Registrata' }])
  })

  it('getTodo/setTodo delegano al repository', () => {
    const { service } = setup()
    expect(service.getTodo('p')).toBe('')
    service.setTodo('p', '  Scrivere il finale  ')
    expect(service.getTodo('p')).toBe('Scrivere il finale') // il testo viene anche ripulito dagli spazi superflui
  })

  it('recap: include solo i progetti con voci di log, con titolo risolto e ToDo allegato', () => {
    const { service } = setup()
    service.log('p', 'chapter', 'created', 'Capitolo 1')
    service.setTodo('p', 'Rileggere il capitolo 1')
    const recap = service.recap((id) => (id === 'p' ? 'Romanzo' : undefined))
    expect(recap).toHaveLength(1)
    expect(recap[0]).toMatchObject({ projectId: 'p', projectTitle: 'Romanzo', todo: 'Rileggere il capitolo 1' })
    expect(recap[0].entries[0]).toMatchObject({ entity_type: 'chapter', action: 'created', entity_name: 'Capitolo 1' })
  })

  it('recap: vuoto se il registro è disabilitato, anche con voci già presenti', () => {
    const { service, settingsRepo } = setup()
    service.log('p', 'scene', 'created', 'Scena 1')
    settingsRepo.update({ activity_log_enabled: 0 })
    expect(service.recap(() => 'Romanzo')).toEqual([])
  })
})

describe('ActivityLogService.logOncePerDay (v0.3.8 — modifica del testo delle scene)', () => {
  it('la prima chiamata registra sempre, subito (nessuna soglia di attesa)', () => {
    const { db, service } = setup()
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 1 })
  })

  it('una seconda chiamata lo stesso giorno NON crea una nuova voce', () => {
    const { db, service } = setup()
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 1 })
  })

  it('un giorno diverso registra una nuova voce, anche se solo un istante prima era un giorno diverso', () => {
    const { db, service } = setup()
    // Inserisce direttamente una voce datata ieri (bypassando il default "now" della colonna), per non dipendere dall'orologio reale del test.
    db.prepare(
      `INSERT INTO activity_log (id, project_id, entity_type, action, entity_name, entity_id, details, created_at)
       VALUES ('old', 'p', 'scene', 'updated', 'Scena 1', 'scene-1', '', '2020-01-01T00:00:00.000Z')`
    ).run()
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 2 })
  })

  it('entità diverse non si influenzano a vicenda', () => {
    const { db, service } = setup()
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 2', 'scene-2')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 2 })
  })

  it('senza entityId non registra nulla (non ci sarebbe nulla da confrontare)', () => {
    const { db, service } = setup()
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', '')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 0 })
  })

  it('rispetta comunque il toggle activity_log_enabled', () => {
    const { db, service, settingsRepo } = setup()
    settingsRepo.update({ activity_log_enabled: 0 })
    service.logOncePerDay('p', 'scene', 'updated', 'Scena 1', 'scene-1')
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({ n: 0 })
  })
})
