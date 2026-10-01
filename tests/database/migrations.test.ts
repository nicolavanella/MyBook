import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'

describe('migration runner', () => {
  it('applica tutte le migrazioni e registra schema_migrations', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')

    const migrationsDir = path.join(__dirname, '../../database/migrations')
    runMigrations(db, migrationsDir)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('projects')
    expect(tables).toContain('document_nodes')
    expect(tables).toContain('document_revisions')
    expect(tables).toContain('mindmap_nodes')

    const applied = db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as any
    expect(applied.c).toBeGreaterThan(0)

    // Rieseguire non deve fallire né duplicare le migrazioni
    runMigrations(db, migrationsDir)
    const appliedAgain = db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as any
    expect(appliedAgain.c).toBe(applied.c)

    db.close()
  })
})
