import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from './migrations/runner'
import { backfillSceneTags } from './migrations/backfill-scene-tags'
import { getConfig } from '../config'

/** Versione della migrazione che introduce scene_tags (019_scene_tags.sql): se applicata solo ora, va ripopolata dal contenuto già esistente — vedi backfillSceneTags. */
const SCENE_TAGS_MIGRATION_VERSION = 19

let db: Database.Database | null = null
let dbFilePath: string | null = null

/**
 * Risolve la cartella delle migrazioni sia in sviluppo (repo root/database/migrations)
 * sia in produzione (resources/database/migrations, copiata da electron-builder
 * tramite extraResources — vedi electron-builder.yml). La sottocartella è
 * configurabile via config/database.yml -> migrations.directory.
 */
function resolveMigrationsDir(): string {
  const { directory } = getConfig().migrations
  if (app.isPackaged) {
    return path.join(process.resourcesPath, directory)
  }
  return path.join(__dirname, '../../', directory)
}

/**
 * Il file database NON risiede nella cartella di installazione (sezione 11):
 * viene creato in <userData>/<dataSubdir>/<filename> — entrambi configurabili
 * via config/database.yml.
 */
function resolveDbPath(): string {
  const { filename, dataSubdir } = getConfig().database
  const userDataPath = app.getPath('userData')
  const dataDir = path.join(userDataPath, dataSubdir)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, filename)
}

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = resolveDbPath()
  dbFilePath = dbPath
  db = new Database(dbPath)

  // Pragma da config/database.yml (sezione 11 del documento di architettura)
  const { pragmas } = getConfig().database
  db.pragma(`foreign_keys = ${pragmas.foreignKeys}`)
  db.pragma(`journal_mode = ${pragmas.journalMode}`)
  db.pragma(`synchronous = ${pragmas.synchronous}`)
  db.pragma(`busy_timeout = ${pragmas.busyTimeoutMs}`)

  const newlyApplied = runMigrations(db, resolveMigrationsDir())
  if (newlyApplied.includes(SCENE_TAGS_MIGRATION_VERSION)) {
    backfillSceneTags(db)
  }

  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

/** Percorso del file SQLite corrente, usato dal servizio di backup. */
export function getDbPath(): string {
  if (!dbFilePath) throw new Error('Database non ancora inizializzato: chiamare getDb() prima.')
  return dbFilePath
}
