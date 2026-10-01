// =============================================================================
// MyBook — scripts/db-migrate.ts
// Esegue le migrazioni SQL su un database SQLite locale, fuori da Electron.
// Utile in CI, in setup iniziale, o per ispezionare lo schema senza avviare l'app.
// Uso: npm run db:migrate  (usa un percorso di default in ./dev-data/mybook.db)
//      MYBOOK_DB_PATH=/percorso/custom.db npm run db:migrate
// =============================================================================
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from '../src/main/database/migrations/runner'

const dbPath = process.env.MYBOOK_DB_PATH ?? path.join(process.cwd(), 'dev-data', 'mybook.db')
const migrationsDir = path.join(process.cwd(), 'database', 'migrations')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

console.log(`[db-migrate] database: ${dbPath}`)
console.log(`[db-migrate] migrazioni da: ${migrationsDir}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')

runMigrations(db, migrationsDir)

db.close()
console.log('[db-migrate] completato.')
