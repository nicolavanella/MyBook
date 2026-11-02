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

/**
 * Verifica che `filePath` sia un database MyBook integro e utilizzabile.
 * `maxSupportedVersion` (v0.4.2): se indicata, un backup con migrazioni PIÙ
 * recenti di quelle note all'app viene rifiutato (creato da una versione
 * successiva di MyBook).
 */
export function validateBackup(filePath: string, maxSupportedVersion?: number): void {
  if (!fs.existsSync(filePath)) throw new Error(tm('maintenance.backupNotFound'))
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error(tm('maintenance.notAFile'))
  const testDb = new Database(filePath, { readonly: true })
  try {
    const integrity = testDb.pragma('integrity_check', { simple: true }) as string
    if (integrity !== 'ok') throw new Error(tm('maintenance.integrityFailed'))
    const schema = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    if (!schema) throw new Error(tm('maintenance.notMyBookDb'))
    if (maxSupportedVersion !== undefined) {
      const row = testDb.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
      if ((row.v ?? 0) > maxSupportedVersion) throw new Error(tm('maintenance.backupTooNew'))
    }
  } finally { testDb.close() }
}

/** I tre file che compongono un database SQLite in modalità WAL. */
const DB_FILE_SUFFIXES = ['', '-wal', '-shm']

/** Suffisso della copia di sicurezza del database sostituito da un ripristino. */
export const PRE_RESTORE_SUFFIX = '.pre-restore'

/**
 * Sostituisce il database attivo con un backup, SENZA mai lasciare la
 * persona senza database (v0.4.2).
 *
 * Fino alla 0.4.1 i file attivi venivano cancellati PRIMA di copiare il
 * backup: un errore a metà (disco pieno, permessi, file bloccato)
 * lasciava l'app senza database. Ora l'ordine è, per costruzione, il più
 * sicuro possibile:
 *   1. si controlla il backup (integrità, appartenenza a MyBook, versione);
 *   2. lo si copia in un file temporaneo accanto al database e si ricontrolla
 *      la COPIA (intercetta una copia troncata) — finora il database attivo
 *      non è stato toccato;
 *   3. i file attivi NON si cancellano: si rinominano in "<db>.pre-restore"
 *      (una sola copia di sicurezza, sovrascritta al ripristino successivo);
 *   4. il temporaneo prende il posto del database.
 * Se un passo dal 3 in poi fallisce, i file messi da parte tornano al loro
 * posto e l'errore viene rilanciato: il database attuale resta quello di prima.
 *
 * Il database deve essere già chiuso (closeDb) quando si chiama questa funzione.
 * Ritorna il percorso della copia di sicurezza (null se non c'era un database da salvare).
 */
export function replaceDatabaseFile(currentPath: string, backupPath: string, maxSupportedVersion?: number): string | null {
  if (fs.existsSync(currentPath) && fs.realpathSync(currentPath) === fs.realpathSync(backupPath)) throw new Error(tm('maintenance.sameAsActive'))
  validateBackup(backupPath, maxSupportedVersion)

  const tempPath = currentPath + '.restoring'
  const safetyPath = currentPath + PRE_RESTORE_SUFFIX
  const movedAside: Array<{ original: string; safety: string }> = []
  try {
    fs.copyFileSync(backupPath, tempPath)
    validateBackup(tempPath, maxSupportedVersion)

    // Una sola copia di sicurezza: si eliminano le tre della volta scorsa (quelle del
    // ripristino precedente), mai i file attivi.
    for (const suffix of DB_FILE_SUFFIXES) {
      if (fs.existsSync(safetyPath + suffix)) fs.unlinkSync(safetyPath + suffix)
    }
    for (const suffix of DB_FILE_SUFFIXES) {
      if (!fs.existsSync(currentPath + suffix)) continue
      fs.renameSync(currentPath + suffix, safetyPath + suffix)
      movedAside.push({ original: currentPath + suffix, safety: safetyPath + suffix })
    }
    fs.renameSync(tempPath, currentPath)
  } catch (error) {
    // Rollback: ciò che era stato messo da parte torna al suo posto.
    for (const { original, safety } of movedAside.reverse()) {
      try {
        fs.renameSync(safety, original)
      } catch (rollbackError) {
        console.error('[restore] rollback incompleto per', original, rollbackError)
      }
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {
      /* il temporaneo orfano non è dannoso: verrà sovrascritto al prossimo tentativo */
    }
    // Gli errori della validazione INIZIALE (backup non valido, troppo recente...) sono lanciati prima
    // di questo blocco e arrivano alla persona con il loro messaggio; qui si incapsula ciò che può
    // andare storto durante la copia e la sostituzione dei file.
    throw new Error(tm('maintenance.restoreFailed', { detail: error instanceof Error ? error.message : String(error) }))
  }
  return movedAside.length > 0 ? safetyPath : null
}

export function resetDatabaseFile(currentPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = currentPath + suffix
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }
}
