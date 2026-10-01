import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

/**
 * Forma di config/database.yml. Tenuta in sync a mano con il file YAML —
 * se aggiungi una chiave la aggiungi qui e nei default qui sotto.
 */
export interface AppConfig {
  database: {
    filename: string
    dataSubdir: string
    pragmas: {
      foreignKeys: 'ON' | 'OFF'
      journalMode: string
      synchronous: string
      busyTimeoutMs: number
    }
  }
  autosave: {
    debounceMs: number
  }
  versioning: {
    revisionAfterIdleMs: number
    revisionAfterNChanges: number
    snapshotEveryNRevisions: number
    forceRevisionOn: string[]
  }
  migrations: {
    directory: string
    table: string
  }
}

/** Usati solo se config/database.yml manca o è malformato — non dovrebbero mai servire in pratica. */
const DEFAULTS: AppConfig = {
  database: {
    filename: 'mybook.db',
    dataSubdir: 'MyBook/data',
    pragmas: { foreignKeys: 'ON', journalMode: 'WAL', synchronous: 'NORMAL', busyTimeoutMs: 5000 }
  },
  autosave: { debounceMs: 800 },
  versioning: {
    revisionAfterIdleMs: 30000,
    revisionAfterNChanges: 100,
    snapshotEveryNRevisions: 20,
    forceRevisionOn: ['document_change', 'app_close', 'manual_request']
  },
  migrations: { directory: 'database/migrations', table: 'schema_migrations' }
}

/**
 * Risolve config/database.yml sia in sviluppo (repo root) sia in produzione
 * (resources/config, copiato da electron-builder tramite extraResources —
 * vedi electron-builder.yml).
 */
function resolveConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'config', 'database.yml')
  }
  return path.join(__dirname, '../../config/database.yml')
}

function fromYaml(raw: any): AppConfig {
  return {
    database: {
      filename: raw?.database?.filename ?? DEFAULTS.database.filename,
      dataSubdir: raw?.database?.data_subdir ?? DEFAULTS.database.dataSubdir,
      pragmas: {
        foreignKeys: raw?.database?.pragmas?.foreign_keys ?? DEFAULTS.database.pragmas.foreignKeys,
        journalMode: raw?.database?.pragmas?.journal_mode ?? DEFAULTS.database.pragmas.journalMode,
        synchronous: raw?.database?.pragmas?.synchronous ?? DEFAULTS.database.pragmas.synchronous,
        busyTimeoutMs:
          raw?.database?.pragmas?.busy_timeout_ms ?? DEFAULTS.database.pragmas.busyTimeoutMs
      }
    },
    autosave: {
      debounceMs: raw?.autosave?.debounce_ms ?? DEFAULTS.autosave.debounceMs
    },
    versioning: {
      revisionAfterIdleMs:
        raw?.versioning?.revision_after_idle_ms ?? DEFAULTS.versioning.revisionAfterIdleMs,
      revisionAfterNChanges:
        raw?.versioning?.revision_after_n_changes ?? DEFAULTS.versioning.revisionAfterNChanges,
      snapshotEveryNRevisions:
        raw?.versioning?.snapshot_every_n_revisions ?? DEFAULTS.versioning.snapshotEveryNRevisions,
      forceRevisionOn: raw?.versioning?.force_revision_on ?? DEFAULTS.versioning.forceRevisionOn
    },
    migrations: {
      directory: raw?.migrations?.directory ?? DEFAULTS.migrations.directory,
      table: raw?.migrations?.table ?? DEFAULTS.migrations.table
    }
  }
}

let cached: AppConfig | null = null

/** Carica (una sola volta) config/database.yml. In caso di errore, usa i default e avvisa in console. */
export function getConfig(): AppConfig {
  if (cached) return cached

  const configPath = resolveConfigPath()
  try {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8'))
    cached = fromYaml(raw)
  } catch (err) {
    console.warn(
      `[config] impossibile leggere ${configPath}, uso i valori di default. Motivo:`,
      (err as Error).message
    )
    cached = DEFAULTS
  }
  return cached
}
