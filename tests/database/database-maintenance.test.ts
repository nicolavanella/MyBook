import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runMigrations, getLatestMigrationVersion } from '../../src/main/database/migrations/runner'
import {
  clearDatabase,
  getDatabaseStatus,
  PRE_RESTORE_SUFFIX,
  replaceDatabaseFile,
  resetDatabaseFile,
  validateBackup
} from '../../src/main/database/database-maintenance'
import { tm } from '../../src/main/i18n'

const MIGRATIONS = path.join(__dirname, '../../database/migrations')
const LATEST = getLatestMigrationVersion(MIGRATIONS)

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mybook-maint-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Crea un vero file database MyBook con un progetto riconoscibile dal titolo, poi lo chiude. */
function makeDb(name: string, projectTitle: string, opts: { extraVersion?: number } = {}): string {
  const file = path.join(dir, name)
  const db = new Database(file)
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', projectTitle)
  if (opts.extraVersion) db.prepare("INSERT INTO schema_migrations (version,name) VALUES (?, 'futura.sql')").run(opts.extraVersion)
  db.close()
  return file
}

/** Titolo del progetto salvato in un file database (apre e richiude, in sola lettura). */
function titleIn(file: string): string {
  const db = new Database(file, { readonly: true })
  try {
    return (db.prepare('SELECT title FROM projects').get() as { title: string }).title
  } finally {
    db.close()
  }
}

describe('getDatabaseStatus / clearDatabase', () => {
  it('elenca le tabelle con il numero di record', () => {
    const file = makeDb('a.db', 'Romanzo')
    const db = new Database(file)
    const status = getDatabaseStatus(db)
    expect(status.find((t) => t.name === 'projects')?.records).toBe(1)
    expect(status.find((t) => t.name === 'schema_migrations')?.records).toBe(LATEST)
    db.close()
  })

  it('clearDatabase svuota i dati ma conserva schema_migrations e app_settings, e riattiva le chiavi esterne', () => {
    const file = makeDb('a.db', 'Romanzo')
    const db = new Database(file)
    db.pragma('foreign_keys = ON')
    const settingsBefore = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n
    clearDatabase(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: LATEST })
    expect(db.prepare('SELECT COUNT(*) AS n FROM app_settings').get()).toEqual({ n: settingsBefore })
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})

describe('validateBackup', () => {
  it('accetta un database MyBook integro', () => {
    expect(() => validateBackup(makeDb('b.db', 'X'))).not.toThrow()
    expect(() => validateBackup(makeDb('c.db', 'X'), LATEST)).not.toThrow()
  })

  it('rifiuta file mancanti, cartelle e file che non sono un database', () => {
    expect(() => validateBackup(path.join(dir, 'non-esiste.db'))).toThrow(tm('maintenance.backupNotFound'))
    expect(() => validateBackup(dir)).toThrow(tm('maintenance.notAFile'))
    const text = path.join(dir, 'testo.db')
    fs.writeFileSync(text, 'questo non è un database SQLite, solo testo molto lungo '.repeat(50))
    expect(() => validateBackup(text)).toThrow()
  })

  it('rifiuta un database SQLite valido che non è di MyBook', () => {
    const other = path.join(dir, 'altro.db')
    const db = new Database(other)
    db.exec('CREATE TABLE cose (a TEXT)')
    db.close()
    expect(() => validateBackup(other)).toThrow(tm('maintenance.notMyBookDb'))
  })

  it('v0.4.2: rifiuta un backup creato da una versione PIÙ RECENTE dell\'app', () => {
    const future = makeDb('futuro.db', 'X', { extraVersion: LATEST + 5 })
    expect(() => validateBackup(future, LATEST)).toThrow(tm('maintenance.backupTooNew'))
    expect(() => validateBackup(future)).not.toThrow() // senza limite dichiarato non si controlla
  })

  it('un backup con meno migrazioni (versione più vecchia) è accettato: le migrazioni lo aggiorneranno all\'avvio', () => {
    const file = path.join(dir, 'vecchio.db')
    const db = new Database(file)
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT)')
    db.prepare("INSERT INTO schema_migrations (version,name) VALUES (1,'001.sql')").run()
    db.close()
    expect(() => validateBackup(file, LATEST)).not.toThrow()
  })
})

describe('replaceDatabaseFile — sostituzione sicura (v0.4.2)', () => {
  it('sostituisce il database, conserva quello vecchio come copia di sicurezza e non lascia temporanei', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    const backup = makeDb('backup.db', 'DAL BACKUP')

    const safety = replaceDatabaseFile(current, backup, LATEST)

    expect(titleIn(current)).toBe('DAL BACKUP')
    expect(safety).toBe(current + PRE_RESTORE_SUFFIX)
    expect(titleIn(safety as string)).toBe('ATTUALE') // il vecchio database è recuperabile
    expect(fs.existsSync(current + '.restoring')).toBe(false)
    expect(titleIn(backup)).toBe('DAL BACKUP') // il file di backup non è stato toccato né spostato
  })

  it('i file -wal/-shm del database sostituito si mettono da parte, non restano accanto al nuovo database', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    fs.writeFileSync(current + '-wal', 'wal-vecchio')
    fs.writeFileSync(current + '-shm', 'shm-vecchio')
    const backup = makeDb('backup.db', 'DAL BACKUP')

    replaceDatabaseFile(current, backup)

    expect(fs.existsSync(current + '-wal')).toBe(false)
    expect(fs.existsSync(current + '-shm')).toBe(false)
    expect(fs.readFileSync(current + PRE_RESTORE_SUFFIX + '-wal', 'utf-8')).toBe('wal-vecchio')
  })

  it('tiene UNA sola copia di sicurezza: il ripristino successivo sovrascrive la precedente, anche i suoi -wal/-shm', () => {
    const current = makeDb('mybook.db', 'PRIMO')
    fs.writeFileSync(current + '-wal', 'wal-del-primo')
    replaceDatabaseFile(current, makeDb('b1.db', 'SECONDO'))
    expect(fs.existsSync(current + PRE_RESTORE_SUFFIX + '-wal')).toBe(true)

    replaceDatabaseFile(current, makeDb('b2.db', 'TERZO'))

    expect(titleIn(current)).toBe('TERZO')
    expect(titleIn(current + PRE_RESTORE_SUFFIX)).toBe('SECONDO')
    expect(fs.existsSync(current + PRE_RESTORE_SUFFIX + '-wal')).toBe(false) // il -wal del PRIMO non deve restare accanto al database del SECONDO
  })

  it('senza un database attuale (es. dopo un reset) ripristina comunque e ritorna null', () => {
    const current = path.join(dir, 'mybook.db')
    const backup = makeDb('backup.db', 'DAL BACKUP')
    expect(replaceDatabaseFile(current, backup)).toBeNull()
    expect(titleIn(current)).toBe('DAL BACKUP')
  })

  it('REGRESSIONE: un backup non valido NON tocca il database attuale', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    const bad = path.join(dir, 'rotto.db')
    fs.writeFileSync(bad, 'non è un database '.repeat(100))

    expect(() => replaceDatabaseFile(current, bad)).toThrow()

    expect(titleIn(current)).toBe('ATTUALE')
    expect(fs.existsSync(current + PRE_RESTORE_SUFFIX)).toBe(false)
    expect(fs.existsSync(current + '.restoring')).toBe(false)
  })

  it('un backup di una versione più recente è rifiutato e il database attuale resta intatto', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    const future = makeDb('futuro.db', 'DAL FUTURO', { extraVersion: LATEST + 1 })
    expect(() => replaceDatabaseFile(current, future, LATEST)).toThrow(tm('maintenance.backupTooNew'))
    expect(titleIn(current)).toBe('ATTUALE')
  })

  it('rifiuta di sostituire il database con se stesso', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    expect(() => replaceDatabaseFile(current, current)).toThrow(tm('maintenance.sameAsActive'))
    expect(titleIn(current)).toBe('ATTUALE')
  })

  it('REGRESSIONE: se la copia fallisce (es. disco pieno) il database attuale resta intatto', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    const backup = makeDb('backup.db', 'DAL BACKUP')
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device')
    })

    expect(() => replaceDatabaseFile(current, backup)).toThrow(/ENOSPC/)

    vi.restoreAllMocks()
    expect(titleIn(current)).toBe('ATTUALE')
    expect(fs.existsSync(current + PRE_RESTORE_SUFFIX)).toBe(false)
    expect(fs.existsSync(current + '.restoring')).toBe(false)
  })

  it('REGRESSIONE: se la sostituzione fallisce all\'ultimo passo, i file messi da parte tornano al loro posto', () => {
    const current = makeDb('mybook.db', 'ATTUALE')
    fs.writeFileSync(current + '-wal', 'wal-attuale')
    const backup = makeDb('backup.db', 'DAL BACKUP')
    const realRename = fs.renameSync
    // Fallisce proprio il passo che mette il database ripristinato al posto di quello attuale.
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(from).endsWith('.restoring')) throw new Error('EBUSY: resource busy or locked')
      return realRename(from, to)
    })

    expect(() => replaceDatabaseFile(current, backup)).toThrow(tm('maintenance.restoreFailed', { detail: 'EBUSY: resource busy or locked' }))

    vi.restoreAllMocks()
    expect(titleIn(current)).toBe('ATTUALE') // database di prima, leggibile
    expect(fs.readFileSync(current + '-wal', 'utf-8')).toBe('wal-attuale') // anche il suo -wal è tornato
    expect(fs.existsSync(current + PRE_RESTORE_SUFFIX)).toBe(false)
    expect(fs.existsSync(current + PRE_RESTORE_SUFFIX + '-wal')).toBe(false)
    expect(fs.existsSync(current + '.restoring')).toBe(false)
  })
})

describe('resetDatabaseFile', () => {
  it('elimina il database e i suoi -wal/-shm', () => {
    const current = makeDb('mybook.db', 'X')
    fs.writeFileSync(current + '-wal', 'w')
    fs.writeFileSync(current + '-shm', 's')
    resetDatabaseFile(current)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('non fallisce se i file non esistono', () => {
    expect(() => resetDatabaseFile(path.join(dir, 'non-esiste.db'))).not.toThrow()
  })
})
