import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'

const REMOVED_TABLES = [
  'entity_tags',
  'tags',
  'notes',
  'scene_characters',
  'scene_locations',
  'scene_objects',
  'scene_timeline_events',
  'document_changes',
  'change_log',
  'entity_revisions'
]

describe('015_drop_unused_tables — analisi DB (v0.3.3)', () => {
  it('rimuove tutte le tabelle mai utilizzate da alcuna funzionalità reale', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, path.join(__dirname, '../../database/migrations'))

    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    )
    for (const table of REMOVED_TABLES) {
      expect(existingTables.has(table), `${table} dovrebbe essere stata rimossa`).toBe(false)
    }
    db.close()
  })

  it('non tocca le tabelle realmente usate dall\'app', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, path.join(__dirname, '../../database/migrations'))

    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    )
    const stillPresent = [
      'projects', 'project_settings', 'document_nodes', 'document_revisions', 'document_snapshots',
      'characters', 'locations', 'objects', 'timelines', 'timeline_events',
      'mindmaps', 'mindmap_nodes', 'mindmap_edges', 'scene_comments', 'app_settings', 'schema_migrations'
    ]
    for (const table of stillPresent) {
      expect(existingTables.has(table), `${table} non dovrebbe essere stata rimossa`).toBe(true)
    }
    db.close()
  })
})
