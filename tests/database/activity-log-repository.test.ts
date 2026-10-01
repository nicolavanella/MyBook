import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { ActivityLogRepository } from '../../src/main/database/repositories/activity-log.repository'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  return { db, repo: new ActivityLogRepository(db) }
}

describe('ActivityLogRepository (v0.3.5)', () => {
  it('registra una voce e la rilegge, più recente per prima', () => {
    const { repo } = setup()
    repo.insert({ id: '1', project_id: 'p', entity_type: 'scene', action: 'created', entity_name: 'Scena 1', entity_id: '', details: '' })
    repo.insert({ id: '2', project_id: 'p', entity_type: 'scene', action: 'updated', entity_name: 'Scena 1', entity_id: '', details: '' })
    const entries = repo.recentForProject('p', 10)
    expect(entries.map((e) => e.id)).toEqual(['2', '1'])
    expect(entries[0]).toMatchObject({ entity_type: 'scene', action: 'updated', entity_name: 'Scena 1' })
    expect(entries[0].created_at).toBeTruthy()
  })

  it('recentForProject rispetta il limite richiesto', () => {
    const { repo } = setup()
    for (let i = 0; i < 5; i++) {
      repo.insert({ id: `id-${i}`, project_id: 'p', entity_type: 'scene', action: 'created', entity_name: `S${i}`, entity_id: '', details: '' })
    }
    expect(repo.recentForProject('p', 3)).toHaveLength(3)
  })

  it('recentProjectIds ordina i progetti per attività più recente', () => {
    const { db, repo } = setup()
    db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('q', 'Altro progetto')
    db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('q', '{}')
    repo.insert({ id: '1', project_id: 'p', entity_type: 'scene', action: 'created', entity_name: 'X', entity_id: '', details: '' })
    repo.insert({ id: '2', project_id: 'q', entity_type: 'scene', action: 'created', entity_name: 'Y', entity_id: '', details: '' })
    // 'q' ha la voce più recente (inserita per ultima): deve comparire per prima.
    expect(repo.recentProjectIds(10)).toEqual(['q', 'p'])
  })

  it('mantiene al più MAX_ENTRIES_PER_PROJECT righe per progetto, eliminando le più vecchie', () => {
    const { repo } = setup()
    for (let i = 0; i < 1005; i++) {
      repo.insert({ id: `id-${i}`, project_id: 'p', entity_type: 'scene', action: 'created', entity_name: `S${i}`, entity_id: '', details: '' })
    }
    const all = repo.recentForProject('p', 2000)
    expect(all.length).toBeLessThanOrEqual(1000)
    // Le più recenti (ultime inserite) devono essere sopravvissute alla pulizia.
    expect(all.map((e) => e.id)).toContain('id-1004')
    expect(all.map((e) => e.id)).not.toContain('id-0')
  })

  it('ToDo: salva, rilegge e sovrascrive per progetto', () => {
    const { repo } = setup()
    expect(repo.getTodo('p')).toBe('')
    repo.setTodo('p', 'Rivedere il capitolo 3')
    expect(repo.getTodo('p')).toBe('Rivedere il capitolo 3')
    repo.setTodo('p', 'Nuova nota')
    expect(repo.getTodo('p')).toBe('Nuova nota')
  })
})

describe('ActivityLogRepository.mostRecentTimestamp (v0.3.7)', () => {
  it('null se non ci sono voci per quella entità/azione', () => {
    const { repo } = setup()
    expect(repo.mostRecentTimestamp('scene-1', 'updated')).toBeNull()
  })

  it('null per entity_id vuoto (voci storiche pre-v0.3.7), anche se ce ne sono con entity_id vuoto in DB', () => {
    const { repo } = setup()
    repo.insert({ id: '1', project_id: 'p', entity_type: 'scene', action: 'updated', entity_name: 'Vecchia', entity_id: '', details: '' })
    expect(repo.mostRecentTimestamp('', 'updated')).toBeNull()
  })

  it('trova il timestamp più recente per la coppia (entity_id, action) esatta', () => {
    const { repo } = setup()
    repo.insert({ id: '1', project_id: 'p', entity_type: 'scene', action: 'updated', entity_name: 'Scena', entity_id: 'scene-1', details: '' })
    repo.insert({ id: '2', project_id: 'p', entity_type: 'scene', action: 'deleted', entity_name: 'Scena', entity_id: 'scene-1', details: '' })
    expect(repo.mostRecentTimestamp('scene-1', 'updated')).toBeTruthy()
    expect(repo.mostRecentTimestamp('scene-2', 'updated')).toBeNull()
  })
})
