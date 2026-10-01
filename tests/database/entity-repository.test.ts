import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { EntityRepository } from '../../src/main/database/repositories/entity.repository'

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  return db
}

describe('EntityRepository — colore e raggruppamento (v0.2.9)', () => {
  it('characters: consente di impostare colore e gruppo', () => {
    const db = database()
    const repo = new EntityRepository(db, 'characters')
    repo.insert({ id: 'c1', project_id: 'p', name: 'Aria' })
    repo.update('c1', { color: '#ff0000', group_name: 'Protagonisti' })
    const row = repo.findById('c1') as any
    expect(row.color).toBe('#ff0000')
    expect(row.group_name).toBe('Protagonisti')
  })

  it('characters: colore e gruppo sono vuoti di default (nessuna migrazione a metà)', () => {
    const db = database()
    const repo = new EntityRepository(db, 'characters')
    repo.insert({ id: 'c1', project_id: 'p', name: 'Aria' })
    const row = repo.findById('c1') as any
    expect(row.color).toBe('')
    expect(row.group_name).toBe('')
  })

  it('locations: consente colore e gruppo', () => {
    const db = database()
    const repo = new EntityRepository(db, 'locations')
    repo.insert({ id: 'l1', project_id: 'p', name: 'Torre Nera' })
    repo.update('l1', { color: '#00ff00', group_name: 'Interni' })
    const row = repo.findById('l1') as any
    expect(row.color).toBe('#00ff00')
    expect(row.group_name).toBe('Interni')
  })

  it('objects: consente colore e gruppo', () => {
    const db = database()
    const repo = new EntityRepository(db, 'objects')
    repo.insert({ id: 'o1', project_id: 'p', name: 'Spada' })
    repo.update('o1', { color: '#0000ff', group_name: 'Armi' })
    const row = repo.findById('o1') as any
    expect(row.color).toBe('#0000ff')
    expect(row.group_name).toBe('Armi')
  })

  it('rifiuta un campo non consentito anche dopo l\'aggiunta di color/group_name', () => {
    const db = database()
    const repo = new EntityRepository(db, 'characters')
    repo.insert({ id: 'c1', project_id: 'p', name: 'Aria' })
    expect(() => repo.update('c1', { not_a_real_column: 'x' })).toThrow()
  })
})
