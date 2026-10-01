import type Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Applica tutte le migrazioni SQL non ancora eseguite, in ordine numerico.
 * I file devono chiamarsi "NNN_nome.sql" (es. 001_initial_schema.sql).
 * Ogni migrazione è immutabile una volta rilasciata: aggiungerne di nuove,
 * mai modificare quelle già applicate in produzione.
 *
 * Ritorna i NUMERI delle migrazioni applicate in QUESTA chiamata (non tutte
 * quelle già presenti da prima): serve a db.ts per lanciare, una tantum e
 * solo quando serve davvero, il ripopolamento di scene_tags subito dopo la
 * migrazione 019 (v0.3.8) — vedi backfillSceneTags.
 */
export function runMigrations(db: Database.Database, migrationsDir: string): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)

  const appliedVersions = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r: any) => r.version as number)
  )

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
  )

  const newlyApplied: number[] = []
  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10)
    if (appliedVersions.has(version)) continue

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    const applyMigration = db.transaction(() => {
      db.exec(sql)
      insertMigration.run(version, file)
    })
    applyMigration()
    newlyApplied.push(version)
    console.log(`[db] migrazione applicata: ${file}`)
  }
  return newlyApplied
}
