import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations, getLatestMigrationVersion } from './migrations/runner'
import { backfillSceneTags } from './migrations/backfill-scene-tags'
import { recountWordsAndChars } from './migrations/recount-words'
import { getConfig } from '../config'

/** Versione della migrazione che introduce scene_tags (019_scene_tags.sql): se applicata solo ora, va ripopolata dal contenuto già esistente — vedi backfillSceneTags. */
const SCENE_TAGS_MIGRATION_VERSION = 19

/** Versione della migrazione-segnaposto 027_recount_words.sql: se applicata solo ora, word_count/char_count esistenti vanno ricalcolati — vedi recountWordsAndChars. */
const RECOUNT_WORDS_MIGRATION_VERSION = 27

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
  if (newlyApplied.includes(RECOUNT_WORDS_MIGRATION_VERSION)) {
    const { nodes, revisions } = recountWordsAndChars(db)
    console.log(`[db] conteggi ricalcolati (v0.4.2): ${nodes} scene, ${revisions} revisioni`)
  }

  return db
}

/** Ultima migrazione conosciuta da QUESTA versione dell'app (vedi getLatestMigrationVersion). */
export function getSupportedSchemaVersion(): number {
  return getLatestMigrationVersion(resolveMigrationsDir())
}

export function closeDb(): void {
  db?.close()
  db = null
}

/** Percorso del file SQLite corrente, usato dal servizio di backup. */
export function getDbPath(): string {
  if (!dbFilePath) throw new Error('Database not initialised yet: call initDb() first.')
  return dbFilePath
}
