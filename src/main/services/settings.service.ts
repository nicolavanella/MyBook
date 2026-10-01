import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { SettingsRepository } from '../database/repositories/settings.repository'
import type { UpdateAppSettingsInput } from '@shared/schemas/settings.schema'

/** Minuti corrispondenti a ciascuna frequenza di backup automatico "a intervallo" (vedi migrazione 008). */
const FREQUENCY_MINUTES: Record<string, number> = { '30min': 30, '60min': 60, '120min': 120, '240min': 240 }
const BACKUP_FILE_PREFIX = 'mybook-backup-'

export class SettingsService {
  /** In memoria, non persistito: al riavvio dell'app riparte il conteggio, nel peggiore dei casi un backup automatico in anticipo. Non grave. */
  private lastAutoBackupAt = Date.now()

  constructor(
    private repo: SettingsRepository,
    private dbPath: string,
    private db: Database.Database
  ) {}

  get() {
    const row = this.repo.get() as any
    if (!row) return row
    let toolbarTools: unknown = []
    let sidebarTools: unknown = ['characters','locations','objects','timeline','mindmap']
    let dictionaryLanguages: unknown = ['it-IT', 'en-US']
    try { toolbarTools = JSON.parse(row.editor_toolbar_tools || '[]') } catch { toolbarTools = [] }
    try { sidebarTools = JSON.parse(row.sidebar_visible_tools || '[]') } catch { sidebarTools = ['characters','locations','objects','timeline','mindmap'] }
    try { dictionaryLanguages = JSON.parse(row.dictionary_languages || '[]') } catch { dictionaryLanguages = [] }
    return { ...row, editor_toolbar_tools: toolbarTools, sidebar_visible_tools: sidebarTools, dictionary_languages: dictionaryLanguages }
  }

  update(input: UpdateAppSettingsInput) {
    const patch: Record<string, unknown> = { ...input }
    if (typeof input.backup_enabled === 'boolean') {
      patch.backup_enabled = input.backup_enabled ? 1 : 0
    }
    if (typeof input.spellcheck_enabled === 'boolean') {
      patch.spellcheck_enabled = input.spellcheck_enabled ? 1 : 0
    }
    if (typeof input.tags_enabled === 'boolean') {
      patch.tags_enabled = input.tags_enabled ? 1 : 0
    }
    if (typeof input.comments_enabled === 'boolean') {
      patch.comments_enabled = input.comments_enabled ? 1 : 0
    }
    if (typeof input.revisions_enabled === 'boolean') {
      patch.revisions_enabled = input.revisions_enabled ? 1 : 0
    }
    if (typeof input.activity_log_enabled === 'boolean') {
      patch.activity_log_enabled = input.activity_log_enabled ? 1 : 0
    }
    if (input.editor_toolbar_tools) {
      patch.editor_toolbar_tools = JSON.stringify(input.editor_toolbar_tools)
    }
    if (input.sidebar_visible_tools) {
      patch.sidebar_visible_tools = JSON.stringify(input.sidebar_visible_tools)
    }
    if (input.dictionary_languages) {
      patch.dictionary_languages = JSON.stringify(input.dictionary_languages)
    }
    this.repo.update(patch)
    return this.get()
  }

  /**
   * Esegue un checkpoint WAL e copia il file SQLite autosufficiente nella cartella
   * di backup configurata, evitando di richiedere file WAL/SHM separati.
   * con timestamp nel nome. Usata sia dal pulsante "Backup ora" sia
   * automaticamente alla chiusura o a intervallo (vedi runScheduledBackupIfDue).
   * Dopo il backup, applica il limite "Num. max backup" eliminando i file più
   * vecchi in eccesso.
   */
  backupNow(): { ok: true; path: string } | { ok: false; reason: string } {
    const settings = this.repo.get() as any
    if (!settings?.backup_folder) {
      return { ok: false, reason: 'Nessuna cartella di backup configurata.' }
    }
    if (!fs.existsSync(settings.backup_folder)) {
      return { ok: false, reason: 'La cartella di backup configurata non esiste.' }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const destName = `${BACKUP_FILE_PREFIX}${timestamp}.db`
    const destPath = path.join(settings.backup_folder, destName)

    // Checkpoint completo: il backup resta un singolo file SQLite autosufficiente.
    // Le immagini inserite negli editor sono salvate come data URL (base64)
    // direttamente nel contenuto di capitoli/scene (vedi media.service.ts),
    // quindi sono già incluse in questo singolo file: nessuna cartella
    // separata da copiare a parte.
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    fs.copyFileSync(this.dbPath, destPath)
    this.lastAutoBackupAt = Date.now()

    this.pruneOldBackups(settings.backup_folder, settings.backup_max_count ?? 10)

    return { ok: true, path: destPath }
  }

  /** Elimina i backup più vecchi oltre il limite configurato (ordinati per nome, che incorpora il timestamp ISO e quindi ordina cronologicamente). */
  private pruneOldBackups(folder: string, maxCount: number): void {
    if (!Number.isFinite(maxCount) || maxCount < 1) return
    let files: string[]
    try {
      files = fs
        .readdirSync(folder)
        .filter((f) => f.startsWith(BACKUP_FILE_PREFIX) && f.endsWith('.db'))
        .sort()
    } catch {
      return // cartella non leggibile: non blocca il backup appena fatto
    }
    const excess = files.length - maxCount
    if (excess <= 0) return
    for (const file of files.slice(0, excess)) {
      try {
        fs.unlinkSync(path.join(folder, file))
      } catch (err) {
        console.warn('[backup] impossibile eliminare il vecchio backup', file, (err as Error).message)
      }
    }
  }

  /**
   * Chiamata periodicamente (vedi main/index.ts, setInterval) per verificare
   * se è il momento di eseguire un backup automatico "a intervallo" (30min/
   * 1h/2h/4h). La modalità "onClose" è gestita invece da window-all-closed:
   * qui viene esplicitamente ignorata per evitare un doppio backup.
   */
  runScheduledBackupIfDue(): void {
    const settings = this.repo.get() as any
    const frequency = settings?.backup_frequency as string | undefined
    const minutes = frequency ? FREQUENCY_MINUTES[frequency] : undefined
    if (!minutes) return
    const elapsedMs = Date.now() - this.lastAutoBackupAt
    if (elapsedMs < minutes * 60_000) return
    const result = this.backupNow()
    if (!result.ok) {
      console.warn('[backup] backup automatico a intervallo non eseguito:', result.reason)
    }
  }
}
