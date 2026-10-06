import Database from 'better-sqlite3'
import fs from 'node:fs'
import { tm } from '../i18n'

const PRESERVED_TABLES = new Set(['schema_migrations', 'app_settings'])

export function getDatabaseStatus(db: Database.Database) {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[]
  return tables.map(({ name }) => {
    const row = db.prepare(`SELECT COUNT(*) as count FROM "${name.replace(/"/g, '""')}"`).get() as { count: number }
    return { name, records: Number(row.count) }
  })
}

export function clearDatabase(db: Database.Database): void {
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
    .map((r) => r.name).filter((name) => !PRESERVED_TABLES.has(name))
  db.pragma('foreign_keys = OFF')
  try {
    const tx = db.transaction(() => {
      for (const name of tables) db.prepare(`DELETE FROM "${name.replace(/"/g, '""')}"`).run()
    })
    tx()
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

export function validateBackup(filePath: string): void {
  if (!fs.existsSync(filePath)) throw new Error(tm('maintenance.backupNotFound'))
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error(tm('maintenance.notAFile'))
  const testDb = new Database(filePath, { readonly: true })
  try {
    const integrity = testDb.pragma('integrity_check', { simple: true }) as string
    if (integrity !== 'ok') throw new Error(tm('maintenance.integrityFailed'))
    const schema = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    if (!schema) throw new Error(tm('maintenance.notMyBookDb'))
  } finally { testDb.close() }
}

export function replaceDatabaseFile(currentPath: string, backupPath: string): void {
  if (fs.realpathSync(currentPath) === fs.realpathSync(backupPath)) throw new Error(tm('maintenance.sameAsActive'))
  validateBackup(backupPath)
  for (const suffix of ['', '-wal', '-shm']) {
    const target = currentPath + suffix
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }
  fs.copyFileSync(backupPath, currentPath)
}

export function resetDatabaseFile(currentPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = currentPath + suffix
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }
}
