import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { TimelineRepository } from '../../src/main/database/repositories/timeline.repository'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  const repo = new TimelineRepository(db)
  const timeline = repo.createTimeline('p', 'Timeline principale') as any
  return { db, repo, timelineId: timeline.id as string }
}

describe('TimelineRepository.updateEvent — fix v0.2.10 (colore non applicato)', () => {
  it('applica il colore a un evento esistente', () => {
    const { db, repo, timelineId } = setup()
    const event = repo.createEvent('p', timelineId, 'Battaglia finale') as any
    repo.updateEvent(event.id, { color: '#ff8800' })
    const updated = db.prepare('SELECT color FROM timeline_events WHERE id = ?').get(event.id) as any
    expect(updated.color).toBe('#ff8800')
  })

  it('continua ad aggiornare gli altri campi già supportati', () => {
    const { db, repo, timelineId } = setup()
    const event = repo.createEvent('p', timelineId, 'Battaglia finale') as any
    repo.updateEvent(event.id, { title: 'Nuovo titolo', event_date: 'Anno 1200', description: 'Descrizione', color: '#00ff00' })
    const updated = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(event.id) as any
    expect(updated.title).toBe('Nuovo titolo')
    expect(updated.event_date).toBe('Anno 1200')
    expect(updated.description).toBe('Descrizione')
    expect(updated.color).toBe('#00ff00')
  })

  it('rifiuta ancora un campo non consentito', () => {
    const { repo, timelineId } = setup()
    const event = repo.createEvent('p', timelineId, 'Evento') as any
    expect(() => repo.updateEvent(event.id, { not_a_real_column: 'x' })).toThrow()
  })
})

describe('TimelineRepository — Data da calendario (v0.3.4, migrazione 016)', () => {
  it('un nuovo evento parte senza data (stringa vuota)', () => {
    const { repo, timelineId } = setup()
    const event = repo.createEvent('p', timelineId, 'Evento') as any
    expect(event.calendar_date).toBe('')
  })

  it('salva e rilegge calendar_date, indipendente dalla data narrativa', () => {
    const { db, repo, timelineId } = setup()
    const event = repo.createEvent('p', timelineId, 'Evento') as any
    repo.updateEvent(event.id, { calendar_date: '2026-09-21', event_date: 'Anno 1200' })
    const row = db.prepare('SELECT calendar_date, event_date FROM timeline_events WHERE id = ?').get(event.id) as any
    expect(row).toEqual({ calendar_date: '2026-09-21', event_date: 'Anno 1200' })
    repo.updateEvent(event.id, { calendar_date: '' }) // rimozione
    expect((db.prepare('SELECT calendar_date FROM timeline_events WHERE id = ?').get(event.id) as any).calendar_date).toBe('')
  })

  it('la migrazione 016 preserva gli eventi già esistenti (default vuoto)', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const dir = path.join(__dirname, '../../database/migrations')
    // Simula un database v0.3.3: applica solo le migrazioni fino alla 015 in una cartella temporanea.
    const fs = require('node:fs') as typeof import('node:fs')
    const os = require('node:os') as typeof import('node:os')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'))
    for (const f of fs.readdirSync(dir).filter((n) => parseInt(n) <= 15)) fs.copyFileSync(path.join(dir, f), path.join(tmp, f))
    runMigrations(db, tmp)
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
    db.prepare('INSERT INTO timelines (id,project_id,name) VALUES (?,?,?)').run('t', 'p', 'T')
    db.prepare("INSERT INTO timeline_events (id,project_id,timeline_id,title,event_date) VALUES ('e','p','t','Vecchio','Anno 5')").run()
    runMigrations(db, dir) // ora applica la 016
    const row = db.prepare('SELECT title, event_date, calendar_date FROM timeline_events WHERE id = ?').get('e') as any
    expect(row).toEqual({ title: 'Vecchio', event_date: 'Anno 5', calendar_date: '' })
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
