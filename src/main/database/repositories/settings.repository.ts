import type Database from 'better-sqlite3'

/**
 * app_settings è una tabella a riga singola (id='singleton'): un pannello
 * impostazioni con pochi campi noti a priori non giustifica una tabella
 * key/value generica come project_settings.
 */
const ALLOWED_KEYS = new Set(['theme','language','backup_enabled','backup_folder','backup_frequency','backup_max_count','editor_font_size','ui_font_size','spellcheck_enabled','editor_toolbar_tools','sidebar_visible_tools','dictionary_file','dictionary_languages','tags_enabled','comments_enabled','revisions_enabled','activity_log_enabled','editor_bg_light','editor_text_light','editor_bg_dark','editor_text_dark'])

export class SettingsRepository {
  private readonly stmtGet: Database.Statement
  private readonly updateStmtCache = new Map<string, Database.Statement>()

  constructor(private db: Database.Database) {
    this.stmtGet = db.prepare("SELECT * FROM app_settings WHERE id = 'singleton'")
  }

  get() {
    return this.stmtGet.get()
  }

  update(patch: Record<string, unknown>) {
    const keys = Object.keys(patch).filter((key) => ALLOWED_KEYS.has(key))
    if (keys.length === 0) return
    const cacheKey = keys.join(',')
    let stmt = this.updateStmtCache.get(cacheKey)
    if (!stmt) {
      const setClause = keys.map((k) => `${k} = @${k}`).join(', ')
      stmt = this.db.prepare(
        `UPDATE app_settings SET ${setClause}, updated_at = datetime('now') WHERE id = 'singleton'`
      )
      this.updateStmtCache.set(cacheKey, stmt)
    }
    stmt.run(patch)
  }
}
